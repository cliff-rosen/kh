#!/usr/bin/env python3
"""
Migration script to add Collections & Tags support.

This migration:
1. Creates the collections table
2. Creates the collection_articles association table
3. Creates the tags table
4. Creates the article_tags association table

Run this script once after deploying the Collections & Tags feature.
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def table_exists(db, table_name: str) -> bool:
    """Check if a table exists in the database."""
    result = db.execute(text("""
        SELECT COUNT(*) as cnt
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_name = :table_name
    """), {"table_name": table_name})
    return result.fetchone()[0] > 0


def column_exists(db, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = db.execute(text("""
        SELECT COUNT(*) as cnt
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = :table_name
        AND column_name = :column_name
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone()[0] > 0


def create_collections_table(db):
    """Create the collections table."""
    if table_exists(db, "collections"):
        logger.info("collections table already exists")
        return

    logger.info("Creating collections table...")
    db.execute(text("""
        CREATE TABLE collections (
            collection_id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            scope ENUM('personal', 'organization', 'stream') NOT NULL DEFAULT 'personal',
            user_id INT NULL,
            org_id INT NULL,
            stream_id INT NULL,
            created_by INT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_collections_scope (scope),
            INDEX idx_collections_user (user_id),
            INDEX idx_collections_org (org_id),
            INDEX idx_collections_stream (stream_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
            FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE SET NULL,
            FOREIGN KEY (stream_id) REFERENCES research_streams(stream_id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
        )
    """))
    db.commit()
    logger.info("collections table created")


def create_collection_articles_table(db):
    """Create the collection_articles association table."""
    if table_exists(db, "collection_articles"):
        logger.info("collection_articles table already exists")
        return

    logger.info("Creating collection_articles table...")
    db.execute(text("""
        CREATE TABLE collection_articles (
            collection_id INT NOT NULL,
            article_id INT NOT NULL,
            added_by INT NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT NULL,
            PRIMARY KEY (collection_id, article_id),
            FOREIGN KEY (collection_id) REFERENCES collections(collection_id) ON DELETE CASCADE,
            FOREIGN KEY (article_id) REFERENCES articles(article_id) ON DELETE CASCADE,
            FOREIGN KEY (added_by) REFERENCES users(user_id) ON DELETE CASCADE
        )
    """))
    db.commit()
    logger.info("collection_articles table created")


def create_tags_table(db):
    """Create the tags table."""
    if table_exists(db, "tags"):
        logger.info("tags table already exists")
        return

    logger.info("Creating tags table...")
    db.execute(text("""
        CREATE TABLE tags (
            tag_id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            color VARCHAR(20) NULL,
            scope ENUM('personal', 'organization') NOT NULL DEFAULT 'personal',
            user_id INT NULL,
            org_id INT NULL,
            created_by INT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_tags_user (user_id),
            INDEX idx_tags_org (org_id),
            UNIQUE KEY uq_tag_name_scope (name, scope, user_id, org_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
            FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
        )
    """))
    db.commit()
    logger.info("tags table created")


def create_article_tags_table(db):
    """Create the article_tags association table."""
    if table_exists(db, "article_tags"):
        logger.info("article_tags table already exists")
        return

    logger.info("Creating article_tags table...")
    db.execute(text("""
        CREATE TABLE article_tags (
            tag_id INT NOT NULL,
            article_id INT NOT NULL,
            tagged_by INT NOT NULL,
            tagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tag_id, article_id),
            INDEX idx_article_tags_article (article_id),
            FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE,
            FOREIGN KEY (article_id) REFERENCES articles(article_id) ON DELETE CASCADE,
            FOREIGN KEY (tagged_by) REFERENCES users(user_id) ON DELETE CASCADE
        )
    """))
    db.commit()
    logger.info("article_tags table created")


def run_migration():
    """Run the complete migration."""
    with SessionLocal() as db:
        try:
            logger.info("=" * 60)
            logger.info("Starting Collections & Tags migration")
            logger.info("=" * 60)

            # Step 1: Create collections table
            create_collections_table(db)

            # Step 2: Create collection_articles table
            create_collection_articles_table(db)

            # Step 3: Create tags table
            create_tags_table(db)

            # Step 4: Create article_tags table
            create_article_tags_table(db)

            logger.info("=" * 60)
            logger.info("Migration completed successfully!")
            logger.info("=" * 60)

            # Print summary
            tables = ["collections", "collection_articles", "tags", "article_tags"]
            for t in tables:
                exists = table_exists(db, t)
                logger.info(f"  - {t}: {'EXISTS' if exists else 'MISSING'}")

        except Exception as e:
            logger.error(f"Error during migration: {e}")
            db.rollback()
            raise


if __name__ == "__main__":
    run_migration()
