import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.database import get_db
from app.models.models import Bill, BillStatus, PaymentIntent, PaymentStatus
from app.schemas.schemas import InitiatePaymentRequest, InitiatePaymentResponse
from app.services.orchestrator import orchestrator

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/initiate", response_model=InitiatePaymentResponse)
async def initiate_payment(
    body: InitiatePaymentRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Step 8 — diner hits Pay. No auth required (diner doesn't have an account).
    Validates the bill, then hands off to the orchestrator.
    """
    result = await db.execute(
        select(Bill)
        .where(Bill.id == body.bill_id)
        .options(selectinload(Bill.payment_intents))
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    if bill.status == BillStatus.settled:
        raise HTTPException(status_code=400, detail="This bill is already fully paid")
    if bill.status == BillStatus.cancelled:
        raise HTTPException(status_code=400, detail="This bill has been cancelled")

    # Validate amount doesn't exceed what's remaining
    remaining = bill.total - bill.amount_paid
    if body.amount > remaining + Decimal("0.01"):  # small tolerance for rounding
        raise HTTPException(
            status_code=400,
            detail=f"Amount {body.amount} exceeds remaining balance {remaining}",
        )

    try:
        selected_items = None
        if body.items_paid:
            selected_items = [
                {"item_index": i.item_index, "quantity": i.quantity}
                for i in body.items_paid
            ]
        result = await orchestrator.initiate_payment(
            db=db,
            bill=bill,
            amount=body.amount,
            payment_method=body.payment_method.value,
            payer_name=body.payer_name,
            payer_phone=body.payer_phone,
            selected_items=selected_items,
        )
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/{payment_intent_id}/result", response_class=HTMLResponse)
async def payment_result(
    payment_intent_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return URL — shown after the mock gateway redirects the diner back.
    In production this would redirect back to the PWA with status.
    """
    result = await db.execute(
        select(PaymentIntent).where(PaymentIntent.id == uuid.UUID(payment_intent_id))
    )
    intent = result.scalar_one_or_none()

    if not intent:
        status_text = "Payment not found"
        emoji = "❓"
        color = "#666"
    elif intent.status == PaymentStatus.completed:
        status_text = "Payment successful! You're all set."
        emoji = "✅"
        color = "#2e7d32"
    elif intent.status == PaymentStatus.failed:
        status_text = "Payment failed. Please go back and try again."
        emoji = "❌"
        color = "#c62828"
    else:
        status_text = "Payment is being processed..."
        emoji = "⏳"
        color = "#e65100"

    return HTMLResponse(f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payment Result</title>
  <style>
    body {{ font-family: -apple-system, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; background: #f4f6f9; padding: 2rem; }}
    .card {{ background: white; border-radius: 16px; padding: 2.5rem; max-width: 360px;
             width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
    .emoji {{ font-size: 56px; margin-bottom: 1rem; }}
    p {{ color: {color}; font-size: 17px; font-weight: 500; line-height: 1.5; }}
    a {{ display: block; margin-top: 1.5rem; color: #1565c0; font-size: 14px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">{emoji}</div>
    <p>{status_text}</p>
    <a href="javascript:window.close()">Close this tab</a>
  </div>
</body>
</html>
""")
