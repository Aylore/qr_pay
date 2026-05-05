from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import init_db
from app.redis_client import close_redis
from app.routers import auth, restaurants, bills, payments, webhooks, ws
from app.services.mock_gateway import router as mock_gateway_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    await init_db()
    yield
    # Shutdown: close Redis
    await close_redis()


app = FastAPI(
    title="QR Pay — Restaurant Payment Orchestrator",
    description="QR-based bill splitting and payment for Egyptian restaurants.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(restaurants.router)
app.include_router(bills.router)
app.include_router(payments.router)
app.include_router(webhooks.router)
app.include_router(ws.router)
app.include_router(mock_gateway_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "qr-pay"}
