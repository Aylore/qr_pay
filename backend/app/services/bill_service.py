"""
Bill service — owns the full bill lifecycle:
  create → cache → serve → lock → record payment → settle

Item-level tracking
-------------------
Bill.paid_items  = [{item_index, qty_paid}]  — cumulative across all payments
PaymentIntent.items_paid = [{item_index, quantity, subtotal, tax_share}] — per payment

Tax is split proportionally:
  payment_tax = total_tax × (payment_items_subtotal / total_subtotal)
"""
import json
import uuid
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.models import Bill, BillStatus, RestaurantTable, PaymentIntent, PaymentStatus
from app.redis_client import get_redis

logger = logging.getLogger(__name__)

BILL_TTL_SECONDS = 4 * 60 * 60
LOCK_TTL_SECONDS = 60


def _bill_key(table_id: str) -> str:
    return f"bill:table:{table_id}"


def _lock_key(bill_id: str, portion_key: str) -> str:
    return f"lock:payment:{bill_id}:{portion_key}"


def _serialize_bill(bill: Bill) -> dict:
    return {
        "id": str(bill.id),
        "table_id": str(bill.table_id),
        "restaurant_id": str(bill.restaurant_id),
        "foodics_order_id": bill.foodics_order_id,
        "items": bill.items,
        "subtotal": float(bill.subtotal),
        "tax": float(bill.tax),
        "total": float(bill.total),
        "currency": bill.currency,
        "status": bill.status.value,
        "amount_paid": float(bill.amount_paid),
        "amount_remaining": float(bill.total - bill.amount_paid),
        "paid_items": bill.paid_items or [],
        "created_at": bill.created_at.isoformat(),
    }


def compute_item_amounts(
    items: list,
    selected: list,  # [{item_index, quantity}]
    total_subtotal: Decimal,
    total_tax: Decimal,
) -> tuple[Decimal, Decimal, list]:
    """
    Given a list of selected items with quantities, compute:
      - items_subtotal: sum of item prices for selected quantities
      - tax_share: proportional tax
      - items_paid payload: [{item_index, quantity, subtotal, tax_share}]
    """
    items_subtotal = Decimal("0")
    items_paid_payload = []

    for sel in selected:
        idx = sel["item_index"]
        qty = sel["quantity"]
        item = items[idx]
        unit_price = Decimal(str(item["total_price"])) / Decimal(str(item["quantity"]))
        line_subtotal = (unit_price * qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        items_subtotal += line_subtotal
        items_paid_payload.append({
            "item_index": idx,
            "quantity": qty,
            "subtotal": float(line_subtotal),
            "tax_share": 0.0,  # filled below
        })

    # Proportional tax
    if total_subtotal > 0:
        tax_share = (total_tax * items_subtotal / total_subtotal).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    else:
        tax_share = Decimal("0")

    # Distribute tax_share proportionally across items
    for entry in items_paid_payload:
        entry["tax_share"] = float(
            (tax_share * Decimal(str(entry["subtotal"])) / items_subtotal).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ) if items_subtotal > 0 else Decimal("0")
        )

    total_amount = items_subtotal + tax_share
    return total_amount, tax_share, items_paid_payload


def merge_paid_items(existing: list, new_items: list) -> list:
    """
    Merge new item payments into the bill's cumulative paid_items list.
    Accumulates qty_paid per item_index.
    """
    index_map = {e["item_index"]: e["qty_paid"] for e in existing}
    for entry in new_items:
        idx = entry["item_index"]
        index_map[idx] = index_map.get(idx, 0) + entry["quantity"]
    return [{"item_index": k, "qty_paid": v} for k, v in sorted(index_map.items())]


async def create_bill(
    db: AsyncSession,
    table_id: uuid.UUID,
    restaurant_id: uuid.UUID,
    items: list,
    subtotal: Decimal,
    tax: Decimal,
    total: Decimal,
    currency: str = "EGP",
    foodics_order_id: Optional[str] = None,
) -> Bill:
    bill = Bill(
        table_id=table_id,
        restaurant_id=restaurant_id,
        foodics_order_id=foodics_order_id,
        items=items,
        subtotal=subtotal,
        tax=tax,
        total=total,
        currency=currency,
        status=BillStatus.open,
        amount_paid=Decimal("0"),
        paid_items=[],
    )
    db.add(bill)
    await db.flush()
    await db.refresh(bill)

    redis = await get_redis()
    await redis.setex(
        _bill_key(str(table_id)),
        BILL_TTL_SECONDS,
        json.dumps(_serialize_bill(bill)),
    )
    return bill


async def get_active_bill_for_table(table_id: str) -> Optional[dict]:
    redis = await get_redis()
    cached = await redis.get(_bill_key(table_id))
    if cached:
        return json.loads(cached)
    return None


async def get_bill_from_db(db: AsyncSession, bill_id: uuid.UUID) -> Optional[Bill]:
    result = await db.execute(
        select(Bill)
        .where(Bill.id == bill_id)
        .options(selectinload(Bill.payment_intents))
    )
    return result.scalar_one_or_none()


async def get_bills_for_restaurant(db: AsyncSession, restaurant_id: uuid.UUID) -> list[Bill]:
    result = await db.execute(
        select(Bill)
        .where(Bill.restaurant_id == restaurant_id)
        .options(selectinload(Bill.payment_intents))
        .order_by(Bill.created_at.desc())
        .limit(100)
    )
    return result.scalars().all()


async def acquire_payment_lock(bill_id: str, lock_key_suffix: str) -> bool:
    redis = await get_redis()
    lock_key = _lock_key(bill_id, lock_key_suffix)
    acquired = await redis.set(lock_key, "1", nx=True, ex=LOCK_TTL_SECONDS)
    return bool(acquired)


async def release_payment_lock(bill_id: str, lock_key_suffix: str):
    redis = await get_redis()
    lock_key = _lock_key(bill_id, lock_key_suffix)
    await redis.delete(lock_key)


async def record_payment_completed(
    db: AsyncSession,
    bill: Bill,
    payment_intent: PaymentIntent,
    gateway_response: dict,
) -> Bill:
    payment_intent.status = PaymentStatus.completed
    payment_intent.completed_at = datetime.utcnow()
    payment_intent.gateway_response = gateway_response

    # Update amount_paid
    new_amount_paid = bill.amount_paid + payment_intent.amount
    bill.amount_paid = new_amount_paid

    # Merge item-level paid tracking
    if payment_intent.items_paid:
        bill.paid_items = merge_paid_items(
            bill.paid_items or [], payment_intent.items_paid
        )

    if new_amount_paid >= bill.total:
        bill.status = BillStatus.settled
        bill.settled_at = datetime.utcnow()
        redis = await get_redis()
        await redis.delete(_bill_key(str(bill.table_id)))
    else:
        bill.status = BillStatus.partial
        redis = await get_redis()
        await redis.setex(
            _bill_key(str(bill.table_id)),
            BILL_TTL_SECONDS,
            json.dumps(_serialize_bill(bill)),
        )

    await db.flush()
    return bill


async def record_payment_failed(
    db: AsyncSession,
    payment_intent: PaymentIntent,
    gateway_response: dict,
):
    payment_intent.status = PaymentStatus.failed
    payment_intent.completed_at = datetime.utcnow()
    payment_intent.gateway_response = gateway_response
    await db.flush()
