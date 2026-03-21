"""
Report Generation Worker - Main Entry Point

Standalone process (port 8001) that runs alongside the main API (port 8000).
Responsible for all background work: scheduled pipelines, email delivery.

This file is just wiring: FastAPI app, lifespan, logging, CLI entry point.
On startup it launches loop.run() and mounts the management API from api.py.

Modules:
    main.py     App setup, lifecycle              → starts loop, mounts api
    loop.py     Poll cycle, job dispatch          → scheduler, dispatcher, heartbeat
    scheduler.py  Job discovery (read-only)       → queries streams + executions
    dispatcher.py Job execution + notification    → services (pipeline, stream, email...)
    api.py      Management API (SSE, triggers)    → execution service, status broker
    state.py    Shared mutable state              → used by main, loop, api
    status_broker.py  In-memory pub/sub for SSE   → written by dispatcher, read by api

See docs/weekly-pipeline-technical-architecture.md for sequence diagrams
and the full call graph.

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
        port=8002,
        reload=False,
        log_level="info"
    )


if __name__ == "__main__":
    main()
