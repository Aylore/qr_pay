from pydantic import BaseModel, EmailStr, UUID4, Field
from typing import Optional, List, Any
from datetime import datetime
from decimal import Decimal
from app.models.models import BillStatus, PaymentStatus, PaymentMethod


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Restaurant ────────────────────────────────────────────────────────────────

class RestaurantCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    email: EmailStr
    password: str


class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    gateway_api_key: Optional[str] = None  # plain, will be encrypted before storage


class RestaurantResponse(BaseModel):
    id: UUID4
    name: str
    name_ar: Optional[str]
    email: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Tables ────────────────────────────────────────────────────────────────────

class TableCreate(BaseModel):
    table_number: str
    label: Optional[str] = None


class TableResponse(BaseModel):
    id: UUID4
    table_number: str
    label: Optional[str]
    restaurant_id: UUID4
    qr_url: Optional[str] = None

    class Config:
        from_attributes = True


# ── Bills ─────────────────────────────────────────────────────────────────────

class BillItem(BaseModel):
    name: str
    name_ar: Optional[str] = None
    quantity: int
    unit_price: Decimal
    total_price: Decimal


class BillCreate(BaseModel):
    """Used for manual bill entry from dashboard."""
    table_id: UUID4
    items: List[BillItem]
    tax: Decimal = Decimal("0")
    currency: str = "EGP"


class FoodicsWebhookPayload(BaseModel):
    """Shape of the webhook Foodics sends when an order is ready to pay."""
    order_id: str
    table_number: str
    items: List[dict]
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    currency: str = "EGP"


class BillResponse(BaseModel):
    id: UUID4
    table_id: UUID4
    restaurant_id: UUID4
    foodics_order_id: Optional[str]
    items: List[Any]
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    currency: str
    status: BillStatus
    amount_paid: Decimal
    amount_remaining: Decimal
    paid_items: List[Any] = []
    created_at: datetime
    settled_at: Optional[datetime]
    payment_intents: List[Any] = []

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_remaining(cls, bill):
        data = {
            "id": bill.id,
            "table_id": bill.table_id,
            "restaurant_id": bill.restaurant_id,
            "foodics_order_id": bill.foodics_order_id,
            "items": bill.items,
            "subtotal": bill.subtotal,
            "tax": bill.tax,
            "total": bill.total,
            "currency": bill.currency,
            "status": bill.status,
            "amount_paid": bill.amount_paid,
            "amount_remaining": bill.total - bill.amount_paid,
            "paid_items": bill.paid_items or [],
            "created_at": bill.created_at,
            "settled_at": bill.settled_at,
            "payment_intents": [
                {
                    "id": str(pi.id),
                    "amount": float(pi.amount),
                    "status": pi.status,
                    "payment_method": pi.payment_method,
                    "payer_name": pi.payer_name,
                    "created_at": pi.created_at.isoformat(),
                }
                for pi in bill.payment_intents
            ],
        }
        return cls(**data)


# ── Payments ──────────────────────────────────────────────────────────────────

class SelectedItem(BaseModel):
    item_index: int
    quantity: int


class InitiatePaymentRequest(BaseModel):
    bill_id: UUID4
    amount: Decimal = Field(gt=0)
    payment_method: PaymentMethod
    payer_name: Optional[str] = None
    payer_phone: Optional[str] = None
    # For item-based splits — list of items this payment covers.
    # If None, treated as amount-based (equal or custom split).
    items_paid: Optional[List[SelectedItem]] = None


class InitiatePaymentResponse(BaseModel):
    payment_intent_id: UUID4
    checkout_url: str
    amount: Decimal
    currency: str


class PaymentIntentResponse(BaseModel):
    id: UUID4
    bill_id: UUID4
    gateway_session_id: Optional[str]
    amount: Decimal
    currency: str
    payment_method: Optional[PaymentMethod]
    status: PaymentStatus
    payer_name: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Mock Gateway (internal) ───────────────────────────────────────────────────

class MockGatewaySessionCreate(BaseModel):
    merchant_id: str
    amount: Decimal
    currency: str
    order_id: str
    return_url: str
    webhook_url: str
    payment_method: str


class MockGatewayWebhookPayload(BaseModel):
    session_id: str
    order_id: str
    status: str  # "SUCCESS" | "FAILED"
    amount: Decimal
    currency: str
    payment_method: str
    merchant_id: str
    signature: str
