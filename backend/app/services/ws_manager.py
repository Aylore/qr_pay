"""
WebSocket manager — broadcasts real-time events to connected restaurant dashboards.
Each restaurant has its own connection pool keyed by restaurant_id.
"""
import json
from collections import defaultdict
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        # restaurant_id (str) → list of connected WebSocket clients
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, restaurant_id: str):
        await websocket.accept()
        self._connections[restaurant_id].append(websocket)
        logger.info(f"WS connected: restaurant={restaurant_id}, total={len(self._connections[restaurant_id])}")

    def disconnect(self, websocket: WebSocket, restaurant_id: str):
        conns = self._connections.get(restaurant_id, [])
        if websocket in conns:
            conns.remove(websocket)
        logger.info(f"WS disconnected: restaurant={restaurant_id}, remaining={len(conns)}")

    async def broadcast(self, restaurant_id: str, event: str, data: dict):
        """Send an event to all dashboard tabs open for this restaurant."""
        message = json.dumps({"event": event, "data": data})
        dead = []
        for ws in list(self._connections.get(restaurant_id, [])):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, restaurant_id)

    async def broadcast_bill_created(self, restaurant_id: str, bill: dict):
        await self.broadcast(restaurant_id, "bill_created", bill)

    async def broadcast_payment_update(self, restaurant_id: str, bill_id: str, data: dict):
        await self.broadcast(restaurant_id, "payment_update", {"bill_id": bill_id, **data})

    async def broadcast_bill_settled(self, restaurant_id: str, bill_id: str):
        await self.broadcast(restaurant_id, "bill_settled", {"bill_id": bill_id})


ws_manager = WebSocketManager()
