# QR Pay — Restaurant Bill Splitting & Payment Orchestrator

Egypt-focused QR-based payment system for restaurants. Diners scan a table QR code, split the bill, and pay via card, Vodafone Cash, or InstaPay — no app download needed.

## Architecture

```
Foodics POS ──webhook──▶  Our Orchestrator  ──API key──▶  Mock Gateway (APS)
                               │   │                            │
                          Redis  PostgreSQL              Webhook callback
                               │
                         WebSocket ──▶  Restaurant Dashboard (live)
                               │
                          Diner PWA (scan QR → pay)
```

**Key principle**: Money flows directly from the diner to the restaurant's own gateway account. We never hold funds. We only orchestrate.

---

## Quick Start (Docker)

```bash
git clone <repo>
cd qr-pay
docker-compose up
```

| Service            | URL                        |
|--------------------|----------------------------|
| Backend API        | http://localhost:8000      |
| API Docs (Swagger) | http://localhost:8000/docs |
| Diner PWA          | http://localhost:5173      |
| Restaurant Dashboard | http://localhost:5174    |

---

## Manual Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your DB and Redis URLs

uvicorn main:app --reload --port 8000
```

### Frontend (Diner PWA)

```bash
cd frontend/diner
npm install
npm run dev   # http://localhost:5173
```

### Frontend (Dashboard)

```bash
cd frontend/dashboard
npm install
npm run dev   # http://localhost:5174
```

---

## Testing the Full Flow

### 1. Register a restaurant

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Cafe Nile","name_ar":"كافيه النيل","email":"test@cafe.com","password":"password123"}'
```

### 2. Login and get a token

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@cafe.com","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

### 3. Create a table

```bash
curl -X POST http://localhost:8000/restaurants/me/tables \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"table_number":"1","label":"نافذة"}'
```

Save the returned `id` as `TABLE_ID` and your restaurant `id` as `RESTAURANT_ID`.

### 4. Simulate a Foodics webhook (inject a bill)

```bash
RESTAURANT_ID=<your-restaurant-id>
TABLE_NUMBER=1

curl -X POST http://localhost:8000/webhooks/foodics/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_id": "'$RESTAURANT_ID'",
    "order_id": "foodics-order-001",
    "table_number": "'$TABLE_NUMBER'",
    "items": [
      {"name":"Grilled Chicken","name_ar":"دجاج مشوي","quantity":2,"unit_price":85,"total_price":170},
      {"name":"Fresh Juice","name_ar":"عصير طازج","quantity":2,"unit_price":35,"total_price":70}
    ],
    "subtotal": 240,
    "tax": 36,
    "total": 276,
    "currency": "EGP"
  }'
```

### 5. Open the diner PWA

Navigate to `http://localhost:5173/t/<table-id>` — this is what the QR code links to.
You'll see the itemised bill. Choose split or pay all. Select a payment method.
You'll be redirected to the mock gateway checkout page.

### 6. Get QR code for a table

```bash
curl http://localhost:8000/restaurants/me/tables/<TABLE_ID>/qr \
  -H "Authorization: Bearer $TOKEN"
```

Returns a base64 PNG you can print and stick on the table.

---

## API Reference

Full interactive docs at `http://localhost:8000/docs`

### Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/login | Restaurant login |
| POST | /auth/register | Register restaurant |
| GET | /restaurants/me/tables | List tables |
| POST | /restaurants/me/tables | Create table |
| GET | /restaurants/me/tables/{id}/qr | Get printable QR |
| GET | /t/{tableId} | **Diner** — get active bill for table |
| POST | /bills | Create bill manually (dashboard) |
| POST | /payments/initiate | **Diner** — initiate payment |
| POST | /webhooks/foodics | Foodics bill webhook |
| POST | /webhooks/foodics/simulate | Dev-only: inject test bill |
| POST | /webhooks/gateway | Mock gateway payment callback |
| WS | /ws/dashboard?token= | Real-time dashboard events |

---

## Project Structure

```
qr-pay/
├── backend/
│   ├── main.py                          # FastAPI app entry point
│   ├── app/
│   │   ├── config.py                    # Settings (env vars)
│   │   ├── database.py                  # SQLAlchemy async engine
│   │   ├── redis_client.py              # Redis async client
│   │   ├── models/models.py             # ORM models
│   │   ├── schemas/schemas.py           # Pydantic schemas
│   │   ├── routers/
│   │   │   ├── auth.py                  # Login / register
│   │   │   ├── restaurants.py           # Restaurant + table management
│   │   │   ├── bills.py                 # Bill CRUD + diner fetch
│   │   │   ├── payments.py              # Initiate payment
│   │   │   ├── webhooks.py              # Foodics + gateway callbacks
│   │   │   └── ws.py                    # WebSocket endpoint
│   │   ├── services/
│   │   │   ├── bill_service.py          # Bill lifecycle + Redis caching
│   │   │   ├── orchestrator.py          # ← Core: steps 8-16
│   │   │   ├── mock_gateway.py          # Mock APS payment gateway
│   │   │   └── ws_manager.py            # WebSocket broadcast manager
│   │   └── utils/
│   │       ├── crypto.py                # AES-256-GCM key encryption
│   │       └── auth.py                  # JWT + password hashing
├── frontend/
│   ├── diner/                           # Diner PWA (scan → split → pay)
│   └── dashboard/                       # Restaurant staff dashboard
└── docker-compose.yml
```

---

## Replacing the Mock Gateway with Real APS

1. Sign up for Amazon Payment Services account
2. Get your merchant ID and access code from the APS dashboard
3. In your restaurant settings, provide your real APS API key via `PATCH /restaurants/me`
4. Replace `mock_gateway.py` calls with real APS endpoints:
   - Session create: `https://checkout.paymentgateway.com/FortAPI/paymentApi`
   - Webhook handling in `webhooks.py` already follows APS signature format

---

## Production Checklist

- [ ] Change `JWT_SECRET_KEY` to a random 64-char string
- [ ] Generate a real `ENCRYPTION_KEY` (`python -c "import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"`)
- [ ] Restrict CORS origins in `main.py`
- [ ] Set `FOODICS_WEBHOOK_SECRET` to the secret Foodics gives you
- [ ] Enable HTTPS (Nginx + Let's Encrypt)
- [ ] Set up PostgreSQL backups
- [ ] Move to a production WSGI server (Gunicorn + Uvicorn workers)
