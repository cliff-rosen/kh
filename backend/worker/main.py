"""
Report Generation Worker - Main Entry Point

Standalone process that:
1. Runs a scheduler loop to discover and dispatch jobs
2. Exposes a management plane API for external control

Usage:
    python -m worker.main
    # or
    uvicorn worker.main:app --port 8001
"""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI
import uvicorn
from sqlalchemy.orm import Session

from database import SessionLocal
from worker.scheduler import JobDiscovery
from worker.dispatcher import JobDispatcher
from worker.api import router as api_router
from worker.state import worker_state

# Configure logging
LOG_FILE = 'logs/worker.log'

def setup_logging():
    """Configure logging for the worker process"""
    import os

    log_format = '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s'
    date_format = '%Y-%m-%d %H:%M:%S'
    formatter = logging.Formatter(log_format, date_format)

    # Get the worker logger (not root - avoids uvicorn conflicts)
    worker_logger = logging.getLogger('worker')
    worker_logger.setLevel(logging.DEBUG)
    worker_logger.handlers.clear()  # Remove any existing handlers

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    worker_logger.addHandler(console_handler)

    # File handler
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        file_handler = logging.FileHandler(LOG_FILE)
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        worker_logger.addHandler(file_handler)
    except Exception as e:
        print(f"Warning: Could not set up file logging: {e}")

    # Don't propagate to root logger (avoids duplicate logs)
    worker_logger.propagate = False

    # Reduce noise from libraries
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('uvicorn.access').setLevel(logging.WARNING)

setup_logging()
logger = logging.getLogger('worker')


# ==================== Configuration ====================

POLL_INTERVAL_SECONDS = 30  # How often to check for ready jobs
MAX_CONCURRENT_JOBS = 2     # Maximum simultaneous pipeline runs


# ==================== Scheduler Loop ====================

async def scheduler_loop():
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
            await process_ready_jobs()
            consecutive_errors = 0  # Reset on success

        except Exception as e:
            consecutive_errors += 1
            logger.error(f"Error in scheduler loop (attempt {consecutive_errors}): {e}", exc_info=True)

            if consecutive_errors >= max_consecutive_errors:
                logger.critical(f"Too many consecutive errors ({consecutive_errors}), scheduler unhealthy")
                # Could implement alerting here

        # Wait for either the poll interval or a wake signal (whichever comes first)
        try:
            await asyncio.wait_for(
                worker_state.wake_event.wait(),
                timeout=POLL_INTERVAL_SECONDS
            )
            # Event was set - clear it for next time
            worker_state.wake_event.clear()
            logger.debug("Scheduler woken by signal")
        except asyncio.TimeoutError:
            # Normal timeout - just continue to next poll
            pass
        except asyncio.CancelledError:
            logger.info("Scheduler loop cancelled")
            break

    logger.info("Scheduler loop stopped")


