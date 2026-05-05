"""
Payment orchestrator — the heart of the system.

Steps (from architecture):
  8.  Receive initiate payment request
  9.  Acquire Redis lock on this payment portion
  10. Fetch + decrypt restaurant's gateway API key
  11. Call mock gateway (using restaurant's credentials) to create a payment session
  12. Return checkout URL to diner
  13. On webhook: verify signature, update bill, broadcast to dashboard
"""
import uuid
import hmac
import hashlib
import logging
from decimal import Decimal

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.models import Bill, PaymentIntent, PaymentStatus, Restaurant
from app.services.bill_service import (
    acquire_payment_lock,
    release_payment_lock,
    get_bill_from_db,
    record_payment_completed,
    record_payment_failed,
    compute_item_amounts,
)
from app.services.ws_manager import ws_manager
from app.utils.crypto import decrypt_api_key
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class PaymentOrchestrator:

    async def initiate_payment(
        self,
        db: AsyncSession,
        bill: Bill,
        amount: Decimal,
        payment_method: str,
        payer_name: str | None,
        payer_phone: str | None,
        selected_items: list | None = None,
    ) -> dict:
        """
        Steps 8-12: lock → decrypt key → call gateway → return checkout URL.
        selected_items: [{item_index, quantity}] for item-based splits, None for amount-based.
        """
        # For item-based payments, recompute amount including proportional tax
        items_paid_payload = None
        if selected_items:
            amount, _, items_paid_payload = compute_item_amounts(
                items=bill.items,
                selected=selected_items,
                total_subtotal=bill.subtotal,
                total_tax=bill.tax,
            )

        # Step 9 — acquire Redis lock (keyed on amount so concurrent same-amount payments are blocked)
        lock_key_suffix = str(amount)
        lock_acquired = await acquire_payment_lock(str(bill.id), lock_key_suffix)
        if not lock_acquired:
            raise ValueError("A payment for this amount is already in progress. Please wait.")

        try:
            # Step 10 — fetch and decrypt restaurant's gateway API key
            restaurant = await db.get(Restaurant, bill.restaurant_id)
            if not restaurant:
                raise ValueError("Restaurant not found")

            if restaurant.gateway_api_key_enc:
                api_key = decrypt_api_key(restaurant.gateway_api_key_enc)
            else:
                api_key = "mock-merchant-id-demo"

            # Create a payment intent record in DB (status = pending)
            payment_intent = PaymentIntent(
                bill_id=bill.id,
                amount=amount,
                currency=bill.currency,
                payment_method=payment_method,
                status=PaymentStatus.pending,
                payer_name=payer_name,
                payer_phone=payer_phone,
                items_paid=items_paid_payload,
            )
            db.add(payment_intent)
            await db.flush()
            await db.refresh(payment_intent)

            # Step 11 — call mock gateway using restaurant's credentials
            checkout_url = await self._create_gateway_session(
                api_key=api_key,
                payment_intent_id=str(payment_intent.id),
                bill_id=str(bill.id),
                amount=amount,
                currency=bill.currency,
                payment_method=payment_method,
            )

            return {
                "payment_intent_id": str(payment_intent.id),
                "checkout_url": checkout_url,
                "amount": float(amount),
                "currency": bill.currency,
            }

        except Exception:
            # Release lock on any failure so the diner can retry
            await release_payment_lock(str(bill.id), amount)
            raise

    async def _create_gateway_session(
        self,
        api_key: str,
        payment_intent_id: str,
        bill_id: str,
        amount: Decimal,
        currency: str,
        payment_method: str,
    ) -> str:
        """
        Step 11 — call the mock gateway (APS-style) to create a hosted checkout session.
        Returns the checkout URL to redirect the diner to.
        """
        webhook_url = f"{settings.app_base_url}/webhooks/gateway"
        return_url = f"{settings.app_base_url.replace("8000","5173")}/t/{bill_id}/confirm?bill_id={bill_id}&amount={float(amount)}"

        payload = {
            "merchant_id": api_key,
            "amount": float(amount),
            "currency": currency,
            "order_id": payment_intent_id,
            "return_url": return_url,
            "webhook_url": webhook_url,
            "payment_method": payment_method,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.mock_gateway_base_url}/sessions",
                json=payload,
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

        session_id = data["session_id"]
        checkout_url = f"{settings.mock_gateway_base_url}/checkout/{session_id}"
        return checkout_url

    async def handle_gateway_webhook(
        self,
        db: AsyncSession,
        payload: dict,
        raw_signature: str,
    ):
        """
        Steps 13-16: verify signature → update DB → broadcast to dashboard.
        """
        # Step 13 — verify webhook signature
        if not self._verify_gateway_signature(payload, raw_signature):
            logger.warning("Gateway webhook signature verification failed")
            raise ValueError("Invalid webhook signature")

        order_id = payload.get("order_id")
        status = payload.get("status")
        gateway_session_id = payload.get("session_id")

        # Fetch the payment intent
        result = await db.execute(
            select(PaymentIntent)
            .where(PaymentIntent.id == uuid.UUID(order_id))
            .options(selectinload(PaymentIntent.bill))
        )
        payment_intent = result.scalar_one_or_none()
        if not payment_intent:
            logger.error(f"PaymentIntent not found for order_id={order_id}")
            return

        payment_intent.gateway_session_id = gateway_session_id

        # Release the Redis lock regardless of outcome
        await release_payment_lock(str(payment_intent.bill_id), payment_intent.amount)

        bill = payment_intent.bill

        if status == "SUCCESS":
            # Steps 14-15 — update bill, mark settled if fully paid
            await record_payment_completed(db, bill, payment_intent, payload)
            await db.commit()

            # Step 16 — broadcast to restaurant dashboard
            if bill.status.value == "settled":
                await ws_manager.broadcast_bill_settled(
                    str(bill.restaurant_id), str(bill.id)
                )
            else:
                await ws_manager.broadcast_payment_update(
                    str(bill.restaurant_id),
                    str(bill.id),
                    {
                        "amount_paid": float(bill.amount_paid),
                        "amount_remaining": float(bill.total - bill.amount_paid),
                        "status": bill.status.value,
                        "payment_intent_id": str(payment_intent.id),
                    },
                )
        else:
            await record_payment_failed(db, payment_intent, payload)
            await db.commit()
            await ws_manager.broadcast_payment_update(
                str(bill.restaurant_id),
                str(bill.id),
                {"payment_intent_id": str(payment_intent.id), "status": "failed"},
            )

    def _verify_gateway_signature(self, payload: dict, signature: str) -> bool:
        """Verify HMAC-SHA256 signature from mock gateway."""
        secret = settings.mock_gateway_secret
        # Build canonical string: sorted key=value pairs, joined with &
        canonical = "&".join(
            f"{k}={v}"
            for k, v in sorted(payload.items())
            if k != "signature"
        )
        expected = hmac.new(
            secret.encode(), canonical.encode(), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)



orchestrator = PaymentOrchestrator()
