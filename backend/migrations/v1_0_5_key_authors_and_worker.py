"""
Migration: v1.0.5 - Key Authors, Worker Status, and cleanup

New tables:
  - worker_status: heartbeat table for background worker process
  - key_authors: curated list of key authors per research stream
  - key_author_articles: local cache of key author PubMed articles (used by Tools page)

Data seed:
  - 13 key authors for Asbestos and Talc Litigation stream (stream_id=10)

Removed:
  - schemas/article.py (unused, replaced by CanonicalResearchArticle)
  - types/article.ts (frontend mirror of above, also unused)

Usage:
  ENVIRONMENT=production python migrations/v1_0_5_key_authors_and_worker.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import async_engine


STATEMENTS = [
    # --- worker_status table ---
    """
    CREATE TABLE IF NOT EXISTS worker_status (
        worker_id VARCHAR(100) NOT NULL PRIMARY KEY,
        started_at DATETIME NOT NULL,
        last_heartbeat DATETIME NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        active_jobs INT NOT NULL DEFAULT 0,
        poll_interval_seconds INT NOT NULL DEFAULT 30,
        max_concurrent_jobs INT NOT NULL DEFAULT 2,
        last_poll_summary JSON DEFAULT NULL,
        version VARCHAR(50) DEFAULT NULL,
        INDEX ix_worker_status_last_heartbeat (last_heartbeat)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,

    # --- key_authors table ---
    """
    CREATE TABLE IF NOT EXISTS key_authors (
        author_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        stream_id INT NULL,
        UNIQUE KEY uq_stream_name (stream_id, name),
        INDEX idx_stream (stream_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,

    # --- key_author_articles table (local cache for Tools page) ---
    """
    CREATE TABLE IF NOT EXISTS key_author_articles (
        article_id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        url VARCHAR(1000),
        authors JSON,
        abstract TEXT,
        journal VARCHAR(255),
        volume VARCHAR(50),
        issue VARCHAR(50),
        pages VARCHAR(50),
        medium VARCHAR(100),
        doi VARCHAR(255),
        pmid VARCHAR(20),
        pub_year INT,
        pub_month INT,
        pub_day INT,
        comp_date DATE,
        INDEX idx_pmid (pmid),
        INDEX idx_doi (doi)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
]

# Key authors for Asbestos and Talc Litigation stream (stream_id=10)
KEY_AUTHORS_STREAM_10 = [
    "Roggli VL", "Carbone M", "Hassan R", "Attanoos RL",
    "Testa JR", "Paustenbach D", "Hammar SP",
    "Dodson RF", "Kradin RL", "Brody AT",
    "Zauderer M", "Kindler HL", "Bueno R",
]


async def main():
    async with async_engine.begin() as conn:
        # Create tables
        for stmt in STATEMENTS:
            await conn.execute(text(stmt))
            table_name = stmt.strip().split("EXISTS")[1].split("(")[0].strip() if "EXISTS" in stmt else "?"
            print(f"Created table (if not exists): {table_name}")

        # Seed key authors for stream 10
        for name in KEY_AUTHORS_STREAM_10:
            await conn.execute(
                text("INSERT IGNORE INTO key_authors (name, stream_id) VALUES (:name, :stream_id)"),
                {"name": name, "stream_id": 10}
            )
        print(f"Seeded {len(KEY_AUTHORS_STREAM_10)} key authors for stream_id=10")

        # Verify
        result = await conn.execute(text("SELECT COUNT(*) FROM key_authors WHERE stream_id = 10"))
        count = result.scalar()
        print(f"Verified: {count} key authors in stream 10")

        result = await conn.execute(text("SHOW TABLES LIKE 'worker_status'"))
        print(f"worker_status table exists: {result.fetchone() is not None}")

    print("\nMigration complete.")


if __name__ == "__main__":
    asyncio.run(main())
