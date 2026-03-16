"""
Scheduler Loop

Polls for ready jobs and processes the email queue.
Runs continuously as a background task within the worker process.
"""

import asyncio
import logging

from database import AsyncSessionLocal
from worker.scheduler import JobDiscovery
from worker.dispatcher import JobDispatcher
from worker.state import worker_state

logger = logging.getLogger('worker.loop')


# ==================== Configuration ====================

POLL_INTERVAL_SECONDS = 30  # How often to check for ready jobs
MAX_CONCURRENT_JOBS = 2     # Maximum simultaneous pipeline runs


# ==================== Scheduler Loop ====================

async def run():
    """
    Main scheduler loop.

    Periodically checks for ready jobs and dispatches them.
    Never crashes - all exceptions are caught and logged.
    """
    logger.info("=" * 60)
    logger.info("Scheduler loop starting")
    logger.info(f"  Poll interval: {POLL_INTERVAL_SECONDS}s")
    logger.info(f"  Max concurrent jobs: {MAX_CONCURRENT_JOBS}")
    logger.info("=" * 60)

    consecutive_errors = 0
    max_consecutive_errors = 10

    while worker_state.running:
        try:
            await _poll()
            consecutive_errors = 0

        except Exception as e:
            consecutive_errors += 1
            logger.error(f"Error in scheduler loop (attempt {consecutive_errors}): {e}", exc_info=True)

            if consecutive_errors >= max_consecutive_errors:
                logger.critical(f"Too many consecutive errors ({consecutive_errors}), scheduler unhealthy")

        # Wait for either the poll interval or a wake signal (whichever comes first)
        try:
            await asyncio.wait_for(
                worker_state.wake_event.wait(),
                timeout=POLL_INTERVAL_SECONDS
            )
            worker_state.wake_event.clear()
            logger.debug("Scheduler woken by signal")
        except asyncio.TimeoutError:
            pass
        except asyncio.CancelledError:
            logger.info("Scheduler loop cancelled")
            break

    logger.info("Scheduler loop stopped")


# ==================== Poll Cycle ====================

async def _poll():
    """Run one poll cycle: process email queue, then discover and dispatch jobs."""
    logger.info("Polling for ready jobs...")

    await _process_email_queue()

    async with AsyncSessionLocal() as db:
        discovery = JobDiscovery(db)
        ready_jobs = await discovery.find_all_ready_jobs()

        pending_count = len(ready_jobs['pending_executions'])
        scheduled_count = len(ready_jobs['scheduled_streams'])

        # Clean up completed tasks
        completed = [k for k, v in worker_state.active_jobs.items() if v.done()]
        for key in completed:
            task = worker_state.active_jobs.pop(key)
            try:
                exc = task.exception()
                if exc:
                    logger.error(f"Job {key} failed with exception: {exc}")
                else:
                    logger.info(f"Job {key} finished and cleaned up")
            except asyncio.CancelledError:
                logger.info(f"Job {key} was cancelled")

        active_count = len(worker_state.active_jobs)

        if pending_count == 0 and scheduled_count == 0 and active_count == 0:
            logger.info("No jobs found, nothing running")
        else:
            logger.info(f"Status: {active_count} active, {pending_count} pending, {scheduled_count} scheduled due")

        # Dispatch pending executions (manual triggers)
        for execution in ready_jobs['pending_executions']:
            if active_count >= MAX_CONCURRENT_JOBS:
                logger.warning(f"Max concurrent jobs ({MAX_CONCURRENT_JOBS}) reached, deferring remaining")
                break

            logger.info(f"Dispatching pending execution: {execution.id} for stream {execution.stream_id}")
            task = asyncio.create_task(
                _run_job(_execute_pending, execution, execution.id)
            )
            worker_state.active_jobs[execution.id] = task
            active_count += 1

        # Dispatch scheduled streams
        for stream in ready_jobs['scheduled_streams']:
            if active_count >= MAX_CONCURRENT_JOBS:
                logger.warning(f"Max concurrent jobs ({MAX_CONCURRENT_JOBS}) reached, deferring remaining")
                break

            job_key = f"scheduled_{stream.stream_id}"
            if job_key in worker_state.active_jobs:
                logger.debug(f"Stream {stream.stream_id} already has a running job, skipping")
                continue

            logger.info(f"Dispatching scheduled run for stream: {stream.stream_id} ({stream.stream_name})")
            task = asyncio.create_task(
                _run_job(_execute_scheduled, stream, job_key)
            )
            worker_state.active_jobs[job_key] = task
            active_count += 1


# ==================== Job Execution Helpers ====================

async def _process_email_queue():
    """Process any due emails in the queue."""
    try:
        async with AsyncSessionLocal() as db:
            from services.report_email_queue_service import ReportEmailQueueService
            queue_service = ReportEmailQueueService(db)
            result = await queue_service.process_queue()
            if result.total_processed > 0:
                logger.info(
                    f"Email queue: {result.sent_count} sent, "
                    f"{result.failed_count} failed out of {result.total_processed}"
                )
    except Exception as e:
        logger.error(f"Error processing email queue: {e}", exc_info=True)


async def _execute_pending(execution, _job_id: str):
    """Execute a pending job with its own DB session."""
    async with AsyncSessionLocal() as db:
        dispatcher = JobDispatcher(db)
        await dispatcher.execute_pending(execution)


async def _execute_scheduled(stream, _job_id: str):
    """Execute a scheduled job with its own DB session."""
    async with AsyncSessionLocal() as db:
        dispatcher = JobDispatcher(db)
        await dispatcher.execute_scheduled(stream)


async def _run_job(job_func, job_arg, job_id: str):
    """Wrapper to run a job with exception logging."""
    try:
        logger.info(f"[{job_id}] Starting job")
        await job_func(job_arg, job_id)
        logger.info(f"[{job_id}] Job completed successfully")
    except asyncio.CancelledError:
        logger.warning(f"[{job_id}] Job was cancelled")
        raise
    except Exception as e:
        logger.error(f"[{job_id}] Job failed: {e}", exc_info=True)
        raise
