"""
Mock Payment Gateway — simulates Amazon Payment Services (APS).

Endpoints exposed under /mock-gateway/:
  POST /sessions              → create a checkout session
  GET  /checkout/{session_id} → hosted payment page (HTML)
  POST /checkout/{session_id}/pay  → simulate card payment (success/fail)
  GET  /checkout/{session_id}/fail → force failure for testing
"""
import hmac
import hashlib
import uuid
import json
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
import httpx

from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/mock-gateway", tags=["Mock Gateway (APS)"])

# In-memory session store (fine for mock — not for production)
_sessions: dict[str, dict] = {}


def _sign_payload(payload: dict, secret: str) -> str:
    canonical = "&".join(f"{k}={v}" for k, v in sorted(payload.items()))
    return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


@router.post("/sessions")
async def create_session(request: Request):
    """
    APS-equivalent: merchant creates a hosted payment session.
    Returns a session_id the diner uses to open the checkout page.
    """
    body = await request.json()
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "session_id": session_id,
        "merchant_id": body.get("merchant_id"),
        "amount": body.get("amount"),
        "currency": body.get("currency", "EGP"),
        "order_id": body.get("order_id"),
        "return_url": body.get("return_url"),
        "webhook_url": body.get("webhook_url"),
        "payment_method": body.get("payment_method", "card"),
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
    }
    return {
        "session_id": session_id,
        "checkout_url": f"{settings.mock_gateway_base_url}/checkout/{session_id}",
        "expires_in": 3600,
    }


