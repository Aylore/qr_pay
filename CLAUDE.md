# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

QR-based restaurant payment system for Egypt. Diners scan a table QR code, see an itemized bill, optionally split costs, and pay via card, Vodafone Cash, or InstaPay — no app download needed. The system orchestrates payments but never holds funds; money flows directly from diner to restaurant's payment gateway account.

## Development Commands

### Full Stack (Docker)
```bash
docker-compose up          # starts postgres:5433, redis:6380, backend:8000, diner:5173, dashboard:5174
```

### Backend Only
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # fill in values before running
uvicorn main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`.

### Frontend (Diner PWA — port 5173)
```bash
cd frontend/diner && npm install && npm run dev
```

### Frontend (Restaurant Dashboard — port 5174)
```bash
cd frontend/dashboard && npm install && npm run dev
```

No test suite or linter is configured yet.

## Architecture

### Payment Flow (end-to-end)
1. Foodics POS fires webhook → `POST /webhooks/foodics`
2. `orchestrator.py` stores bill in PostgreSQL, caches in Redis (4h TTL), broadcasts `bill_created` over WebSocket
3. Diner scans QR → `GET /t/{tableId}` → diner PWA renders bill
4. Diner picks items/split → `POST /payments/initiate` → orchestrator acquires Redis lock, decrypts restaurant's gateway key, calls mock gateway to create session, returns `checkout_url`
5. Diner completes payment on mock gateway page → gateway fires `POST /webhooks/gateway` with HMAC signature
6. Orchestrator verifies signature, updates bill/payment status, releases lock, broadcasts `payment_update` or `bill_settled`

### Key Design Decisions
- **Redis distributed lock** (60s TTL) on `(bill_id, amount)` prevents concurrent payment races
- **AES-256-GCM** encryption for stored gateway API keys — decrypted in memory only during a transaction (`app/utils/crypto.py`)
- **Item-level payment tracking**: `Bill.paid_items` accumulates `[{item_index, qty_paid}]` across all payments; tax is split proportionally per `PaymentIntent.items_paid`
- Backend is **fully async** (SQLAlchemy asyncio + asyncpg + aioredis)

### Services Layer (`backend/app/services/`)
| File | Role |
|---|---|
| `orchestrator.py` | Core coordinator — lock, decrypt, call gateway, handle webhook |
| `bill_service.py` | Bill lifecycle: create, fetch active, acquire lock, record payment, merge paid items |
| `mock_gateway.py` | Simulated APS-style gateway: sessions, hosted checkout HTML page, payment processing + webhook dispatch |
| `ws_manager.py` | WebSocket connection registry and broadcast |

### Routers (`backend/app/routers/`)
| Router | Prefix | Purpose |
|---|---|---|
| `auth.py` | `/auth` | Restaurant login/register, JWT issuance |
| `restaurants.py` | `/restaurants` | Table CRUD, QR code generation |
| `bills.py` | `/bills`, `/t/{tableId}` | Bill CRUD, diner bill fetch |
| `payments.py` | `/payments` | Diner payment initiation |
| `webhooks.py` | `/webhooks` | Foodics inbound + gateway callback (HMAC-verified) |
| `ws.py` | `/ws` | Dashboard WebSocket (JWT-authenticated) |

### Database Models (`backend/app/models/models.py`)
- **Restaurant** — credentials, AES-encrypted `gateway_api_key_enc`, `foodics_webhook_secret`
- **RestaurantTable** — belongs to restaurant, has stable UUID used in QR URLs
- **Bill** — `items` (JSONB array), `status` enum (`open/partial/settled/cancelled`), `paid_items` (JSONB cumulative)
- **PaymentIntent** — per-payment record with `items_paid` (JSONB), `gateway_session_id`, `gateway_response`

### Frontend Apps
Both are Vite + React 18 + React Router 6 SPAs.

**Diner PWA** (`frontend/diner/src/pages/`):
- `BillPage` → `SplitPage` → `PayPage` → `ConfirmPage`

**Restaurant Dashboard** (`frontend/dashboard/src/pages/`):
- `LoginPage` → `TablesPage` / `BillDetailPage` / `ManualBillPage` / `SettingsPage`
- `useWebSocket` hook (`src/hooks/useWebSocket.js`) drives real-time updates

### Environment Variables
Defined in `backend/.env.example`. Key ones:
- `DATABASE_URL` — asyncpg connection string
- `REDIS_URL` — Redis connection string
- `ENCRYPTION_KEY` — base64-encoded 32-byte key for AES-256-GCM
- `JWT_SECRET_KEY` — HS256 signing secret
- `APP_BASE_URL` / `MOCK_GATEWAY_BASE_URL` — used to build QR URLs and checkout redirect URLs
- `MOCK_GATEWAY_SECRET` / `FOODICS_WEBHOOK_SECRET` — HMAC verification

In Docker, services communicate over the internal network; host-side the ports are offset by 1 (postgres→5433, redis→6380).

## Database Migrations

Alembic is installed but no migrations directory is committed yet. Schema is currently managed via `Base.metadata.create_all()` at startup (`backend/app/database.py`).
