"""
Report Generation Worker - Main Entry Point

Standalone FastAPI service that:
1. Runs a scheduler loop to discover and dispatch jobs
2. Exposes a management API for external control

Usage:
    python -m worker.main
    # or
    uvicorn worker.main:app --port 8001
"""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
import uvicorn

from worker import loop
from worker.api import router as api_router
from worker.state import worker_state


# ==================== Logging ====================

LOG_FILE = 'logs/worker.log'


def setup_logging():
    """Configure logging for the worker process"""
    import os

    log_format = '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s'
    date_format = '%Y-%m-%d %H:%M:%S'
    formatter = logging.Formatter(log_format, date_format)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)

    file_handler = None
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        file_handler = logging.FileHandler(LOG_FILE)
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
    except Exception as e:
        print(f"Warning: Could not set up file logging: {e}")

    for logger_name in ['worker', 'services', 'agents']:
        lg = logging.getLogger(logger_name)
        lg.setLevel(logging.DEBUG)
        lg.handlers.clear()
        lg.addHandler(console_handler)
        if file_handler:
            lg.addHandler(file_handler)
        lg.propagate = False

    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('uvicorn.access').setLevel(logging.WARNING)


setup_logging()
logger = logging.getLogger('worker')


# ==================== FastAPI App ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage worker lifecycle"""
    logger.info("Starting Report Generation Worker...")
    worker_state.running = True
    worker_state.scheduler_task = asyncio.create_task(loop.run())
    logger.info("Worker started successfully")

    yield

    logger.info("Shutting down Report Generation Worker...")
    worker_state.running = False

    if worker_state.scheduler_task:
        worker_state.scheduler_task.cancel()
        try:
            await worker_state.scheduler_task
        except asyncio.CancelledError:
            pass

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

app.include_router(api_router)


@app.get("/")
async def root():
    """Root endpoint with worker info"""
    return {
        "service": "Report Generation Worker",
        "status": "running" if worker_state.running else "stopped",
        "active_jobs": len([j for j in worker_state.active_jobs.values() if not j.done()]),
        "poll_interval": loop.POLL_INTERVAL_SECONDS,
        "max_concurrent_jobs": loop.MAX_CONCURRENT_JOBS
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
