"""
Scheduler Loop

Polls for ready jobs and processes the email queue.
Runs continuously as a background task within the worker process.
"""

import asyncio
import logging
import os
import platform
from datetime import datetime, timedelta
from typing import Optional

from database import AsyncSessionLocal
from worker.scheduler import JobDiscovery
from worker.dispatcher import JobDispatcher
from worker.state import worker_state

logger = logging.getLogger('worker.loop')


# ==================== Configuration ====================

POLL_INTERVAL_SECONDS = 30  # How often to check for ready jobs
MAX_CONCURRENT_JOBS = 2     # Maximum simultaneous pipeline runs

# Unique ID for this worker instance (survives restarts via hostname, not random)
WORKER_ID = f"{platform.node()}:{os.getpid()}"

_started_at: Optional[datetime] = None  # Set on first poll


# ==================== Scheduler Loop ====================

async def run():
    """
    Main scheduler loop.

    On startup: checks for an existing active worker and refuses to start if
    one is found. Cleans up stale rows from previous instances.

    Then polls for ready jobs every POLL_INTERVAL_SECONDS.
    Never crashes - all exceptions are caught and logged.
    """
    global _started_at
    _started_at = datetime.utcnow()

    # Clean up all rows from previous instances/deploys/debug sessions.
    # Must happen before the active check — during immutable deploys the old
    # instance's worker may still be heartbeating when this instance starts.
    await _cleanup_stale_workers()

    # Check for existing active worker before starting
    if await _another_worker_is_active():
        logger.error(f"Another worker is already active. Refusing to start. Worker ID: {WORKER_ID}")
        worker_state.running = False
        return

    logger.info("=" * 60)
    logger.info("Scheduler loop starting")
    logger.info(f"  Worker ID: {WORKER_ID}")
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

    # Read persisted pause flag from DB
    await _sync_paused_flag()

    await _process_email_queue()

    poll_summary = {}

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

        dispatched = 0

        # When paused, still poll and heartbeat but don't dispatch new jobs
        if worker_state.paused:
            logger.info("Worker is PAUSED — skipping job dispatch")
            poll_summary = {
                "pending_found": pending_count,
                "scheduled_found": scheduled_count,
                "active_jobs": active_count,
                "dispatched": 0,
                "paused": True,
            }
            # Write heartbeat even when paused so the UI knows we're alive
            await _write_heartbeat(poll_summary)
            return

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
            dispatched += 1

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
            dispatched += 1

        poll_summary = {
            "pending_found": pending_count,
            "scheduled_found": scheduled_count,
            "active_jobs": active_count,
            "dispatched": dispatched,
        }

    # Write heartbeat after poll completes (separate session, never fails the poll)
    await _write_heartbeat(poll_summary)


# ==================== Heartbeat ====================

async def _write_heartbeat(poll_summary: dict):
    """Upsert worker status row so the main API can report health."""
    try:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import text
            now = datetime.utcnow()

            # Read version from BUILD_VERSION file if present
            version = None
            try:
                with open("BUILD_VERSION", "r") as f:
                    version = f.read().strip()
            except FileNotFoundError:
                pass

            import json
            active_jobs = len([j for j in worker_state.active_jobs.values() if not j.done()])
            summary_json = json.dumps(poll_summary)

            # On INSERT (first heartbeat), set status to 'running'.
            # On UPDATE, don't touch status — it may be 'paused' (set by the main API).
            # Only override status on UPDATE if the worker is stopping.
            if not worker_state.running:
                # Worker is shutting down — override status regardless
                await db.execute(text("""
                    INSERT INTO worker_status
                        (worker_id, started_at, last_heartbeat, status, active_jobs,
                         poll_interval_seconds, max_concurrent_jobs, last_poll_summary, version)
                    VALUES
                        (:worker_id, :started_at, :now, 'stopping', :active_jobs,
                         :poll_interval, :max_jobs, :summary, :version)
                    ON DUPLICATE KEY UPDATE
                        last_heartbeat = :now,
                        status = 'stopping',
                        active_jobs = :active_jobs,
                        last_poll_summary = :summary,
                        version = :version
                """), {
                    "worker_id": WORKER_ID,
                    "started_at": _started_at,
                    "now": now,
                    "active_jobs": active_jobs,
                    "poll_interval": POLL_INTERVAL_SECONDS,
                    "max_jobs": MAX_CONCURRENT_JOBS,
                    "summary": summary_json,
                    "version": version,
                })
            else:
                # Normal heartbeat — don't overwrite status on UPDATE
                await db.execute(text("""
                    INSERT INTO worker_status
                        (worker_id, started_at, last_heartbeat, status, active_jobs,
                         poll_interval_seconds, max_concurrent_jobs, last_poll_summary, version)
                    VALUES
                        (:worker_id, :started_at, :now, 'running', :active_jobs,
                         :poll_interval, :max_jobs, :summary, :version)
                    ON DUPLICATE KEY UPDATE
                        last_heartbeat = :now,
                        active_jobs = :active_jobs,
                        last_poll_summary = :summary,
                        version = :version
                """), {
                    "worker_id": WORKER_ID,
                    "started_at": _started_at,
                    "now": now,
                    "active_jobs": active_jobs,
                    "poll_interval": POLL_INTERVAL_SECONDS,
                    "max_jobs": MAX_CONCURRENT_JOBS,
                    "summary": summary_json,
                    "version": version,
                })
            await db.commit()
    except Exception as e:
        logger.warning(f"Failed to write heartbeat: {e}")


# ==================== Job Execution Helpers ====================

async def _another_worker_is_active() -> bool:
    """Check if another worker has a recent heartbeat. Returns True if we should not start."""
    try:
        async with AsyncSessionLocal() as db:
            from services.worker_status_service import WorkerStatusService
            service = WorkerStatusService(db)
            is_active = await service.has_active_worker(exclude_worker_id=WORKER_ID)
            if is_active:
                logger.warning("Another active worker detected")
            return is_active
    except Exception as e:
        logger.warning(f"Failed to check for active workers: {e}")
        return False  # If we can't check, proceed with startup


async def _cleanup_stale_workers():
    """Delete all rows from worker_status. Called on startup to ensure a clean slate."""
    try:
        async with AsyncSessionLocal() as db:
            from services.worker_status_service import WorkerStatusService
            service = WorkerStatusService(db)
            count = await service.delete_all()
            if count > 0:
                logger.info(f"Cleaned up {count} stale worker_status row(s)")
    except Exception as e:
        logger.warning(f"Failed to clean up worker_status: {e}")


async def _sync_paused_flag():
    """Read the persisted paused flag from the DB and sync to in-memory state."""
    try:
        async with AsyncSessionLocal() as db:
            from services.worker_status_service import WorkerStatusService
            service = WorkerStatusService(db)
            worker_state.paused = await service.is_paused()
    except Exception as e:
        logger.warning(f"Failed to read paused flag from DB: {e}")


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
