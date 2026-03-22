"""
Worker Status Service

Owns the worker_status table. Provides worker health information
to the main API without requiring direct access to the worker process.

Pause/resume sets the status column to 'paused'/'running' in the DB.
The worker reads this each poll cycle.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import Depends

from models import WorkerStatus
from database import get_async_db

logger = logging.getLogger(__name__)

HEARTBEAT_STALE_SECONDS = 120  # 2 minutes — if no heartbeat, worker is down


@dataclass
class WorkerHealthStatus:
    """Computed worker health, returned to the router."""
    worker_id: Optional[str] = None
    started_at: Optional[datetime] = None
    last_heartbeat: Optional[datetime] = None
    status: str = "unknown"  # running, paused, stopping, down, unknown
    seconds_since_heartbeat: Optional[int] = None
    active_jobs: int = 0
    poll_interval_seconds: int = 0
    max_concurrent_jobs: int = 0
    last_poll_summary: Optional[dict] = None
    version: Optional[str] = None


class WorkerStatusService:
    """Service for reading/writing worker heartbeat status."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_current_status(self) -> WorkerHealthStatus:
        """
        Get the most recent worker heartbeat and compute health.

        Returns unknown if no heartbeat exists, down if stale.
        """
        result = await self.db.execute(
            select(WorkerStatus)
            .order_by(WorkerStatus.last_heartbeat.desc())
            .limit(1)
        )
        row = result.scalars().first()

        if not row:
            return WorkerHealthStatus(status="unknown")

        now = datetime.utcnow()
        seconds_since = int((now - row.last_heartbeat).total_seconds())
        is_stale = seconds_since > HEARTBEAT_STALE_SECONDS

        return WorkerHealthStatus(
            worker_id=row.worker_id,
            started_at=row.started_at,
            last_heartbeat=row.last_heartbeat,
            status="down" if is_stale else row.status,
            seconds_since_heartbeat=seconds_since,
            active_jobs=row.active_jobs,
            poll_interval_seconds=row.poll_interval_seconds,
            max_concurrent_jobs=row.max_concurrent_jobs,
            last_poll_summary=row.last_poll_summary,
            version=row.version,
        )

    async def set_paused(self, paused: bool) -> bool:
        """
        Set the worker status to 'paused' or 'running'.
        The worker reads this each poll cycle.
        Returns True if any rows were updated.
        """
        new_status = "paused" if paused else "running"
        result = await self.db.execute(
            update(WorkerStatus).values(status=new_status)
        )
        await self.db.commit()
        logger.info(f"Set worker status={new_status}, rows affected={result.rowcount}")
        return result.rowcount > 0

    async def is_paused(self) -> bool:
        """Read the persisted status. Used by the worker on each poll."""
        result = await self.db.execute(
            select(WorkerStatus.status)
            .order_by(WorkerStatus.last_heartbeat.desc())
            .limit(1)
        )
        status = result.scalar()
        return status == "paused"

    async def has_active_worker(self, exclude_worker_id: str) -> bool:
        """Check if another worker has a recent heartbeat (within 120s)."""
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(seconds=HEARTBEAT_STALE_SECONDS)
        result = await self.db.execute(
            select(WorkerStatus.worker_id, WorkerStatus.last_heartbeat)
            .where(WorkerStatus.last_heartbeat > cutoff)
            .where(WorkerStatus.worker_id != exclude_worker_id)
            .limit(1)
        )
        row = result.fetchone()
        return row is not None

    async def delete_all(self) -> int:
        """Delete all rows. Called on startup to clean up stale entries."""
        from sqlalchemy import delete as sa_delete
        result = await self.db.execute(sa_delete(WorkerStatus))
        await self.db.commit()
        return result.rowcount


async def get_worker_status_service(
    db: AsyncSession = Depends(get_async_db),
) -> WorkerStatusService:
    return WorkerStatusService(db)
