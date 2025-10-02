"""Apply migration 009"""
from database import engine
from sqlalchemy import text

conn = engine.connect()

# Drop the old table first
try:
    conn.execute(text("DROP TABLE IF EXISTS information_sources"))
    conn.commit()
    print("Dropped old information_sources table")
except Exception as e:
    print(f"Error dropping table: {e}")

# Create new table
try:
    conn.execute(text("""
        CREATE TABLE information_sources (
            source_id INT AUTO_INCREMENT PRIMARY KEY,
            source_name VARCHAR(255) NOT NULL UNIQUE,
            source_url VARCHAR(500),
            description TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_source_name (source_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """))
    conn.commit()
    print("Created new information_sources table")
except Exception as e:
    print(f"Error creating table: {e}")

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
            INSERT INTO information_sources (source_name, source_url, description, is_active)
            VALUES (:name, :url, :desc, TRUE)
        """), {'name': name, 'url': url, 'desc': desc})
        conn.commit()
        print(f"Inserted source: {name}")
    except Exception as e:
        print(f"Error inserting {name}: {e}")

conn.close()
print("\nMigration 009 complete!")
