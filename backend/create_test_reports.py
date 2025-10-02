"""Create two test reports for stream 4 with articles"""
from database import engine
from sqlalchemy import text
from datetime import datetime, timedelta
import json

conn = engine.connect()

user_id = 22
stream_id = 4

# Get 30 random articles (15 for each report)
result = conn.execute(text("""
    SELECT article_id, title
    FROM articles
    WHERE source_id = 1
    ORDER BY RAND()
    LIMIT 30
"""))
articles = result.fetchall()

# Split articles into two groups
report1_articles = articles[:15]
report2_articles = articles[15:30]

print(f"Found {len(articles)} articles")
print(f"Report 1 will have {len(report1_articles)} articles")
print(f"Report 2 will have {len(report2_articles)} articles")

# Report 1 - One week ago
report1_date = (datetime.now() - timedelta(days=7)).date()
report1_created = datetime.now() - timedelta(days=7)

conn.execute(text("""
    INSERT INTO reports (user_id, research_stream_id, report_date, executive_summary,
                        key_highlights, thematic_analysis, coverage_stats,
                        is_read, created_at)
    VALUES (:user_id, :stream_id, :report_date, :summary, :highlights, :analysis, :stats,
            FALSE, :created_at)
"""), {
    'user_id': user_id,
    'stream_id': stream_id,
    'report_date': report1_date,
    'summary': 'This week\'s intelligence report highlights key developments in the biomedical research landscape.',
    'highlights': json.dumps([
        'Significant advances in cardiovascular research',
        'New therapeutic approaches identified',
        'Regulatory updates in clinical trials'
    ]),
    'analysis': 'The research landscape shows continued innovation in therapeutic development with a focus on precision medicine approaches.',
    'stats': json.dumps({'total_articles': len(report1_articles), 'sources': ['PubMed']}),
    'created_at': report1_created
})
conn.commit()

# Get the report ID
result = conn.execute(text("SELECT LAST_INSERT_ID()"))
report1_id = result.scalar()
print(f"\nCreated Report 1 (ID: {report1_id}) for {report1_date}")

# Add articles to report 1
for idx, (article_id, title) in enumerate(report1_articles, 1):
    conn.execute(text("""
        INSERT INTO report_article_associations
        (report_id, article_id, relevance_score, relevance_rationale, ranking,
         is_starred, is_read, added_at)
        VALUES (:report_id, :article_id, :score, :rationale, :ranking,
                FALSE, FALSE, :added_at)
    """), {
        'report_id': report1_id,
        'article_id': article_id,
        'score': 0.85 - (idx * 0.02),  # Decreasing relevance scores
        'rationale': f'Relevant to research stream focus areas',
        'ranking': idx,
        'added_at': report1_created
    })
    conn.commit()
    print(f"  Added article {article_id}: {title[:60]}...")

# Report 2 - Today
report2_date = datetime.now().date()
report2_created = datetime.now()

conn.execute(text("""
    INSERT INTO reports (user_id, research_stream_id, report_date, executive_summary,
                        key_highlights, thematic_analysis, coverage_stats,
                        is_read, created_at)
    VALUES (:user_id, :stream_id, :report_date, :summary, :highlights, :analysis, :stats,
            FALSE, :created_at)
"""), {
    'user_id': user_id,
    'stream_id': stream_id,
    'report_date': report2_date,
    'summary': 'Latest intelligence report showcasing emerging trends and breakthrough research in targeted therapy areas.',
    'highlights': json.dumps([
        'Novel biomarker discoveries',
        'Clinical trial updates',
        'Competitive landscape shifts'
    ]),
    'analysis': 'Recent publications indicate accelerating progress in precision diagnostics and personalized treatment strategies.',
    'stats': json.dumps({'total_articles': len(report2_articles), 'sources': ['PubMed']}),
    'created_at': report2_created
})
conn.commit()

# Get the report ID
result = conn.execute(text("SELECT LAST_INSERT_ID()"))
report2_id = result.scalar()
print(f"\nCreated Report 2 (ID: {report2_id}) for {report2_date}")

# Add articles to report 2
for idx, (article_id, title) in enumerate(report2_articles, 1):
    conn.execute(text("""
        INSERT INTO report_article_associations
        (report_id, article_id, relevance_score, relevance_rationale, ranking,
         is_starred, is_read, added_at)
        VALUES (:report_id, :article_id, :score, :rationale, :ranking,
                FALSE, FALSE, :added_at)
    """), {
        'report_id': report2_id,
        'article_id': article_id,
        'score': 0.88 - (idx * 0.02),  # Decreasing relevance scores
        'rationale': f'High relevance to research objectives',
        'ranking': idx,
        'added_at': report2_created
    })
    conn.commit()
    print(f"  Added article {article_id}: {title[:60]}...")

conn.close()

print("\nSuccessfully created 2 reports for stream 4")
print(f"  Report 1: {report1_id} ({report1_date}) - {len(report1_articles)} articles")
print(f"  Report 2: {report2_id} ({report2_date}) - {len(report2_articles)} articles")
