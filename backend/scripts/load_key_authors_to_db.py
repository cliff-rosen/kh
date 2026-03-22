"""
Create a temp table key_author_articles and load the PubMed results into it.
Uses the same column structure as the articles table (minus relationships/source_id).
Runs against khdev by default (set ENVIRONMENT=production for kh2).

Usage: python scripts/load_key_authors_to_db.py
"""
import asyncio
import json
import sys
from pathlib import Path

# Add backend root to path so imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from database import async_engine

JSON_PATH = Path(__file__).parent / "key_authors_articles.json"

CREATE_TABLE_SQL = """
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
"""

INSERT_SQL = """
INSERT IGNORE INTO key_author_articles
    (title, url, authors, abstract, journal, volume, issue, pages, medium, doi, pmid, pub_year, pub_month, pub_day, comp_date)
VALUES
    (:title, :url, :authors, :abstract, :journal, :volume, :issue, :pages, :medium, :doi, :pmid, :pub_year, :pub_month, :pub_day, :comp_date)
"""


async def main():
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        articles = json.load(f)

    print(f"Loaded {len(articles)} articles from JSON")

    async with async_engine.begin() as conn:
        # Create table
        await conn.execute(text(CREATE_TABLE_SQL))
        print("Created key_author_articles table (if not exists)")

        # Insert articles
        inserted = 0
        for art in articles:
            params = {
                "title": art["title"],
                "url": art["url"],
                "authors": json.dumps(art["authors"]),
                "abstract": art["abstract"],
                "journal": art["journal"],
                "volume": art["volume"],
                "issue": art["issue"],
                "pages": art["pages"],
                "medium": art["medium"],
                "doi": art["doi"],
                "pmid": art["pmid"],
                "pub_year": art["pub_year"],
                "pub_month": art["pub_month"],
                "pub_day": art["pub_day"],
                "comp_date": art["comp_date"],
            }
            await conn.execute(text(INSERT_SQL), params)
            inserted += 1

        print(f"Inserted {inserted} rows")

        # Verify
        result = await conn.execute(text("SELECT COUNT(*) FROM key_author_articles"))
        count = result.scalar()
        print(f"Total rows in key_author_articles: {count}")


if __name__ == "__main__":
    asyncio.run(main())
