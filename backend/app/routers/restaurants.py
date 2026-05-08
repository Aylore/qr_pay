import io
import base64
from typing import List

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import Restaurant, RestaurantTable
from app.schemas.schemas import (
    RestaurantResponse, RestaurantUpdate,
    TableCreate, TableResponse,
)
from app.utils.auth import get_current_restaurant
from app.utils.crypto import encrypt_api_key
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/restaurants", tags=["Restaurants"])


@router.get("/me", response_model=RestaurantResponse)
async def get_me(restaurant: Restaurant = Depends(get_current_restaurant)):
    return restaurant


@router.patch("/me", response_model=RestaurantResponse)
async def update_me(
    body: RestaurantUpdate,
    db: AsyncSession = Depends(get_db),
    restaurant: Restaurant = Depends(get_current_restaurant),
):
    if body.name:
        restaurant.name = body.name
    if body.name_ar:
        restaurant.name_ar = body.name_ar
    if body.gateway_api_key:
        restaurant.gateway_api_key_enc = encrypt_api_key(body.gateway_api_key)
    await db.flush()
    await db.refresh(restaurant)
    return restaurant


# ── Tables ────────────────────────────────────────────────────────────────────

def _table_response(table: RestaurantTable) -> dict:
    qr_url = f"{settings.diner_base_url}/t/{str(table.id)}"
    return {
        "id": table.id,
        "table_number": table.table_number,
        "label": table.label,
        "restaurant_id": table.restaurant_id,
        "qr_url": qr_url,
    }


@router.get("/me/tables", response_model=List[TableResponse])
async def list_tables(
    db: AsyncSession = Depends(get_db),
    restaurant: Restaurant = Depends(get_current_restaurant),
):
    result = await db.execute(
        select(RestaurantTable)
        .where(RestaurantTable.restaurant_id == restaurant.id)
        .order_by(RestaurantTable.table_number)
    )
    tables = result.scalars().all()
    return [_table_response(t) for t in tables]


@router.post("/me/tables", response_model=TableResponse, status_code=201)
async def create_table(
    body: TableCreate,
    db: AsyncSession = Depends(get_db),
    restaurant: Restaurant = Depends(get_current_restaurant),
):
    # Check uniqueness
    result = await db.execute(
        select(RestaurantTable).where(
            RestaurantTable.restaurant_id == restaurant.id,
            RestaurantTable.table_number == body.table_number,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Table {body.table_number} already exists")

    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number=body.table_number,
        label=body.label,
    )
    db.add(table)
    await db.flush()
    await db.refresh(table)
    return _table_response(table)


@router.delete("/me/tables/{table_id}", status_code=204)
async def delete_table(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    restaurant: Restaurant = Depends(get_current_restaurant),
):
    result = await db.execute(
        select(RestaurantTable).where(
            RestaurantTable.id == table_id,
            RestaurantTable.restaurant_id == restaurant.id,
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    await db.delete(table)


@router.get("/me/tables/{table_id}/qr")
async def get_table_qr(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    restaurant: Restaurant = Depends(get_current_restaurant),
):
    """Returns a base64-encoded PNG QR code for the table URL."""
    result = await db.execute(
        select(RestaurantTable).where(
            RestaurantTable.id == table_id,
            RestaurantTable.restaurant_id == restaurant.id,
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    url = f"{settings.diner_base_url}/t/{table_id}"
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()

    return {
        "table_id": table_id,
        "table_number": table.table_number,
        "url": url,
        "qr_png_base64": b64,
    }
