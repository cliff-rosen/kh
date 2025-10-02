"""Apply migration 009 - ALTER existing table instead of DROP/CREATE"""
from database import engine
from sqlalchemy import text

conn = engine.connect()

# Remove old columns and constraints
try:
    conn.execute(text("ALTER TABLE information_sources DROP COLUMN mandate_id"))
    conn.commit()
    print("Dropped mandate_id column")
except Exception as e:
    print(f"Error dropping mandate_id: {e}")

try:
    conn.execute(text("ALTER TABLE information_sources DROP COLUMN source_type"))
    conn.commit()
    print("Dropped source_type column")
except Exception as e:
    print(f"Error dropping source_type: {e}")

try:
    conn.execute(text("ALTER TABLE information_sources DROP COLUMN retrieval_config"))
    conn.commit()
    print("Dropped retrieval_config column")
except Exception as e:
    print(f"Error dropping retrieval_config: {e}")

try:
    conn.execute(text("ALTER TABLE information_sources DROP COLUMN search_queries"))
    conn.commit()
    print("Dropped search_queries column")
except Exception as e:
    print(f"Error dropping search_queries: {e}")

try:
    conn.execute(text("ALTER TABLE information_sources DROP COLUMN update_frequency"))
    conn.commit()
    print("Dropped update_frequency column")
except Exception as e:
    print(f"Error dropping update_frequency: {e}")

try:
    conn.execute(text("ALTER TABLE information_sources DROP COLUMN last_fetched"))
    conn.commit()
    print("Dropped last_fetched column")
except Exception as e:
    print(f"Error dropping last_fetched: {e}")

# Add new columns
try:
    conn.execute(text("ALTER TABLE information_sources ADD COLUMN description TEXT"))
    conn.commit()
    print("Added description column")
except Exception as e:
    print(f"Error adding description: {e}")

try:
    conn.execute(text("ALTER TABLE information_sources ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))
    conn.commit()
    print("Added updated_at column")
except Exception as e:
    print(f"Error adding updated_at: {e}")

# Make source_name unique
try:
    conn.execute(text("ALTER TABLE information_sources ADD UNIQUE INDEX idx_source_name_unique (source_name)"))
    conn.commit()
    print("Added unique constraint on source_name")
except Exception as e:
    print(f"Error adding unique constraint: {e}")

# Clear existing data and insert seed data
try:
    conn.execute(text("TRUNCATE TABLE information_sources"))
    conn.commit()
    print("Cleared existing sources")
except Exception as e:
    print(f"Error truncating: {e}")

# Insert seed data
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

conn.close()
print("\nMigration 009 complete!")
