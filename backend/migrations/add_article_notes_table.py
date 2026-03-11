#!/usr/bin/env python3
"""
Migration: Create article_notes table and migrate existing notes data.

This migration:
1. Creates the article_notes table (decoupled from report/collection context)
2. Migrates existing notes from report_article_associations.notes (JSON) into article_notes
3. Migrates existing notes from collection_articles.notes (text) into article_notes

Run this script once after deploying the unified notes feature.
"""

import sys
import os
import json
import uuid
from datetime import datetime

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
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name
    """), {"table_name": table_name})
    return result.scalar() > 0


def run_migration():
    db = SessionLocal()
    try:
        # 1. Create article_notes table
        if not table_exists(db, "article_notes"):
            logger.info("Creating article_notes table...")
            db.execute(text("""
                CREATE TABLE article_notes (
                    note_id INT AUTO_INCREMENT PRIMARY KEY,
                    article_id INT NOT NULL,
                    user_id INT NOT NULL,
                    content TEXT NOT NULL,
                    visibility ENUM('personal','shared') NOT NULL DEFAULT 'personal',
                    context_type VARCHAR(50) NULL,
                    context_id INT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (article_id) REFERENCES articles(article_id),
                    FOREIGN KEY (user_id) REFERENCES users(user_id),
                    INDEX idx_an_article (article_id),
                    INDEX idx_an_user (user_id),
                    INDEX idx_an_context (context_type, context_id)
                )
            """))
            db.commit()
            logger.info("article_notes table created.")
        else:
            logger.info("article_notes table already exists, skipping creation.")

        # 2. Migrate existing report article notes (JSON array in report_article_associations.notes)
        logger.info("Migrating report article notes...")
        result = db.execute(text("""
            SELECT report_id, article_id, notes
            FROM report_article_associations
            WHERE notes IS NOT NULL AND notes != '' AND notes != '[]'
        """))
        migrated_report_notes = 0
        for row in result.fetchall():
            report_id, article_id, notes_json = row
            try:
                notes_list = json.loads(notes_json)
                if not isinstance(notes_list, list):
                    continue
                for note in notes_list:
                    if not isinstance(note, dict) or not note.get("content"):
                        continue
                    # Check if already migrated (by matching content + user + article)
                    exists = db.execute(text("""
                        SELECT COUNT(*) FROM article_notes
                        WHERE article_id = :article_id AND user_id = :user_id
                          AND content = :content AND context_type = 'report' AND context_id = :context_id
                    """), {
                        "article_id": article_id,
                        "user_id": note.get("user_id", 0),
                        "content": note["content"],
                        "context_id": report_id,
                    }).scalar()
                    if exists > 0:
                        continue

                    created_at = note.get("created_at", datetime.utcnow().isoformat())
                    updated_at = note.get("updated_at", created_at)

                    db.execute(text("""
                        INSERT INTO article_notes (article_id, user_id, content, visibility, context_type, context_id, created_at, updated_at)
                        VALUES (:article_id, :user_id, :content, :visibility, 'report', :context_id, :created_at, :updated_at)
                    """), {
                        "article_id": article_id,
                        "user_id": note.get("user_id", 0),
                        "content": note["content"],
                        "visibility": note.get("visibility", "personal"),
                        "context_id": report_id,
                        "created_at": created_at,
                        "updated_at": updated_at,
                    })
                    migrated_report_notes += 1
            except (json.JSONDecodeError, TypeError):
                continue
        db.commit()
        logger.info(f"Migrated {migrated_report_notes} report article notes.")

        # 3. Migrate existing collection article notes (plain text in collection_articles.notes)
        logger.info("Migrating collection article notes...")
        result = db.execute(text("""
            SELECT ca.collection_id, ca.article_id, ca.notes, ca.added_by
            FROM collection_articles ca
            WHERE ca.notes IS NOT NULL AND ca.notes != ''
        """))
        migrated_collection_notes = 0
        for row in result.fetchall():
            collection_id, article_id, notes_text, added_by = row
            # Check if already migrated
            exists = db.execute(text("""
                SELECT COUNT(*) FROM article_notes
                WHERE article_id = :article_id AND user_id = :user_id
                  AND context_type = 'collection' AND context_id = :context_id
            """), {
                "article_id": article_id,
                "user_id": added_by,
                "context_id": collection_id,
            }).scalar()
            if exists > 0:
                continue

            db.execute(text("""
                INSERT INTO article_notes (article_id, user_id, content, visibility, context_type, context_id)
                VALUES (:article_id, :user_id, :content, 'personal', 'collection', :context_id)
            """), {
                "article_id": article_id,
                "user_id": added_by,
                "content": notes_text,
                "context_id": collection_id,
            })
            migrated_collection_notes += 1
        db.commit()
        logger.info(f"Migrated {migrated_collection_notes} collection article notes.")

        logger.info("Migration complete!")

    except Exception as e:
        db.rollback()
        logger.error(f"Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
