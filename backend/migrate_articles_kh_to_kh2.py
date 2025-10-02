"""
Migrate articles from kh.articles to kh2.articles
Maps old schema to new schema with PubMed fields
"""

from database import engine
from sqlalchemy import text
import json

# Field mapping from kh.articles to kh2.articles
# kh.articles fields: article_id, pmid, title, abstract, summary, comp_date, year, authors,
#                     journal, volume, issue, medium, pages, poi, doi, is_systematic,
#                     study_type, study_outcome, poi_list, doi_list, score, batch

def migrate_articles():
    conn = engine.connect()

    # Get count of articles in source
    result = conn.execute(text("SELECT COUNT(*) FROM kh.articles"))
    total = result.scalar()
    print(f"Found {total} articles in kh.articles")

    # Fetch all articles from kh.articles
    result = conn.execute(text("""
        SELECT
            article_id, pmid, title, abstract, summary, comp_date, year, authors,
            journal, volume, issue, medium, pages, poi, doi, is_systematic,
            study_type, study_outcome, poi_list, doi_list, score, batch
        FROM kh.articles
    """))

    articles = result.fetchall()
    print(f"Fetched {len(articles)} articles")

    migrated = 0
    skipped = 0
    errors = 0

    for article in articles:
        try:
            # Parse authors (kh has comma-separated string, kh2 needs JSON array)
            authors_str = article[7] if article[7] else ""
            authors_list = [a.strip() for a in authors_str.split(',')] if authors_str else []
            authors_json = json.dumps(authors_list)

            # Build article_metadata from old fields
            metadata = {}
            if article[16]:  # study_type
                metadata['study_type'] = article[16]
            if article[17]:  # study_outcome
                metadata['study_outcome'] = article[17]
            if article[18]:  # poi_list
                metadata['poi_list'] = article[18]
            if article[19]:  # doi_list
                metadata['doi_list'] = article[19]
            if article[20]:  # score
                metadata['score'] = article[20]
            if article[21]:  # batch
                metadata['batch'] = article[21]

            metadata_json = json.dumps(metadata)

            # Convert is_systematic to boolean
            is_systematic = 1 if article[15] and str(article[15]).lower() in ('yes', '1', 'true') else 0

            # Insert into kh2.articles (source_type is NULL since 'pubmed' not in ENUM)
            conn.execute(text("""
                INSERT INTO kh2.articles (
                    title, url, authors, publication_date, summary, ai_summary, full_text,
                    source_type, article_metadata, theme_tags, first_seen, last_updated, fetch_count,
                    pmid, abstract, comp_date, year, journal, volume, issue, medium, pages,
                    poi, doi, is_systematic
                ) VALUES (
                    :title, NULL, :authors, NULL, :summary, NULL, NULL,
                    NULL, :metadata, '[]', NOW(), NOW(), 1,
                    :pmid, :abstract, :comp_date, :year, :journal, :volume, :issue, :medium, :pages,
                    :poi, :doi, :is_systematic
                )
            """), {
                'title': article[2],  # title
                'authors': authors_json,
                'summary': article[4],  # summary
                'metadata': metadata_json,
                'pmid': article[1],  # pmid
                'abstract': article[3],  # abstract
                'comp_date': article[5],  # comp_date
                'year': article[6],  # year
                'journal': article[8],  # journal
                'volume': article[9],  # volume
                'issue': article[10],  # issue
                'medium': article[11],  # medium
                'pages': article[12],  # pages
                'poi': article[13],  # poi
                'doi': article[14],  # doi
                'is_systematic': is_systematic
            })

            conn.commit()
            migrated += 1

            if migrated % 100 == 0:
                print(f"Migrated {migrated}/{total} articles...")

        except Exception as e:
            if "Duplicate entry" in str(e):
                skipped += 1
            else:
                errors += 1
                print(f"Error migrating article {article[0]}: {e}")

    conn.close()

    print(f"\nMigration complete!")
    print(f"Migrated: {migrated}")
    print(f"Skipped (duplicates): {skipped}")
    print(f"Errors: {errors}")

if __name__ == "__main__":
    migrate_articles()
