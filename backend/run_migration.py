#!/usr/bin/env python3
"""Run database migration to rename mandate_id to research_stream_id"""

from sqlalchemy import text
from database import engine

def run_migration():
    with engine.connect() as conn:
        # Start transaction
        trans = conn.begin()

        try:
            # Rename the column
            print("Renaming mandate_id to research_stream_id...")
            conn.execute(text("""
                ALTER TABLE reports
                CHANGE COLUMN mandate_id research_stream_id INT
            """))

            # Check for existing foreign key
            print("Checking for existing foreign key...")
            result = conn.execute(text("""
                SELECT CONSTRAINT_NAME
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'reports'
                AND COLUMN_NAME = 'research_stream_id'
                AND REFERENCED_TABLE_NAME IS NOT NULL
                LIMIT 1
            """))

            fk_row = result.fetchone()
            if fk_row:
                fk_name = fk_row[0]
                print(f"Dropping existing foreign key: {fk_name}")
                conn.execute(text(f"ALTER TABLE reports DROP FOREIGN KEY {fk_name}"))

            # Add new foreign key
            print("Adding foreign key to research_streams...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD CONSTRAINT fk_reports_research_stream
                FOREIGN KEY (research_stream_id) REFERENCES research_streams(stream_id)
                ON DELETE SET NULL
            """))

            trans.commit()
            print("Migration completed successfully!")

        except Exception as e:
            trans.rollback()
            print(f"Migration failed: {e}")
            raise

if __name__ == "__main__":
    run_migration()
