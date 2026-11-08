import asyncio
import datetime
import time
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status

from app.services.event_broadcaster import event_broadcaster, RealtimeEventType

logger = logging.getLogger("crowdguard.event_endpoints")

router = APIRouter()


@router.websocket("/ws/events")
async def websocket_events_endpoint(
    websocket: WebSocket,
    last_event_id: Optional[str] = Query(None, description="Last received event ID for reconnection replay")
):
    """
    Real-time WebSocket event streaming endpoint.
    Transmits live alerts, continuing-hazard notifications, incident acknowledgements/resolutions,
    and camera connectivity/staleness state transitions.
    
    Reconnection & Replay:
    Provide `?last_event_id=<id>` on connect to immediately recover all missed events still held
    in the bounded ring-buffer.
    """
    await websocket.accept()
    
    # Register subscriber and retrieve any missed events
    missed_events = await event_broadcaster.register_subscriber(websocket, last_event_id=last_event_id)
    
    # Send welcome handshake message with session details and replayed events count
    handshake = {
        "event_type": RealtimeEventType.SYSTEM_STATUS,
        "status": "connected",
        "replayed_events_count": len(missed_events),
        "last_event_id_requested": last_event_id,
        "server_time": datetime.datetime.utcnow().isoformat() + "Z"
    }
    await websocket.send_json(handshake)

    # If client requested replay and missed events exist, transmit them in sequence
    for ev in missed_events:
        replayed_payload = dict(ev)
        replayed_payload["is_replay"] = True
        await websocket.send_json(replayed_payload)

    try:
        while True:
            # Receive client heartbeats or control messages
            data = await websocket.receive_json()
            msg_type = data.get("type", "").lower()
            if msg_type == "ping":
                client_ts = data.get("client_ts")
                pong_payload = {
                    "type": "pong",
                    "server_time": datetime.datetime.utcnow().isoformat() + "Z",
                    "server_mono": time.perf_counter(),
                }
                if client_ts is not None:
                    pong_payload["client_ts"] = client_ts
                await websocket.send_json(pong_payload)
    except (WebSocketDisconnect, ConnectionResetError):
        logger.info("WebSocket client disconnected normally.")
    except Exception as e:
        logger.warning(f"WebSocket client disconnected with exception: {e}")
    finally:
        await event_broadcaster.unregister_subscriber(websocket)


@router.get("/events/recent")
def get_recent_events(
    last_event_id: Optional[str] = Query(None, description="Return events occurring strictly after this event ID"),
    limit: int = Query(50, ge=1, le=200, description="Max events to return")
) -> Dict[str, Any]:
    """
    REST fallback to poll recent real-time events.
    """
    if last_event_id:
        events = event_broadcaster.get_events_since(last_event_id)
        events = events[-limit:] if len(events) > limit else events
    else:
        events = event_broadcaster.get_recent_events(limit=limit)

    return {
        "count": len(events),
        "last_event_id": events[-1]["event_id"] if events else None,
        "events": events
    }


@router.get("/events/status")
def get_events_status() -> Dict[str, Any]:
    """
    Returns real-time event broadcaster health, active subscribers, and delivery metrics.
    """
    return event_broadcaster.get_status()