@router.get("/checkout/{session_id}", response_class=HTMLResponse)
async def checkout_page(session_id: str):
    """
    Hosted payment page — shown after diner is redirected from the PWA.
    Mimics APS's hosted payment UI.
    """
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Payment session not found or expired")

    amount = session["amount"]
    currency = session["currency"]
    method = session["payment_method"]

    if method == "card":
        payment_html = """
        <div class="field-group">
          <label>Card Number</label>
          <input type="text" placeholder="4111 1111 1111 1111" maxlength="19" id="cardNum"
                 oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/(.{4})/g,'$1 ').trim()"/>
        </div>
        <div class="row">
          <div class="field-group">
            <label>Expiry</label>
            <input type="text" placeholder="MM/YY" maxlength="5"/>
          </div>
          <div class="field-group">
            <label>CVV</label>
            <input type="text" placeholder="123" maxlength="3"/>
          </div>
        </div>
        <div class="field-group">
          <label>Cardholder Name</label>
          <input type="text" placeholder="Name on card"/>
        </div>
        """
    elif method == "vodafone_cash":
        payment_html = """
        <div class="field-group">
          <label>Vodafone Cash Number</label>
          <input type="tel" placeholder="01X XXXX XXXX"/>
        </div>
        <p class="hint">You will receive an OTP on this number to confirm payment.</p>
        """
    else:
        payment_html = """
        <div class="field-group">
          <label>InstaPay Account / IBAN</label>
          <input type="text" placeholder="EG12 XXXX XXXX XXXX XXXX XXXX XXXX"/>
        </div>
        """

    return HTMLResponse(f"""
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Secure Payment — QR Pay</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f4f6f9; min-height: 100vh; display: flex; align-items: center;
           justify-content: center; padding: 1rem; }}
    .card {{ background: white; border-radius: 16px; padding: 2rem; max-width: 420px;
             width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
    .header {{ display: flex; align-items: center; gap: 12px; margin-bottom: 1.5rem; }}
    .lock-icon {{ width: 36px; height: 36px; background: #e8f5e9; border-radius: 50%;
                  display: flex; align-items: center; justify-content: center; font-size: 18px; }}
    h1 {{ font-size: 18px; color: #1a1a2e; }}
    .subtitle {{ font-size: 13px; color: #666; margin-top: 2px; }}
    .amount-box {{ background: #f8f9fa; border-radius: 12px; padding: 1rem 1.25rem;
                   margin-bottom: 1.5rem; display: flex; justify-content: space-between;
                   align-items: center; }}
    .amount-label {{ font-size: 13px; color: #666; }}
    .amount-value {{ font-size: 22px; font-weight: 600; color: #1a1a2e; }}
    .currency {{ font-size: 14px; color: #666; margin-left: 4px; }}
    .field-group {{ margin-bottom: 1rem; }}
    label {{ font-size: 13px; color: #555; font-weight: 500; display: block;
             margin-bottom: 6px; }}
    input {{ width: 100%; padding: 12px 14px; border: 1.5px solid #e0e0e0;
             border-radius: 10px; font-size: 15px; outline: none; transition: border .2s; }}
    input:focus {{ border-color: #4CAF50; }}
    .row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
    .hint {{ font-size: 12px; color: #888; margin-top: 6px; }}
    .pay-btn {{ width: 100%; padding: 14px; background: #2e7d32; color: white;
                border: none; border-radius: 12px; font-size: 16px; font-weight: 600;
                cursor: pointer; margin-top: 0.5rem; transition: background .2s; }}
    .pay-btn:hover {{ background: #1b5e20; }}
    .pay-btn:disabled {{ background: #bdbdbd; cursor: not-allowed; }}
    .fail-btn {{ width: 100%; padding: 10px; background: transparent; color: #c62828;
                 border: 1.5px solid #ef9a9a; border-radius: 12px; font-size: 14px;
                 cursor: pointer; margin-top: 8px; }}
    .secure-badge {{ display: flex; align-items: center; gap: 6px; justify-content: center;
                     margin-top: 1rem; font-size: 12px; color: #999; }}
    .method-badge {{ font-size: 11px; background: #e3f2fd; color: #1565c0;
                     padding: 2px 8px; border-radius: 20px; text-transform: capitalize; }}
    #status-msg {{ text-align: center; padding: 12px; border-radius: 10px;
                   font-size: 14px; margin-top: 1rem; display: none; }}
    .success-msg {{ background: #e8f5e9; color: #2e7d32; }}
    .error-msg {{ background: #ffebee; color: #c62828; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="lock-icon">🔒</div>
      <div>
        <h1>Secure Payment</h1>
        <div class="subtitle">
          Powered by QR Pay &nbsp;·&nbsp;
          <span class="method-badge">{method.replace('_',' ')}</span>
        </div>
      </div>
    </div>

    <div class="amount-box">
      <span class="amount-label">Amount to pay</span>
      <div>
        <span class="amount-value">{amount}</span>
        <span class="currency">{currency}</span>
      </div>
    </div>

    {payment_html}

    <button class="pay-btn" onclick="submitPayment(false)">
      Pay {amount} {currency}
    </button>
    <button class="fail-btn" onclick="submitPayment(true)">
      Simulate payment failure (testing)
    </button>

    <div id="status-msg"></div>

    <div class="secure-badge">
      🔐 256-bit encrypted &nbsp;·&nbsp; PCI DSS compliant (mock)
    </div>
  </div>

  <script>
    async function submitPayment(fail) {{
      const btn = document.querySelector('.pay-btn');
      btn.disabled = true;
      btn.textContent = 'Processing...';

      const res = await fetch('/mock-gateway/checkout/{session_id}/pay', {{
        method: 'POST',
        headers: {{'Content-Type': 'application/json'}},
        body: JSON.stringify({{ simulate_failure: fail }})
      }});
      const data = await res.json();

      const msg = document.getElementById('status-msg');
      msg.style.display = 'block';

      if (data.status === 'SUCCESS') {{
        msg.className = 'success-msg';
        msg.textContent = '✅ Payment successful! You can close this tab.';
      }} else {{
        msg.className = 'error-msg';
        msg.textContent = '❌ Payment failed. Please try again.';
        btn.disabled = false;
        btn.textContent = 'Retry Payment';
      }}
    }}
  </script>
</body>
</html>
""")


@router.post("/checkout/{session_id}/pay")
async def process_payment(session_id: str, request: Request):
    """
    Simulate the actual payment processing.
    Fires a signed webhook back to our orchestrator.
    """
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    body = await request.json()
    simulate_failure = body.get("simulate_failure", False)

    status = "FAILED" if simulate_failure else "SUCCESS"
    session["status"] = status

    # Build webhook payload (APS-style)
    webhook_payload = {
        "session_id": session_id,
        "order_id": session["order_id"],
        "merchant_id": session["merchant_id"],
        "amount": session["amount"],
        "currency": session["currency"],
        "payment_method": session["payment_method"],
        "status": status,
        "timestamp": datetime.utcnow().isoformat(),
    }
    # Sign the payload
    signature = _sign_payload(webhook_payload, settings.mock_gateway_secret)
    webhook_payload["signature"] = signature

    # Fire webhook asynchronously
    webhook_url = session.get("webhook_url", f"{settings.app_base_url}/webhooks/gateway")
    try:
        async with httpx.AsyncClient() as client:
            await client.post(webhook_url, json=webhook_payload, timeout=10.0)
    except Exception as e:
        # Don't fail the payment page if webhook fails — log and move on
        print(f"Webhook delivery failed: {e}")

    return {"status": status, "session_id": session_id}
