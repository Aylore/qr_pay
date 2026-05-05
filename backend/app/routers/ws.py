from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.services.ws_manager import ws_manager
from app.utils.auth import decode_token
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/dashboard")
async def dashboard_websocket(
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    Restaurant dashboard connects here to receive real-time bill events.
    JWT token passed as query param: ws://host/ws/dashboard?token=...

    Events pushed:
      bill_created     → { id, table_number, total, status, items, ... }
      payment_update   → { bill_id, amount_paid, amount_remaining, status }
      bill_settled     → { bill_id }
    """
    try:
        payload = decode_token(token)
        restaurant_id = payload.get("sub")
        if not restaurant_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await ws_manager.connect(websocket, restaurant_id)
    try:
        while True:
            # Keep connection alive — we only push from server side
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, restaurant_id)
        logger.info(f"Dashboard disconnected: restaurant={restaurant_id}")