async def process_ready_jobs():
    """Check for and dispatch ready jobs"""
    logger.info("Polling for ready jobs...")

    db = SessionLocal()
    try:
        discovery = JobDiscovery(db)

        ready_jobs = discovery.find_all_ready_jobs()
        pending_count = len(ready_jobs['pending_executions'])
        scheduled_count = len(ready_jobs['scheduled_streams'])

        # Count active jobs and clean up completed ones
        completed = [k for k, v in worker_state.active_jobs.items() if v.done()]
        for key in completed:
            task = worker_state.active_jobs.pop(key)
            # Log any exceptions from completed tasks
            try:
                exc = task.exception()
                if exc:
                    logger.error(f"Job {key} failed with exception: {exc}")
                else:
                    logger.info(f"Job {key} finished and cleaned up")
            except asyncio.CancelledError:
                logger.info(f"Job {key} was cancelled")

        active_count = len(worker_state.active_jobs)

        # Always log what we found
        if pending_count == 0 and scheduled_count == 0 and active_count == 0:
            logger.info("No jobs found, nothing running")
        else:
            logger.info(f"Status: {active_count} active, {pending_count} pending, {scheduled_count} scheduled due")

        # Process pending executions (manual triggers)
        for execution in ready_jobs['pending_executions']:
            if active_count >= MAX_CONCURRENT_JOBS:
                logger.warning(f"Max concurrent jobs ({MAX_CONCURRENT_JOBS}) reached, deferring remaining")
                break

            logger.info(f"Dispatching pending execution: {execution.id} for stream {execution.stream_id}")
            # Create a new DB session for the job (each job gets its own session)
            job_db = SessionLocal()
            dispatcher = JobDispatcher(job_db)
            task = asyncio.create_task(
                run_job_safely(dispatcher.execute_pending, execution, execution.id, job_db)
            )
            worker_state.active_jobs[execution.id] = task
            active_count += 1

        # Process scheduled streams
        for stream in ready_jobs['scheduled_streams']:
            if active_count >= MAX_CONCURRENT_JOBS:
                logger.warning(f"Max concurrent jobs ({MAX_CONCURRENT_JOBS}) reached, deferring remaining")
                break

            job_key = f"scheduled_{stream.stream_id}"
            # Skip if this stream already has a running job
            if job_key in worker_state.active_jobs:
                logger.debug(f"Stream {stream.stream_id} already has a running job, skipping")
                continue

            logger.info(f"Dispatching scheduled run for stream: {stream.stream_id} ({stream.stream_name})")
            job_db = SessionLocal()
            dispatcher = JobDispatcher(job_db)
            task = asyncio.create_task(
                run_job_safely(dispatcher.execute_scheduled, stream, job_key, job_db)
            )
            worker_state.active_jobs[job_key] = task
            active_count += 1

    finally:
        db.close()


async def run_job_safely(job_func, job_arg, job_id: str, db: Session):
    """
    Wrapper to run a job with proper exception handling and cleanup.
    """
    try:
        logger.info(f"[{job_id}] Starting job")
        await job_func(job_arg)
        logger.info(f"[{job_id}] Job completed successfully")
    except asyncio.CancelledError:
        logger.warning(f"[{job_id}] Job was cancelled")
        raise
    except Exception as e:
        logger.error(f"[{job_id}] Job failed: {e}", exc_info=True)
        raise
    finally:
        try:
            db.close()
        except Exception:
            pass  # Ignore errors closing the session


# ==================== FastAPI App ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage worker lifecycle"""
    # Startup
    logger.info("Starting Report Generation Worker...")
    worker_state.running = True
    worker_state.scheduler_task = asyncio.create_task(scheduler_loop())
    logger.info("Worker started successfully")

    yield

    # Shutdown
    logger.info("Shutting down Report Generation Worker...")
    worker_state.running = False

    if worker_state.scheduler_task:
        worker_state.scheduler_task.cancel()
        try:
            await worker_state.scheduler_task
        except asyncio.CancelledError:
            pass

    # Wait for active jobs to complete (with timeout)
    if worker_state.active_jobs:
        logger.info(f"Waiting for {len(worker_state.active_jobs)} active jobs to complete...")
        try:
            await asyncio.wait_for(
                asyncio.gather(*worker_state.active_jobs.values(), return_exceptions=True),
                timeout=30.0
            )
        except asyncio.TimeoutError:
            logger.warning("Timeout waiting for jobs, forcing shutdown")

    logger.info("Worker shutdown complete")


app = FastAPI(
    title="Report Generation Worker",
    description="Standalone service for pipeline execution",
    version="1.0.0",
    lifespan=lifespan
)

# Mount management API
app.include_router(api_router)


# ==================== Additional Endpoints ====================

@app.get("/")
async def root():
    """Root endpoint with worker info"""
    return {
        "service": "Report Generation Worker",
        "status": "running" if worker_state.running else "stopped",
        "active_jobs": len([j for j in worker_state.active_jobs.values() if not j.done()]),
        "poll_interval": POLL_INTERVAL_SECONDS,
        "max_concurrent_jobs": MAX_CONCURRENT_JOBS
    }


# ==================== CLI Entry Point ====================

def main():
    """Run the worker as a standalone process"""
    uvicorn.run(
        "worker.main:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        log_level="info"
    )


if __name__ == "__main__":
    main()
