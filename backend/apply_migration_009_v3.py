"""Apply migration 009 v3 - properly handle foreign keys"""
from database import engine
from sqlalchemy import text

conn = engine.connect()

# Step 1: Drop foreign key constraint
try:
    conn.execute(text("ALTER TABLE information_sources DROP FOREIGN KEY information_sources_ibfk_1"))
    conn.commit()
    print("Dropped foreign key constraint")
except Exception as e:
    print(f"Error dropping FK: {e}")

# Step 2: Drop mandate_id column
try:
    conn.execute(text("ALTER TABLE information_sources DROP COLUMN mandate_id"))
    conn.commit()
    print("Dropped mandate_id column")
except Exception as e:
    print(f"Error dropping mandate_id: {e}")

# Step 3: Delete existing data (can't truncate due to articles FK)
try:
    conn.execute(text("DELETE FROM information_sources"))
    conn.commit()
    print("Cleared existing sources")
except Exception as e:
    print(f"Error clearing data: {e}")

# Step 4: Insert seed data
sources = [
    ('PubMed', 'https://pubmed.ncbi.nlm.nih.gov/', 'National Library of Medicine biomedical literature database'),
    ('Google Scholar', 'https://scholar.google.com/', 'Google Scholar academic search engine'),
    ('Semantic Scholar', 'https://www.semanticscholar.org/', 'AI-powered research tool for scientific literature'),
    ('arXiv', 'https://arxiv.org/', 'Open-access repository of preprints'),
    ('bioRxiv', 'https://www.biorxiv.org/', 'Preprint server for biology'),
    ('medRxiv', 'https://www.medrxiv.org/', 'Preprint server for health sciences')
]

for name, url, desc in sources:
    try:
        conn.execute(text("""
            INSERT INTO information_sources (source_name, source_url, description, is_active, created_at)
            VALUES (:name, :url, :desc, TRUE, NOW())
        """), {'name': name, 'url': url, 'desc': desc})
        conn.commit()
        print(f"Inserted source: {name}")
    except Exception as e:
        print(f"Error inserting {name}: {e}")

# Step 5: Get PubMed source_id
result = conn.execute(text("SELECT source_id FROM information_sources WHERE source_name = 'PubMed'"))
pubmed_id = result.scalar()
print(f"\nPubMed source_id: {pubmed_id}")

conn.close()
print("\nMigration 009 v3 complete!")
