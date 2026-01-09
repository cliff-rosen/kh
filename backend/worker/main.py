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
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI
import uvicorn

from database import SessionLocal
from worker.scheduler import JobDiscovery
from worker.dispatcher import JobDispatcher
from worker.api import router as api_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ==================== Configuration ====================

POLL_INTERVAL_SECONDS = 30  # How often to check for ready jobs
MAX_CONCURRENT_JOBS = 2     # Maximum simultaneous pipeline runs


# ==================== Worker State ====================

class WorkerState:
    """Global worker state"""
    def __init__(self):
        self.running = False
        self.scheduler_task: Optional[asyncio.Task] = None
        self.active_jobs: dict = {}

worker_state = WorkerState()


# ==================== Scheduler Loop ====================

async def scheduler_loop():
    """
    Main scheduler loop.

    Periodically checks for ready jobs and dispatches them.
    """
    logger.info("Scheduler loop starting...")

    while worker_state.running:
        try:
            await process_ready_jobs()
        except Exception as e:
            logger.error(f"Error in scheduler loop: {e}", exc_info=True)

        await asyncio.sleep(POLL_INTERVAL_SECONDS)

    logger.info("Scheduler loop stopped")


async def process_ready_jobs():
    """Check for and dispatch ready jobs"""
    db = SessionLocal()
    try:
        discovery = JobDiscovery(db)
        dispatcher = JobDispatcher(db)

        ready_jobs = discovery.find_all_ready_jobs()

        # Count active jobs
        active_count = len([j for j in worker_state.active_jobs.values() if not j.done()])

        # Process pending executions (manual triggers)
        for execution in ready_jobs['pending_executions']:
            if active_count >= MAX_CONCURRENT_JOBS:
                logger.warning(f"Max concurrent jobs ({MAX_CONCURRENT_JOBS}) reached, skipping")
                break

            logger.info(f"Dispatching pending execution: {execution.id}")
            task = asyncio.create_task(dispatcher.execute_pending(execution))
            worker_state.active_jobs[execution.id] = task
            active_count += 1

        # Process scheduled streams
        for stream in ready_jobs['scheduled_streams']:
            if active_count >= MAX_CONCURRENT_JOBS:
                logger.warning(f"Max concurrent jobs ({MAX_CONCURRENT_JOBS}) reached, skipping")
                break

            logger.info(f"Dispatching scheduled run for stream: {stream.stream_id}")
            task = asyncio.create_task(dispatcher.execute_scheduled(stream))
            # We'll get the execution_id from the task result
            worker_state.active_jobs[f"stream_{stream.stream_id}_{datetime.utcnow().timestamp()}"] = task
            active_count += 1

        # Clean up completed jobs
        completed = [k for k, v in worker_state.active_jobs.items() if v.done()]
        for key in completed:
            del worker_state.active_jobs[key]

    finally:
        db.close()


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
