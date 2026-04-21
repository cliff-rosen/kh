"""
Add access_requests table for tracking access requests from the landing page
and login screen.

Run:
    ENVIRONMENT=production python -m migrations.add_access_requests_table
"""

import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import SessionLocal

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def run():
    db = SessionLocal()
    try:
        # Check if table already exists
        result = db.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = 'access_requests'"
        )).scalar()
        if result:
            logger.info("access_requests table already exists, skipping.")
            return

        db.execute(text("""
            CREATE TABLE access_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                company VARCHAR(255) NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                notes TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_access_requests_status (status),
                INDEX idx_access_requests_email (email)
            )
        """))
        db.commit()
        logger.info("Created access_requests table.")
    except Exception as e:
        db.rollback()
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
