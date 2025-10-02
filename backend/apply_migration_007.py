"""
Apply migration 007 to add PubMed fields to articles table
"""

from database import engine
from sqlalchemy import text

statements = [
    "ALTER TABLE articles ADD COLUMN pmid VARCHAR(20) NULL",
    "ALTER TABLE articles ADD COLUMN abstract TEXT NULL",
    "ALTER TABLE articles ADD COLUMN comp_date DATE NULL",
    "ALTER TABLE articles ADD COLUMN year VARCHAR(4) NULL",
    "ALTER TABLE articles ADD COLUMN journal VARCHAR(255) NULL",
    "ALTER TABLE articles ADD COLUMN volume VARCHAR(50) NULL",
    "ALTER TABLE articles ADD COLUMN issue VARCHAR(50) NULL",
    "ALTER TABLE articles ADD COLUMN medium VARCHAR(100) NULL",
    "ALTER TABLE articles ADD COLUMN pages VARCHAR(50) NULL",
    "ALTER TABLE articles ADD COLUMN poi VARCHAR(255) NULL",
    "ALTER TABLE articles ADD COLUMN doi VARCHAR(255) NULL",
    "ALTER TABLE articles ADD COLUMN is_systematic BOOLEAN DEFAULT FALSE",
    "CREATE INDEX idx_articles_pmid ON articles(pmid)",
    "CREATE INDEX idx_articles_doi ON articles(doi)"
]

conn = engine.connect()
for stmt in statements:
    try:
        conn.execute(text(stmt))
        conn.commit()
        print(f"OK: {stmt[:50]}...")
    except Exception as e:
        if "Duplicate column name" in str(e) or "already exists" in str(e):
            print(f"SKIP: {stmt[:50]}... (already exists)")
        else:
            print(f"ERROR: {stmt[:50]}... {e}")

conn.close()
print("\nMigration 007 complete!")
