import uuid
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.models import Restaurant, RestaurantTable, Bill, BillStatus
from app.schemas.schemas import BillCreate, BillResponse
from app.services.bill_service import (
    create_bill,
    get_active_bill_for_table,
    get_bill_from_db,
    get_bills_for_restaurant,
)
from app.services.ws_manager import ws_manager
from app.utils.auth import get_current_restaurant

router = APIRouter(tags=["Bills"])


# ── Diner endpoint (no auth) ──────────────────────────────────────────────────

@router.get("/t/{table_id}")
async def get_bill_for_diner(table_id: str, db: AsyncSession = Depends(get_db)):
    """
    Step 6 — serve the active bill to a diner who just scanned the QR code.
    Reads from Redis first (fast), falls back to DB.
    """
    # Fast path: Redis
    cached = await get_active_bill_for_table(table_id)
    if cached:
        return cached

    # Slow path: check DB for most recent open bill on this table
    result = await db.execute(
        select(Bill)
        .where(
            Bill.table_id == uuid.UUID(table_id),
            Bill.status.in_([BillStatus.open, BillStatus.partial]),
        )
        .options(selectinload(Bill.payment_intents))
        .order_by(Bill.created_at.desc())
        .limit(1)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="No active bill for this table. Please ask your waiter.")

    return BillResponse.from_orm_with_remaining(bill)


# ── Dashboard endpoints (JWT required) ────────────────────────────────────────

@router.get("/bills", response_model=List[dict])
async def list_bills(
    db: AsyncSession = Depends(get_db),
    restaurant=Depends(get_current_restaurant),
):
    bills = await get_bills_for_restaurant(db, restaurant.id)
    return [
        {
            "id": str(b.id),
            "table_id": str(b.table_id),
            "foodics_order_id": b.foodics_order_id,
            "total": float(b.total),
            "amount_paid": float(b.amount_paid),
            "amount_remaining": float(b.total - b.amount_paid),
            "status": b.status.value,
            "currency": b.currency,
            "items_count": len(b.items) if b.items else 0,
            "created_at": b.created_at.isoformat(),
            "settled_at": b.settled_at.isoformat() if b.settled_at else None,
        }
        for b in bills
    ]


@router.get("/bills/{bill_id}")
async def get_bill(
    bill_id: str,
    db: AsyncSession = Depends(get_db),
    restaurant=Depends(get_current_restaurant),
):
    bill = await get_bill_from_db(db, uuid.UUID(bill_id))
    if not bill or str(bill.restaurant_id) != str(restaurant.id):
        raise HTTPException(status_code=404, detail="Bill not found")
    return BillResponse.from_orm_with_remaining(bill)


@router.post("/bills", response_model=dict, status_code=201)
async def create_bill_manually(
    body: BillCreate,
    db: AsyncSession = Depends(get_db),
    restaurant=Depends(get_current_restaurant),
):
    """
    Manual bill entry from dashboard — for restaurants without POS integration.
    Staff enters items manually and the bill becomes live immediately.
    """
    # Verify table belongs to this restaurant
    result = await db.execute(
        select(RestaurantTable).where(
            RestaurantTable.id == body.table_id,
            RestaurantTable.restaurant_id == restaurant.id,
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    items_data = [item.model_dump() for item in body.items]
    subtotal = sum(Decimal(str(i["total_price"])) for i in items_data)
    tax = body.tax
    total = subtotal + tax

    bill = await create_bill(
        db=db,
        table_id=body.table_id,
        restaurant_id=restaurant.id,
        items=[
            {
                **i,
                "unit_price": float(i["unit_price"]),
                "total_price": float(i["total_price"]),
            }
            for i in items_data
        ],
        subtotal=subtotal,
        tax=tax,
        total=total,
        currency=body.currency,
    )
    await db.commit()

    bill_data = {
        "id": str(bill.id),
        "table_id": str(bill.table_id),
        "table_number": table.table_number,
        "total": float(bill.total),
        "status": bill.status.value,
        "currency": bill.currency,
        "items": bill.items,
        "created_at": bill.created_at.isoformat(),
    }

    # Broadcast to restaurant dashboard
    await ws_manager.broadcast_bill_created(str(restaurant.id), bill_data)
    return bill_data


@router.delete("/bills/{bill_id}", status_code=204)
async def cancel_bill(
    bill_id: str,
    db: AsyncSession = Depends(get_db),
    restaurant=Depends(get_current_restaurant),
):
    bill = await get_bill_from_db(db, uuid.UUID(bill_id))
    if not bill or str(bill.restaurant_id) != str(restaurant.id):
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status == BillStatus.settled:
        raise HTTPException(status_code=400, detail="Cannot cancel a settled bill")
    bill.status = BillStatus.cancelled
    await db.commit()
