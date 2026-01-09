"""
Job Discovery & Scheduling

Finds jobs that are ready to run:
1. Scheduled: Streams with schedule_config.enabled=true and next_scheduled_run <= now
2. Manual: PipelineExecutions with status='pending'
"""

import logging
from datetime import datetime
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models import ResearchStream, PipelineExecution, ExecutionStatus

logger = logging.getLogger('worker.scheduler')


class JobDiscovery:
    """Discovers jobs ready to be executed"""

    def __init__(self, db: Session):
        self.db = db

    def find_pending_executions(self) -> List[PipelineExecution]:
        """
        Find manually triggered executions waiting to be picked up.

        Returns executions with status='pending'.
        """
        pending = self.db.query(PipelineExecution).filter(
            PipelineExecution.status == ExecutionStatus.PENDING
        ).all()

        logger.debug(f"Found {len(pending)} pending executions")
        return pending

    def find_scheduled_streams(self) -> List[ResearchStream]:
        """
        Find streams due for scheduled execution.

        Returns streams where:
        - schedule_config.enabled = true
        - next_scheduled_run <= now
        """
        now = datetime.utcnow()

        # Query streams with scheduling enabled and due to run
        due_streams = self.db.query(ResearchStream).filter(
            and_(
                ResearchStream.schedule_config.isnot(None),
                ResearchStream.next_scheduled_run.isnot(None),
                ResearchStream.next_scheduled_run <= now
            )
        ).all()

        # Filter to only enabled schedules (JSON field check)
        enabled_streams = [
            s for s in due_streams
            if s.schedule_config and s.schedule_config.get('enabled', False)
        ]

        logger.debug(f"Found {len(enabled_streams)} scheduled streams due to run")
        return enabled_streams

    def find_all_ready_jobs(self) -> dict:
        """
        Find all jobs ready to execute.

        Returns:
            {
                'pending_executions': [...],
                'scheduled_streams': [...]
            }
        """
        return {
            'pending_executions': self.find_pending_executions(),
            'scheduled_streams': self.find_scheduled_streams()
        }
