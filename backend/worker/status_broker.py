"""
Status Broker

Pub/sub mechanism for job status updates.
Allows management API clients to subscribe to real-time status streams.
"""

import asyncio
import logging
from typing import Dict, Set
from dataclasses import dataclass, asdict
from datetime import datetime

logger = logging.getLogger('worker.status_broker')


@dataclass
class StatusUpdate:
    """A status update from a running job"""
    execution_id: str
    stage: str
    message: str
    timestamp: str = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self) -> dict:
        return asdict(self)


class StatusBroker:
    """
    Manages subscriptions to job status updates.

    Publishers call: broker.publish(execution_id, status)
    Subscribers call: async for status in broker.subscribe(execution_id)
    """

    def __init__(self):
        # execution_id -> set of asyncio.Queue
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, execution_id: str) -> asyncio.Queue:
        """
        Subscribe to status updates for an execution.
        Returns a queue that will receive StatusUpdate objects.
        """
        queue = asyncio.Queue()

        async with self._lock:
            if execution_id not in self._subscribers:
                self._subscribers[execution_id] = set()
            self._subscribers[execution_id].add(queue)

        logger.debug(f"New subscriber for execution {execution_id}, total: {len(self._subscribers.get(execution_id, set()))}")
        return queue

    async def unsubscribe(self, execution_id: str, queue: asyncio.Queue):
        """Remove a subscription"""
        async with self._lock:
            if execution_id in self._subscribers:
                self._subscribers[execution_id].discard(queue)
                if not self._subscribers[execution_id]:
                    del self._subscribers[execution_id]

        logger.debug(f"Unsubscribed from execution {execution_id}")

    async def publish(self, execution_id: str, stage: str, message: str):
        """Publish a status update to all subscribers"""
        update = StatusUpdate(
            execution_id=execution_id,
            stage=stage,
            message=message
        )

        async with self._lock:
            subscribers = self._subscribers.get(execution_id, set()).copy()

        for queue in subscribers:
            try:
                queue.put_nowait(update)
            except asyncio.QueueFull:
                logger.warning(f"Queue full for subscriber on {execution_id}, dropping message")

    async def publish_complete(self, execution_id: str, success: bool, error: str = None):
        """Publish completion status and clean up"""
        stage = "completed" if success else "failed"
        message = "Job completed successfully" if success else f"Job failed: {error}"

        await self.publish(execution_id, stage, message)

        # Send sentinel to signal end of stream
        async with self._lock:
            subscribers = self._subscribers.get(execution_id, set()).copy()

        for queue in subscribers:
            try:
                queue.put_nowait(None)  # Sentinel value
            except asyncio.QueueFull:
                pass

        # Clean up subscribers
        async with self._lock:
            if execution_id in self._subscribers:
                del self._subscribers[execution_id]

        logger.debug(f"Completed and cleaned up execution {execution_id}")


# Global broker instance
broker = StatusBroker()
