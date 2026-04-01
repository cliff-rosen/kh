"""
Generate a custom demo email report from the March 1-7 production report (#131).

Modifications from standard email:
1. Truncate after 2 articles in "Reviews, Meta-Analyses & Guidelines" category
2. Drop all categories after that one
3. Footer has button matching the top CTA (now standard in template)

Usage:
    cd backend
    python scripts/generate_demo_email.py                          # Generate HTML only
    python scripts/generate_demo_email.py --send cliff@example.com # Generate + send
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, and_
from models import Report, PipelineExecution, ResearchStream, ReportArticleAssociation, Article
from services.email_template_service import EmailTemplateService, EmailReportData, EmailCategory, EmailArticle
from datetime import datetime, timedelta


# Production DB — populate from environment or .env.production
DB_HOST = os.environ.get("DB_HOST", "your-db-host")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_USER = os.environ.get("DB_USER", "admin")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "your-password")
DB_NAME = os.environ.get("DB_NAME", "kh2")

DATABASE_URL = f"mysql+aiomysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Category to truncate and how many articles to keep
TRUNCATE_CATEGORY_SUBSTRING = "reviews"
MAX_ARTICLES_IN_TRUNCATED_CATEGORY = 2


async def find_report(session, report_id):
    """Find a specific report by ID."""
    stmt = (
        select(Report, PipelineExecution, ResearchStream)
        .join(PipelineExecution, Report.pipeline_execution_id == PipelineExecution.id)
        .join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
        .where(Report.report_id == report_id)
    )
    result = await session.execute(stmt)
    return result.first()


async def get_report_articles(session, report_id):
    """Get all visible articles for a report."""
    stmt = (
        select(ReportArticleAssociation)
        .where(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.is_hidden == False
            )
        )
        .order_by(ReportArticleAssociation.ranking)
    )
    result = await session.execute(stmt)
    associations = result.scalars().all()

    article_ids = [a.article_id for a in associations]
    if article_ids:
        art_stmt = select(Article).where(Article.article_id.in_(article_ids))
        art_result = await session.execute(art_stmt)
        articles_map = {a.article_id: a for a in art_result.scalars().all()}
    else:
        articles_map = {}

    return associations, articles_map


def build_email_data(report, execution, stream, associations, articles_map):
    """Build EmailReportData from DB objects, with demo modifications."""
    config_categories = stream.presentation_config.get('categories', []) if stream.presentation_config else []

    category_id_to_name = {}
    for cat in config_categories:
        if isinstance(cat, dict):
            category_id_to_name[cat.get('id', '')] = cat.get('name', cat.get('id', ''))

    categories_dict = {}
    for assoc in associations:
        article = articles_map.get(assoc.article_id)
        if not article:
            continue
        cat_ids = assoc.presentation_categories or ['uncategorized']
        for cat_id in cat_ids:
            if cat_id not in categories_dict:
                categories_dict[cat_id] = []
            categories_dict[cat_id].append(EmailArticle(
                title=article.title or 'Untitled',
                authors=article.authors[:3] if article.authors else None,
                journal=article.journal or None,
                pub_year=article.pub_year,
                pub_month=article.pub_month,
                pub_day=article.pub_day,
                summary=assoc.ai_summary or (article.abstract[:300] + '...' if article.abstract and len(article.abstract) > 300 else article.abstract),
                url=article.url or (f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/" if article.pmid else None),
                pmid=article.pmid,
                article_id=article.article_id
            ))

    enrichments = report.enrichments or {}
    executive_summary = enrichments.get('executive_summary', '')
    category_summaries = enrichments.get('category_summaries', {})

    email_categories = []
    for cat_config in config_categories:
        cat_id = cat_config.get('id') if isinstance(cat_config, dict) else None
        if cat_id and cat_id in categories_dict:
            cat_name = category_id_to_name.get(cat_id, cat_id)
            articles = categories_dict[cat_id]

            # DEMO: Truncate matching category and drop everything after
            if TRUNCATE_CATEGORY_SUBSTRING.lower() in cat_name.lower():
                original_count = len(articles)
                articles = articles[:MAX_ARTICLES_IN_TRUNCATED_CATEGORY]
                print(f"  Truncated '{cat_name}': {original_count} -> {len(articles)} articles")
                email_categories.append(EmailCategory(
                    id=cat_id,
                    name=cat_name,
                    summary=category_summaries.get(cat_id, ''),
                    articles=articles
                ))
                print(f"  Dropping all categories after '{cat_name}'")
                break

            email_categories.append(EmailCategory(
                id=cat_id,
                name=cat_name,
                summary=category_summaries.get(cat_id, ''),
                articles=articles
            ))

    report_url = f"https://www.knowledgehorizon.ai/reports?stream={stream.stream_id}&report={report.report_id}"

    date_range_start = None
    date_range_end = None
    if execution.start_date:
        try:
            start_dt = datetime.strptime(execution.start_date, '%Y-%m-%d')
            date_range_start = start_dt.strftime('%b %d, %Y')
        except ValueError:
            pass
    if execution.end_date:
        try:
            end_dt = datetime.strptime(execution.end_date, '%Y-%m-%d')
            date_range_end = end_dt.strftime('%b %d, %Y')
        except ValueError:
            pass

    publication_date = ''
    if execution.end_date:
        try:
            end_dt = datetime.strptime(execution.end_date, '%Y-%m-%d')
            pub_dt = end_dt + timedelta(days=1)
            publication_date = pub_dt.strftime('%b %d, %Y')
        except ValueError:
            pass
    if not publication_date and report.report_date:
        publication_date = report.report_date.strftime('%b %d, %Y')

    return EmailReportData(
        report_name=report.report_name,
        stream_name=stream.stream_name,
        report_date=publication_date,
        executive_summary=executive_summary,
        categories=email_categories,
        report_url=report_url,
        date_range_start=date_range_start,
        date_range_end=date_range_end
    )


async def main():
    print("Connecting to production database (kh2)...")
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print("Looking for report #131...")
        row = await find_report(session, 131)
        if not row:
            print("Report #131 not found!")
            return

        report, execution, stream = row
        print(f"Found: Report #{report.report_id} '{report.report_name}'")
        print(f"  Stream: {stream.stream_name}")
        print(f"  Coverage: {execution.start_date} - {execution.end_date}")

        print("Fetching articles...")
        associations, articles_map = await get_report_articles(session, report.report_id)
        print(f"  {len(associations)} visible articles")

        print("Building email data...")
        email_data = build_email_data(report, execution, stream, associations, articles_map)

        print("\nCategories in email:")
        for cat in email_data.categories:
            print(f"  {cat.name}: {len(cat.articles)} articles")

        print("\nGenerating HTML...")
        template_service = EmailTemplateService()
        html = template_service.generate_report_email(email_data)

        output_path = os.path.join(os.path.dirname(__file__), '..', 'demo_report_email.html')
        output_path = os.path.normpath(output_path)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"\nSaved to: {output_path}")
        print("Open this file in a browser to preview.")

        # Send email if requested
        if len(sys.argv) > 1 and sys.argv[1] == '--send':
            recipient = sys.argv[2] if len(sys.argv) > 2 else 'cliff.rosen@gmail.com'
            print(f"\nSending email to {recipient}...")

            logo_path = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'KH logo black.png'))
            images = None
            if os.path.exists(logo_path):
                with open(logo_path, 'rb') as f:
                    images = {'kh_logo': f.read()}

            from services.email_service import EmailService
            email_service = EmailService()
            subject = f"{stream.stream_name}: {email_data.report_date} (Demo)"
            success = await email_service.send_report_email(
                to_email=recipient,
                report_name=report.report_name,
                html_content=html,
                subject=subject,
                images=images
            )
            if success:
                print(f"Email sent to {recipient}")
            else:
                print("Failed to send email")

    await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
