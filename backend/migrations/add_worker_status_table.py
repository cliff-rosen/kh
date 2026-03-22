"""
Migration: Add worker_status table

Heartbeat table for background worker process monitoring.
One row per worker instance, upserted every poll cycle.
"""

import sys
import os

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = :table_name
        AND column_name = :column_name
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone() is not None


def table_exists(conn, table_name: str) -> bool:
    result = conn.execute(text("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_name = :table_name
    """), {"table_name": table_name})
    return result.fetchone() is not None


def run_migration():
    """Create worker_status table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Starting worker_status migration...")

        if not table_exists(conn, 'worker_status'):
            print("Creating 'worker_status' table...")
            conn.execute(text("""
                CREATE TABLE worker_status (
                    worker_id VARCHAR(100) PRIMARY KEY,
                    started_at DATETIME NOT NULL,
                    last_heartbeat DATETIME NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'running',
                    active_jobs INT NOT NULL DEFAULT 0,
                    poll_interval_seconds INT NOT NULL DEFAULT 30,
                    max_concurrent_jobs INT NOT NULL DEFAULT 2,
                    last_poll_summary JSON DEFAULT NULL,
                    version VARCHAR(50) DEFAULT NULL,
                    INDEX idx_worker_last_heartbeat (last_heartbeat)
                )
            """))
            print("Created 'worker_status' table")
        else:
            print("Table 'worker_status' already exists")

        conn.commit()
        print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
