"""
Job Dispatcher

Executes jobs by calling pipeline_service.run_pipeline().
Manages job lifecycle (status updates, error handling).
"""

import logging
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import uuid

from models import ResearchStream, PipelineExecution, ExecutionStatus, RunType
from services.pipeline_service import PipelineService

logger = logging.getLogger('worker.dispatcher')


class JobDispatcher:
    """Dispatches and manages pipeline jobs"""

    def __init__(self, db: Session):
        self.db = db
        self.pipeline_service = PipelineService(db)
        self._running_jobs: Dict[str, asyncio.Task] = {}

    async def execute_pending(self, execution: PipelineExecution) -> None:
        """
        Execute a pending (manually triggered) pipeline execution.

        Updates execution status throughout lifecycle.
        """
        execution_id = execution.id
        logger.info(f"Dispatching pending execution: {execution_id}")

        try:
            # Mark as running
            execution.status = ExecutionStatus.RUNNING
            execution.started_at = datetime.utcnow()
            self.db.commit()

            # Get stream info for user_id
            stream = self.db.query(ResearchStream).filter(
                ResearchStream.stream_id == execution.stream_id
            ).first()

            if not stream:
                raise ValueError(f"Stream {execution.stream_id} not found")

            # Run pipeline and consume status updates
            async for status in self.pipeline_service.run_pipeline(
                research_stream_id=execution.stream_id,
                user_id=stream.user_id,
                run_type=execution.run_type
            ):
                logger.debug(f"[{execution_id}] {status.stage}: {status.message}")
                # Could emit these status updates somewhere (websocket, etc.)

            # Mark as completed
            execution.status = ExecutionStatus.COMPLETED
            execution.completed_at = datetime.utcnow()
            self.db.commit()

            logger.info(f"Execution {execution_id} completed successfully")

        except Exception as e:
            logger.error(f"Execution {execution_id} failed: {e}", exc_info=True)
            execution.status = ExecutionStatus.FAILED
            execution.completed_at = datetime.utcnow()
            execution.error = str(e)
            self.db.commit()

    async def execute_scheduled(self, stream: ResearchStream) -> str:
        """
        Execute a scheduled pipeline run for a stream.

        Creates a new PipelineExecution record and runs the pipeline.
        Returns the execution_id.
        """
        execution_id = str(uuid.uuid4())
        logger.info(f"Dispatching scheduled run for stream {stream.stream_id}, execution_id={execution_id}")

        # Create execution record
        execution = PipelineExecution(
            id=execution_id,
            stream_id=stream.stream_id,
            status=ExecutionStatus.RUNNING,
            run_type=RunType.SCHEDULED,
            started_at=datetime.utcnow()
        )
        self.db.add(execution)
        self.db.commit()

        try:
            # Run pipeline and consume status updates
            async for status in self.pipeline_service.run_pipeline(
                research_stream_id=stream.stream_id,
                user_id=stream.user_id,
                run_type=RunType.SCHEDULED
            ):
                logger.debug(f"[{execution_id}] {status.stage}: {status.message}")

            # Mark as completed
            execution.status = ExecutionStatus.COMPLETED
            execution.completed_at = datetime.utcnow()

            # Update next_scheduled_run on the stream
            self._update_next_scheduled_run(stream)

            self.db.commit()
            logger.info(f"Scheduled execution {execution_id} completed successfully")

        except Exception as e:
            logger.error(f"Scheduled execution {execution_id} failed: {e}", exc_info=True)
            execution.status = ExecutionStatus.FAILED
            execution.completed_at = datetime.utcnow()
            execution.error = str(e)

            # Still update next_scheduled_run even on failure
            self._update_next_scheduled_run(stream)

            self.db.commit()

        return execution_id

    def _update_next_scheduled_run(self, stream: ResearchStream) -> None:
        """Calculate and set the next scheduled run time"""
        if not stream.schedule_config:
            return

        next_run = self._calculate_next_run(stream.schedule_config)
        stream.next_scheduled_run = next_run
        logger.debug(f"Updated next_scheduled_run for stream {stream.stream_id}: {next_run}")

    def _calculate_next_run(self, schedule_config: dict) -> datetime:
        """
        Calculate the next scheduled run time based on config.

        Simple implementation - can be enhanced later.
        """
        from datetime import timedelta

        frequency = schedule_config.get('frequency', 'weekly')
        now = datetime.utcnow()

        # Simple frequency-based calculation
        if frequency == 'daily':
            return now + timedelta(days=1)
        elif frequency == 'weekly':
            return now + timedelta(weeks=1)
        elif frequency == 'biweekly':
            return now + timedelta(weeks=2)
        elif frequency == 'monthly':
            return now + timedelta(days=30)
        else:
            return now + timedelta(weeks=1)  # Default to weekly

    def get_running_jobs(self) -> Dict[str, Any]:
        """Get info about currently running jobs"""
        return {
            job_id: {
                'running': not task.done(),
                'cancelled': task.cancelled() if task.done() else False
            }
            for job_id, task in self._running_jobs.items()
        }

    async def cancel_job(self, execution_id: str) -> bool:
        """Attempt to cancel a running job"""
        if execution_id in self._running_jobs:
            task = self._running_jobs[execution_id]
            if not task.done():
                task.cancel()
                logger.info(f"Cancelled job {execution_id}")
                return True
        return False
