"""
Create PubMed information source and update articles
"""

from database import engine
from sqlalchemy import text

conn = engine.connect()

# Check if PubMed source already exists
result = conn.execute(text("SELECT source_id FROM information_sources WHERE source_name = 'PubMed'"))
existing = result.scalar()

if existing:
    source_id = existing
    print(f"PubMed source already exists with ID: {source_id}")
else:
    # Get first research stream (or create generic one)
    result = conn.execute(text('SELECT stream_id FROM research_streams LIMIT 1'))
    stream_id = result.scalar()

    if not stream_id:
        print("No research streams found - creating a default one")
        conn.execute(text("""
            INSERT INTO research_streams (user_id, stream_name, stream_type, report_frequency, is_active, created_at, updated_at)
            VALUES (1, 'Default Stream', 'scientific', 'weekly', 1, NOW(), NOW())
        """))
        conn.commit()
        result = conn.execute(text('SELECT LAST_INSERT_ID()'))
        stream_id = result.scalar()

    print(f"Using research_stream_id: {stream_id}")

    # Create PubMed source
    conn.execute(text("""
        INSERT INTO information_sources (research_stream_id, source_type, source_name, source_url, is_active, created_at)
        VALUES (:stream_id, 'JOURNAL', 'PubMed', 'https://pubmed.ncbi.nlm.nih.gov/', 1, NOW())
    """), {'stream_id': stream_id})
    conn.commit()

    result = conn.execute(text('SELECT LAST_INSERT_ID()'))
    source_id = result.scalar()
    print(f"Created PubMed source with ID: {source_id}")

# Update all articles that have a pmid to use this source_id
result = conn.execute(text("""
    UPDATE articles
    SET source_id = :source_id
    WHERE pmid IS NOT NULL AND pmid != ''
"""), {'source_id': source_id})
conn.commit()

print(f"Updated {result.rowcount} articles with PubMed source_id")

conn.close()
