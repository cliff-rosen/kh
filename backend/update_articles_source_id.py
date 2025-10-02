"""Update articles with PubMed source_id"""
from database import engine
from sqlalchemy import text

conn = engine.connect()

result = conn.execute(text("UPDATE articles SET source_id = 1 WHERE pmid IS NOT NULL AND pmid != ''"))
conn.commit()

print(f"Updated {result.rowcount} articles with PubMed source_id (1)")

conn.close()
