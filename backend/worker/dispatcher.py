"""
Job Dispatcher

Executes jobs by calling pipeline_service.run_pipeline().
Manages job lifecycle (status updates, error handling).

The dispatcher reads ALL configuration from PipelineExecution.
run_pipeline() only takes execution_id - it reads everything else from the execution record.
"""

import logging
import asyncio
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import uuid

from models import ResearchStream, PipelineExecution, ExecutionStatus, RunType
from services.pipeline_service import PipelineService
from worker.status_broker import broker

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

        All configuration is already stored in the execution record.
        Updates execution status throughout lifecycle.
        """
        execution_id = execution.id
        logger.info(f"Dispatching pending execution: {execution_id} for stream {execution.stream_id}")

        try:
            # Re-query execution from our session (the passed object is from a different session)
            execution = self.db.query(PipelineExecution).filter(
                PipelineExecution.id == execution_id
            ).first()

            if not execution:
                raise ValueError(f"Execution {execution_id} not found")

            # Mark as running
            execution.status = ExecutionStatus.RUNNING
            execution.started_at = datetime.utcnow()
            self.db.commit()
            logger.info(f"Execution {execution_id} marked as RUNNING")

            # Publish starting status
            await broker.publish(execution_id, "starting", f"Starting pipeline for stream {execution.stream_id}")

            # Run pipeline - only pass execution_id, pipeline reads config from execution
            async for status in self.pipeline_service.run_pipeline(execution_id):
                logger.debug(f"[{execution_id}] {status.stage}: {status.message}")
                await broker.publish(execution_id, status.stage, status.message)

            # Mark as completed
            execution.status = ExecutionStatus.COMPLETED
            execution.completed_at = datetime.utcnow()
            self.db.commit()

            logger.info(f"Execution {execution_id} completed successfully")
            await broker.publish_complete(execution_id, success=True)

        except Exception as e:
            logger.error(f"Execution {execution_id} failed: {e}", exc_info=True)
            # Re-query to ensure we have current state
            execution = self.db.query(PipelineExecution).filter(
                PipelineExecution.id == execution_id
            ).first()
            if execution:
                execution.status = ExecutionStatus.FAILED
                execution.completed_at = datetime.utcnow()
                execution.error = str(e)
                self.db.commit()
            await broker.publish_complete(execution_id, success=False, error=str(e))

    async def execute_scheduled(self, stream: ResearchStream) -> str:
        """
        Execute a scheduled pipeline run for a stream.

        Creates a PipelineExecution with ALL configuration determined at creation time,
        then runs the pipeline using only the execution_id.

        Returns the execution_id.
        """
        stream_id = stream.stream_id
        execution_id = str(uuid.uuid4())
        logger.info(f"Dispatching scheduled run for stream {stream_id}, execution_id={execution_id}")

        # Re-query stream from our session (the passed object is from a different session)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not stream:
            raise ValueError(f"Stream {stream_id} not found")

        # Calculate dates from schedule_config.lookback_days
        lookback_days = 7  # Default
        if stream.schedule_config and stream.schedule_config.get('lookback_days'):
            lookback_days = stream.schedule_config['lookback_days']

        today = date.today()
        end_date = today.strftime('%Y-%m-%d')
        start_date = (today - timedelta(days=lookback_days)).strftime('%Y-%m-%d')

        # Snapshot ALL configuration from stream at trigger time
        retrieval_config = stream.retrieval_config if stream.retrieval_config else {}
        presentation_config = stream.presentation_config if stream.presentation_config else {}

        # Create execution record with ALL configuration
        execution = PipelineExecution(
            id=execution_id,
            stream_id=stream_id,
            user_id=stream.user_id,
            status=ExecutionStatus.RUNNING,
            run_type=RunType.SCHEDULED,
            started_at=datetime.utcnow(),
            # Execution configuration (ALL determined now, pipeline reads from here)
            start_date=start_date,
            end_date=end_date,
            report_name=None,  # Auto-generated for scheduled runs
            retrieval_config=retrieval_config,
            presentation_config=presentation_config
        )
        self.db.add(execution)
        self.db.commit()

        try:
            # Publish starting status
            await broker.publish(execution_id, "starting", f"Starting scheduled pipeline for stream {stream.stream_id}")

            # Run pipeline - only pass execution_id
            async for status in self.pipeline_service.run_pipeline(execution_id):
                logger.debug(f"[{execution_id}] {status.stage}: {status.message}")
                await broker.publish(execution_id, status.stage, status.message)

            # Mark as completed
            execution.status = ExecutionStatus.COMPLETED
            execution.completed_at = datetime.utcnow()

            # Update next_scheduled_run on the stream
            self._update_next_scheduled_run(stream)

            self.db.commit()
            logger.info(f"Scheduled execution {execution_id} completed successfully")
            await broker.publish_complete(execution_id, success=True)

        except Exception as e:
            logger.error(f"Scheduled execution {execution_id} failed: {e}", exc_info=True)
            execution.status = ExecutionStatus.FAILED
            execution.completed_at = datetime.utcnow()
            execution.error = str(e)

            # Still update next_scheduled_run even on failure
            self._update_next_scheduled_run(stream)

            self.db.commit()
            await broker.publish_complete(execution_id, success=False, error=str(e))

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
