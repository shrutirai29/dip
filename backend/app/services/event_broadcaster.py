import asyncio
import datetime
import logging
import threading
import time
import uuid
from collections import deque
from typing import Dict, Any, List, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("crowdguard.event_broadcaster")


class RealtimeEventType:
    INCIDENT_CREATED = "incident_created"
    INCIDENT_CONTINUATION = "incident_continuation"
    INCIDENT_ACKNOWLEDGED = "incident_acknowledged"
    INCIDENT_RESOLVED = "incident_resolved"
    CAMERA_DISCONNECTED = "camera_disconnected"
    CAMERA_RECONNECTED = "camera_reconnected"
    CAMERA_STALE_CHANGED = "camera_stale_changed"
    SYSTEM_STATUS = "system_status"


class EventBroadcaster:
    """
    Thread-safe, bounded, multi-subscriber WebSocket event broadcaster.
    
    Guarantees:
    1. Bounded memory: Ring buffer of recent events (default maxlen=200) prevents memory leaks.
    2. Slow consumer isolation: Each subscriber has a bounded queue (maxsize=100). If a client
       fails to consume in time, oldest items are dropped for that client without blocking camera
       ingestion or affecting other subscribers.
    3. Thread-safe publishing: Can be invoked from synchronous camera threads or async route handlers.
    4. Reconnection replay: Clients passing `last_event_id` automatically receive missed events
       that are still present in the buffer.
    5. Clean disconnects: Broken sockets or dead clients are culled immediately.
    """

    def __init__(self, buffer_capacity: int = 200, client_queue_size: int = 100):
        self._lock = threading.Lock()
        self._buffer_capacity = buffer_capacity
        self._client_queue_size = client_queue_size
        
        # Bounded event ring-buffer for reconnection replay
        self._event_buffer: deque[Dict[str, Any]] = deque(maxlen=buffer_capacity)
        
        # Active subscribers: websocket -> (asyncio.Queue, asyncio.Task)
        self._subscribers: Dict[WebSocket, asyncio.Queue] = {}
        self._subscriber_tasks: Dict[WebSocket, asyncio.Task] = {}
        
        # Event loop reference for sync thread publishing
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        
        # Delivery metrics
        self._total_published: int = 0
        self._total_delivered: int = 0
        self._total_dropped_slow_consumers: int = 0
        self._publication_latencies: deque[float] = deque(maxlen=100)

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        """Registers the running asyncio event loop."""
        self._loop = loop

    def get_event_loop(self) -> Optional[asyncio.AbstractEventLoop]:
        if self._loop is not None and self._loop.is_running():
            return self._loop
        try:
            loop = asyncio.get_running_loop()
            self._loop = loop
            return loop
        except RuntimeError:
            return None

    def publish(
        self,
        event_type: str,
        camera_id: Optional[str] = None,
        incident_id: Optional[str] = None,
        hazard_type: Optional[str] = None,
        severity: Optional[str] = None,
        incident_status: Optional[str] = None,
        is_continuation: bool = False,
        repeat_event_count: int = 1,
        data: Optional[Dict[str, Any]] = None,
        timestamp_sec: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Publishes a real-time event to all connected subscribers.
        Can be called synchronously from any background worker thread.
        """
        now_wall = datetime.datetime.utcnow().isoformat() + "Z"
        now_mono = time.perf_counter()
        
        # Generate monotonic, unique event ID
        ts_ms = int(time.time() * 1000)
        unique_suffix = uuid.uuid4().hex[:6]
        event_id = f"evt_{ts_ms}_{unique_suffix}"
        
        event: Dict[str, Any] = {
            "event_id": event_id,
            "event_type": event_type,
            "timestamp": now_wall,
            "timestamp_mono": now_mono,
            "camera_id": camera_id,
            "incident_id": incident_id,
            "hazard_type": hazard_type,
            "severity": severity,
            "incident_status": incident_status,
            "is_continuation": is_continuation,
            "repeat_event_count": repeat_event_count,
            "data": data or {}
        }

        with self._lock:
            self._event_buffer.append(event)
            self._total_published += 1
            subscriber_list = list(self._subscribers.items())

        # Dispatch event to each subscriber's queue
        for ws, q in subscriber_list:
            try:
                if q.full():
                    try:
                        q.get_nowait()  # Drop oldest event for slow consumer
                        self._total_dropped_slow_consumers += 1
                        logger.warning(f"Slow consumer on WebSocket {id(ws)}: dropped oldest message.")
                    except asyncio.QueueEmpty:
                        pass
                q.put_nowait(event)
            except Exception as e:
                logger.debug(f"Failed to queue event for subscriber {id(ws)}: {e}")

        return event

    async def register_subscriber(
        self,
        websocket: WebSocket,
        last_event_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Registers a new WebSocket subscriber.
        If last_event_id is specified, returns missed events from the buffer.
        """
        queue: asyncio.Queue = asyncio.Queue(maxsize=self._client_queue_size)
        
        with self._lock:
            self._subscribers[websocket] = queue
            missed_events = self._get_events_since_locked(last_event_id)

        # Start background writer task for this client
        task = asyncio.create_task(self._client_writer_loop(websocket, queue))
        with self._lock:
            self._subscriber_tasks[websocket] = task

        logger.info(
            f"Registered WebSocket subscriber (active: {len(self._subscribers)}). "
            f"Missed events replayed: {len(missed_events)}"
        )
        return missed_events

    async def unregister_subscriber(self, websocket: WebSocket):
        """Cleans up subscriber queue and task upon disconnect."""
        task = None
        with self._lock:
            if websocket in self._subscribers:
                del self._subscribers[websocket]
            if websocket in self._subscriber_tasks:
                task = self._subscriber_tasks.pop(websocket)

        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        logger.info(f"Unregistered WebSocket subscriber (active: {len(self._subscribers)})")

    async def _client_writer_loop(self, websocket: WebSocket, queue: asyncio.Queue):
        """Pulls events from client queue and transmits over WebSocket."""
        try:
            while True:
                event = await queue.get()
                t_pub_mono = event.get("timestamp_mono", time.perf_counter())
                t_now_mono = time.perf_counter()
                pub_latency_ms = max(0.0, (t_now_mono - t_pub_mono) * 1000.0)
                
                # Attach publication latency before sending
                send_payload = dict(event)
                send_payload["delivery_latency_ms"] = round(pub_latency_ms, 3)
                
                await asyncio.wait_for(websocket.send_json(send_payload), timeout=2.0)
                
                self._total_delivered += 1
                with self._lock:
                    self._publication_latencies.append(pub_latency_ms)
                queue.task_done()
        except (WebSocketDisconnect, ConnectionResetError, asyncio.CancelledError):
            pass
        except Exception as e:
            logger.debug(f"Error in client writer loop: {e}")
        finally:
            await self.unregister_subscriber(websocket)

    def get_events_since(self, last_event_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Public thread-safe accessor to get missed events."""
        with self._lock:
            return self._get_events_since_locked(last_event_id)

    def _get_events_since_locked(self, last_event_id: Optional[str]) -> List[Dict[str, Any]]:
        """Internal lock-held replay lookup."""
        if not last_event_id:
            return []
        
        events_list = list(self._event_buffer)
        found_idx = -1
        for i, ev in enumerate(events_list):
            if ev.get("event_id") == last_event_id:
                found_idx = i
                break
        
        if found_idx >= 0:
            return events_list[found_idx + 1:]
        
        # If last_event_id is older than buffer or not found, return full buffer
        return events_list

    def get_recent_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns the most recent N events from the buffer."""
        with self._lock:
            events_list = list(self._event_buffer)
            return events_list[-max(1, limit):]

    def get_status(self) -> Dict[str, Any]:
        """Returns broadcaster operational telemetry."""
        with self._lock:
            active_clients = len(self._subscribers)
            buf_len = len(self._event_buffer)
            total_pub = self._total_published
            total_del = self._total_delivered
            dropped = self._total_dropped_slow_consumers
            latencies = list(self._publication_latencies)

        mean_lat = round(sum(latencies) / max(1, len(latencies)), 3) if latencies else 0.0
        p95_lat = round(sorted(latencies)[int(len(latencies) * 0.95)], 3) if len(latencies) >= 20 else mean_lat

        return {
            "active_subscribers": active_clients,
            "buffer_capacity": self._buffer_capacity,
            "buffer_current_size": buf_len,
            "total_events_published": total_pub,
            "total_events_delivered": total_del,
            "total_dropped_slow_consumers": dropped,
            "publication_latency_ms": {
                "mean": mean_lat,
                "p95": p95_lat
            }
        }

    def reset(self):
        """Resets the broadcaster state (for testing)."""
        with self._lock:
            self._event_buffer.clear()
            self._total_published = 0
            self._total_delivered = 0
            self._total_dropped_slow_consumers = 0
            self._publication_latencies.clear()


# Global singleton instance
event_broadcaster = EventBroadcaster()
