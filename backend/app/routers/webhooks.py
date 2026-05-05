"""
Webhooks router — receives signed POST requests from:
  1. Foodics — new itemised bill ready for payment
  2. Mock gateway (APS) — payment succeeded or failed
"""
import hmac
import hashlib
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import Restaurant, RestaurantTable
from app.schemas.schemas import FoodicsWebhookPayload
from app.services.bill_service import create_bill
from app.services.orchestrator import orchestrator
from app.services.ws_manager import ws_manager
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


def _verify_hmac(body: bytes, signature: str, secret: str) -> bool:
    """Verify HMAC-SHA256 signature from Foodics or the mock gateway."""
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/foodics")
async def foodics_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_foodics_signature: str = Header(None, alias="X-Foodics-Signature"),
    x_restaurant_id: str = Header(None, alias="X-Restaurant-Id"),
):
    """
    Step 1-4 — Foodics pushes a bill when an order is ready for payment.

    Foodics sends:
      - X-Foodics-Signature: HMAC-SHA256 of body using restaurant's webhook secret
      - X-Restaurant-Id: our restaurant UUID
      - Body: FoodicsWebhookPayload JSON
    """
    raw_body = await request.body()

    if not x_restaurant_id:
        raise HTTPException(status_code=400, detail="Missing X-Restaurant-Id header")

    # Fetch the restaurant
    result = await db.execute(
        select(Restaurant).where(Restaurant.id == uuid.UUID(x_restaurant_id))
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # Step 2 — verify webhook signature
    secret = restaurant.foodics_webhook_secret or settings.foodics_webhook_secret
    if x_foodics_signature and not _verify_hmac(raw_body, x_foodics_signature, secret):
        raise HTTPException(status_code=401, detail="Invalid Foodics webhook signature")

    import json
    payload_data = json.loads(raw_body)
    payload = FoodicsWebhookPayload(**payload_data)

    # Find the table by table_number within this restaurant
    result = await db.execute(
        select(RestaurantTable).where(
            RestaurantTable.restaurant_id == restaurant.id,
            RestaurantTable.table_number == payload.table_number,
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(
            status_code=404,
            detail=f"Table '{payload.table_number}' not found for this restaurant"
        )

    # Normalise items from Foodics format
    items = []
    for item in payload.items:
        items.append({
            "name": item.get("name", ""),
            "name_ar": item.get("name_ar", ""),
            "quantity": item.get("quantity", 1),
            "unit_price": float(item.get("unit_price", 0)),
            "total_price": float(item.get("total_price", 0)),
        })

    # Step 3 — write to DB + Redis
    bill = await create_bill(
        db=db,
        table_id=table.id,
        restaurant_id=restaurant.id,
        items=items,
        subtotal=Decimal(str(payload.subtotal)),
        tax=Decimal(str(payload.tax)),
        total=Decimal(str(payload.total)),
        currency=payload.currency,
        foodics_order_id=payload.order_id,
    )
    await db.commit()

    # Step 4 — broadcast to restaurant dashboard
    await ws_manager.broadcast_bill_created(
        str(restaurant.id),
        {
            "id": str(bill.id),
            "table_id": str(table.id),
            "table_number": table.table_number,
            "total": float(bill.total),
            "status": bill.status.value,
            "currency": bill.currency,
            "items": bill.items,
            "created_at": bill.created_at.isoformat(),
        },
    )

    return {"status": "accepted", "bill_id": str(bill.id)}


@router.post("/foodics/simulate")
async def simulate_foodics_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Dev-only endpoint — simulate a Foodics webhook without signature verification.
    Use this to inject a test bill during development.
    POST /webhooks/foodics/simulate with JSON body matching FoodicsWebhookPayload
    plus {"restaurant_id": "..."}
    """
    import json
    body = await request.json()
    restaurant_id = body.pop("restaurant_id", None)
    if not restaurant_id:
        raise HTTPException(status_code=400, detail="restaurant_id required")

    result = await db.execute(
        select(Restaurant).where(Restaurant.id == uuid.UUID(restaurant_id))
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    payload = FoodicsWebhookPayload(**body)

    result = await db.execute(
        select(RestaurantTable).where(
            RestaurantTable.restaurant_id == restaurant.id,
            RestaurantTable.table_number == payload.table_number,
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail=f"Table '{payload.table_number}' not found")

    items = [
        {
            "name": i.get("name", ""),
            "name_ar": i.get("name_ar", ""),
            "quantity": i.get("quantity", 1),
            "unit_price": float(i.get("unit_price", 0)),
            "total_price": float(i.get("total_price", 0)),
        }
        for i in payload.items
    ]

    bill = await create_bill(
        db=db,
        table_id=table.id,
        restaurant_id=restaurant.id,
        items=items,
        subtotal=Decimal(str(payload.subtotal)),
        tax=Decimal(str(payload.tax)),
        total=Decimal(str(payload.total)),
        currency=payload.currency,
        foodics_order_id=payload.order_id,
    )
    await db.commit()

    await ws_manager.broadcast_bill_created(
        str(restaurant.id),
        {
            "id": str(bill.id),
            "table_id": str(table.id),
            "table_number": table.table_number,
            "total": float(bill.total),
            "status": bill.status.value,
            "currency": bill.currency,
            "items": bill.items,
            "created_at": bill.created_at.isoformat(),
        },
    )

    return {"status": "simulated", "bill_id": str(bill.id)}


@router.post("/gateway")
async def gateway_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Steps 13-16 — Mock gateway (APS) fires this when a payment completes or fails.
    """
    payload = await request.json()
    signature = payload.get("signature", "")

    try:
        await orchestrator.handle_gateway_webhook(db, payload, signature)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "ok"}
