#!/usr/bin/env python3
"""
Migration: Add entry_date, remove legacy date columns.

Changes:
- ADD entry_date (DATE, nullable) to wip_articles and articles
- DROP publication_date from wip_articles (legacy, not in model)
- DROP publication_date from articles (legacy, not in model)
- DROP comp_date from articles (unused)

entry_date stores the PubMed Entry Date (EDAT) — when the article was
added to PubMed. Always present on PubMed records, always full Y/M/D.
This is critical for our defensive search strategy (DP OR EDAT).
See _specs/search/pubmed-dates-reference.md for details.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_column_exists(db, table_name, column_name):
    result = db.execute(text("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = :table_name
        AND column_name = :column_name
        AND table_schema = DATABASE()
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone()[0] > 0


def run_migration():
    with SessionLocal() as db:
        try:
            # --- ADD entry_date ---
            for table in ['wip_articles', 'articles']:
                if not check_column_exists(db, table, 'entry_date'):
                    logger.info(f"Adding entry_date to {table}...")
                    db.execute(text(f"""
                        ALTER TABLE {table}
                        ADD COLUMN entry_date DATE NULL
                        COMMENT 'PubMed Entry Date (EDAT) - when article was added to PubMed'
                    """))
                    logger.info(f"  Added entry_date to {table}")
                else:
                    logger.info(f"  entry_date already exists on {table}")

            # --- DROP legacy columns ---
            for table in ['wip_articles', 'articles']:
                if check_column_exists(db, table, 'publication_date'):
                    logger.info(f"Dropping publication_date from {table}...")
                    db.execute(text(f"ALTER TABLE {table} DROP COLUMN publication_date"))
                    logger.info(f"  Dropped publication_date from {table}")
                else:
                    logger.info(f"  publication_date already gone from {table}")

            if check_column_exists(db, 'articles', 'comp_date'):
                logger.info("Dropping comp_date from articles...")
                db.execute(text("ALTER TABLE articles DROP COLUMN comp_date"))
                logger.info("  Dropped comp_date from articles")
            else:
                logger.info("  comp_date already gone from articles")

            # Drop 'year' (varchar vestige, replaced by pub_year int)
            for table in ['wip_articles', 'articles']:
                if check_column_exists(db, table, 'year'):
                    logger.info(f"Dropping year from {table}...")
                    db.execute(text(f"ALTER TABLE {table} DROP COLUMN year"))
                    logger.info(f"  Dropped year from {table}")
                else:
                    logger.info(f"  year already gone from {table}")

            # Drop 'poi' (unused Publication Object Identifier)
            if check_column_exists(db, 'articles', 'poi'):
                logger.info("Dropping poi from articles...")
                db.execute(text("ALTER TABLE articles DROP COLUMN poi"))
                logger.info("  Dropped poi from articles")
            else:
                logger.info("  poi already gone from articles")

            db.commit()
            logger.info("\nMigration completed successfully!")

            # Verify
            logger.info("\nVerification:")
            for table in ['wip_articles', 'articles']:
                for col, should_exist in [('entry_date', True), ('publication_date', False), ('comp_date', False), ('year', False), ('poi', False)]:
                    exists = check_column_exists(db, table, col)
                    status = "EXISTS" if exists else "gone"
                    expected = "EXISTS" if should_exist else "gone"
                    ok = "OK" if status == expected else ("UNEXPECTED" if should_exist else "n/a")
                    logger.info(f"  {table}.{col}: {status} [{ok}]")

            return True

        except Exception as e:
            logger.error(f"Migration failed: {e}")
            db.rollback()
            return False


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Add entry_date, cleanup legacy date columns")
    logger.info("=" * 60)

    success = run_migration()
    sys.exit(0 if success else 1)
