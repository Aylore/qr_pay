from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import Restaurant
from app.schemas.schemas import LoginRequest, TokenResponse, RestaurantCreate, RestaurantResponse
from app.utils.auth import verify_password, hash_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Restaurant).where(Restaurant.email == body.email)
    )
    restaurant = result.scalar_one_or_none()
    if not restaurant or not verify_password(body.password, restaurant.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(str(restaurant.id))
    return TokenResponse(access_token=token)


@router.post("/register", response_model=RestaurantResponse, status_code=201)
async def register(body: RestaurantCreate, db: AsyncSession = Depends(get_db)):
    """Register a new restaurant. In production, restrict this endpoint."""
    result = await db.execute(
        select(Restaurant).where(Restaurant.email == body.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    restaurant = Restaurant(
        name=body.name,
        name_ar=body.name_ar,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    db.add(restaurant)
    await db.flush()
    await db.refresh(restaurant)
    return restaurant
