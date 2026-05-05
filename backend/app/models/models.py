import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Numeric, ForeignKey, DateTime,
    Text, Enum as SAEnum, UniqueConstraint, Boolean
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class BillStatus(str, enum.Enum):
    open = "open"
    partial = "partial"
    settled = "settled"
    cancelled = "cancelled"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class PaymentMethod(str, enum.Enum):
    card = "card"
    vodafone_cash = "vodafone_cash"
    instapay = "instapay"


class Restaurant(Base):
    __tablename__ = "restaurants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    name_ar = Column(String(255))
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    gateway_api_key_enc = Column(Text, nullable=True)
    foodics_webhook_secret = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tables = relationship("RestaurantTable", back_populates="restaurant", cascade="all, delete")
    bills = relationship("Bill", back_populates="restaurant")


class RestaurantTable(Base):
    __tablename__ = "restaurant_tables"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id"), nullable=False)
    table_number = Column(String(50), nullable=False)
    label = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("restaurant_id", "table_number"),)

    restaurant = relationship("Restaurant", back_populates="tables")
    bills = relationship("Bill", back_populates="table")


class Bill(Base):
    __tablename__ = "bills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    table_id = Column(UUID(as_uuid=True), ForeignKey("restaurant_tables.id"), nullable=False)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id"), nullable=False)
    foodics_order_id = Column(String(255), nullable=True, index=True)

    # [{name, name_ar, quantity, unit_price, total_price}]
    items = Column(JSONB, nullable=False, default=list)

    subtotal = Column(Numeric(10, 2), nullable=False)
    tax = Column(Numeric(10, 2), default=0)
    total = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="EGP")
    status = Column(SAEnum(BillStatus), default=BillStatus.open, nullable=False)
    amount_paid = Column(Numeric(10, 2), default=0)

    # Item-level payment tracking.
    # Array of {item_index: int, qty_paid: int} — accumulated across all completed payments.
    # Example: [{item_index: 0, qty_paid: 2}, {item_index: 2, qty_paid: 1}]
    paid_items = Column(JSONB, nullable=False, default=list)

    created_at = Column(DateTime, default=datetime.utcnow)
    settled_at = Column(DateTime, nullable=True)

    table = relationship("RestaurantTable", back_populates="bills")
    restaurant = relationship("Restaurant", back_populates="bills")
    payment_intents = relationship("PaymentIntent", back_populates="bill")


class PaymentIntent(Base):
    __tablename__ = "payment_intents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bill_id = Column(UUID(as_uuid=True), ForeignKey("bills.id"), nullable=False)
    gateway_session_id = Column(String(255), nullable=True, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="EGP")
    payment_method = Column(SAEnum(PaymentMethod), nullable=True)
    status = Column(SAEnum(PaymentStatus), default=PaymentStatus.pending, nullable=False)
    payer_name = Column(String(255), nullable=True)
    payer_phone = Column(String(50), nullable=True)

    # Items covered by this payment intent.
    # [{item_index: int, quantity: int, subtotal: float, tax_share: float}]
    # Null = amount-based payment (equal split or custom), not item-based.
    items_paid = Column(JSONB, nullable=True)

    gateway_response = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    bill = relationship("Bill", back_populates="payment_intents")
