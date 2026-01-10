"""
Email Template Service

Generates HTML email content from reports.
Structure: Executive summary at top, then each category with its summary followed by articles.
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from datetime import datetime

from models import Report, ReportArticleAssociation, Article, ResearchStream


class EmailTemplateService:
    """Generates HTML email content from reports"""

    def __init__(self, db: Session):
        self.db = db

    def generate_report_email(self, report_id: int) -> str:
        """
        Generate HTML email content for a report.

        Structure:
        - Header with report name and date
        - Executive summary
        - Each category section:
          - Category name and summary
          - Articles in that category
        """
        # Load report with associations
        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            raise ValueError(f"Report {report_id} not found")

        # Load stream for presentation_config (category definitions)
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        # Get categories from stream's presentation_config
        categories = []
        if stream and stream.presentation_config:
            categories = stream.presentation_config.get('categories', [])

        # Build category lookup by ID
        category_lookup = {cat['id']: cat for cat in categories}

        # Get enrichments
        enrichments = report.enrichments or {}
        executive_summary = enrichments.get('executive_summary', '')
        category_summaries = enrichments.get('category_summaries', {})

        # Load articles with their associations
        associations = self.db.query(ReportArticleAssociation, Article).join(
            Article, ReportArticleAssociation.article_id == Article.article_id
        ).filter(
            ReportArticleAssociation.report_id == report_id
        ).all()

        # Group articles by category
        articles_by_category: Dict[str, List[tuple]] = {}
        uncategorized: List[tuple] = []

        for assoc, article in associations:
            cat_ids = assoc.presentation_categories or []
            if not cat_ids:
                uncategorized.append((assoc, article))
            else:
                for cat_id in cat_ids:
                    if cat_id not in articles_by_category:
                        articles_by_category[cat_id] = []
                    articles_by_category[cat_id].append((assoc, article))

        # Generate HTML
        html = self._generate_html(
            report=report,
            stream=stream,
            executive_summary=executive_summary,
            categories=categories,
            category_summaries=category_summaries,
            articles_by_category=articles_by_category,
            uncategorized=uncategorized
        )

        return html

    def _generate_html(
        self,
        report: Report,
        stream: Optional[ResearchStream],
        executive_summary: str,
        categories: List[Dict],
        category_summaries: Dict[str, str],
        articles_by_category: Dict[str, List[tuple]],
        uncategorized: List[tuple]
    ) -> str:
        """Generate the full HTML email content"""

        stream_name = stream.stream_name if stream else "Research Report"
        report_date = report.report_date.strftime('%B %d, %Y') if report.report_date else ''

        html_parts = [
            self._html_header(report.report_name, stream_name, report_date),
            self._executive_summary_section(executive_summary),
        ]

        # Add each category section
        for category in categories:
            cat_id = category['id']
            cat_name = category.get('name', cat_id)
            cat_summary = category_summaries.get(cat_id, '')
            cat_articles = articles_by_category.get(cat_id, [])

            if cat_articles:  # Only include categories with articles
                html_parts.append(
                    self._category_section(cat_name, cat_summary, cat_articles)
                )

        # Add uncategorized if any
        if uncategorized:
            html_parts.append(
                self._category_section("Other Articles", "", uncategorized)
            )

        html_parts.append(self._html_footer())

        return '\n'.join(html_parts)

    def _html_header(self, report_name: str, stream_name: str, report_date: str) -> str:
        """Generate HTML header with styles"""
        return f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{report_name}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .header {{
            border-bottom: 2px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }}
        .header h1 {{
            color: #1e40af;
            margin: 0 0 8px 0;
            font-size: 24px;
        }}
        .header .stream-name {{
            color: #6b7280;
            font-size: 14px;
            margin: 0;
        }}
        .header .date {{
            color: #9ca3af;
            font-size: 14px;
            margin: 4px 0 0 0;
        }}
        .executive-summary {{
            background-color: #f0f9ff;
            border-left: 4px solid #2563eb;
            padding: 20px;
            margin-bottom: 30px;
            border-radius: 0 8px 8px 0;
        }}
        .executive-summary h2 {{
            color: #1e40af;
            margin: 0 0 12px 0;
            font-size: 18px;
        }}
        .executive-summary p {{
            margin: 0;
            color: #374151;
        }}
        .category-section {{
            margin-bottom: 30px;
        }}
        .category-header {{
            background-color: #f3f4f6;
            padding: 15px 20px;
            border-radius: 8px 8px 0 0;
            border-bottom: 1px solid #e5e7eb;
        }}
        .category-header h2 {{
            color: #1f2937;
            margin: 0;
            font-size: 18px;
        }}
        .category-summary {{
            padding: 15px 20px;
            background-color: #fafafa;
            border-left: 1px solid #e5e7eb;
            border-right: 1px solid #e5e7eb;
            font-style: italic;
            color: #4b5563;
        }}
        .articles-list {{
            border: 1px solid #e5e7eb;
            border-top: none;
            border-radius: 0 0 8px 8px;
        }}
        .article {{
            padding: 15px 20px;
            border-bottom: 1px solid #e5e7eb;
        }}
        .article:last-child {{
            border-bottom: none;
        }}
        .article-title {{
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 6px 0;
            font-size: 15px;
        }}
        .article-title a {{
            color: #2563eb;
            text-decoration: none;
        }}
        .article-title a:hover {{
            text-decoration: underline;
        }}
        .article-meta {{
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 8px;
        }}
        .article-summary {{
            font-size: 14px;
            color: #4b5563;
            margin: 0;
        }}
        .footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #9ca3af;
            font-size: 12px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{report_name}</h1>
            <p class="stream-name">{stream_name}</p>
            <p class="date">{report_date}</p>
        </div>'''

    def _executive_summary_section(self, summary: str) -> str:
        """Generate executive summary section"""
        if not summary:
            return ''

        return f'''
        <div class="executive-summary">
            <h2>Executive Summary</h2>
            <p>{self._format_text(summary)}</p>
        </div>'''

    def _category_section(
        self,
        category_name: str,
        category_summary: str,
        articles: List[tuple]
    ) -> str:
        """Generate a category section with its articles"""
        html = f'''
        <div class="category-section">
            <div class="category-header">
                <h2>{category_name}</h2>
            </div>'''

        if category_summary:
            html += f'''
            <div class="category-summary">
                {self._format_text(category_summary)}
            </div>'''

        html += '''
            <div class="articles-list">'''

        for assoc, article in articles:
            html += self._article_item(article, assoc)

        html += '''
            </div>
        </div>'''

        return html

    def _article_item(self, article: Article, assoc: ReportArticleAssociation) -> str:
        """Generate HTML for a single article"""
        title = article.title or "Untitled"

        # Build URL - prefer article URL, fall back to DOI or PubMed link
        url = article.url
        if not url and article.doi:
            url = f"https://doi.org/{article.doi}"
        elif not url and article.pmid:
            url = f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/"

        # Format title with link if we have a URL
        if url:
            title_html = f'<a href="{url}">{title}</a>'
        else:
            title_html = title

        # Build meta line
        meta_parts = []
        if article.authors:
            authors = article.authors
            if isinstance(authors, list) and authors:
                if len(authors) <= 3:
                    meta_parts.append(', '.join(authors))
                else:
                    meta_parts.append(f"{authors[0]} et al.")
        if article.journal:
            meta_parts.append(article.journal)
        if article.publication_date:
            meta_parts.append(article.publication_date.strftime('%Y-%m-%d'))

        meta_html = ' &bull; '.join(meta_parts) if meta_parts else ''

        # Get summary - prefer AI summary, fall back to abstract
        summary = article.ai_summary or article.abstract or article.summary or ''
        if len(summary) > 300:
            summary = summary[:297] + '...'

        return f'''
                <div class="article">
                    <p class="article-title">{title_html}</p>
                    <p class="article-meta">{meta_html}</p>
                    <p class="article-summary">{self._format_text(summary)}</p>
                </div>'''

    def _html_footer(self) -> str:
        """Generate HTML footer"""
        return f'''
        <div class="footer">
            <p>Generated by Knowledge Horizon on {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}</p>
        </div>
    </div>
</body>
</html>'''

    def _format_text(self, text: str) -> str:
        """Format text for HTML display - escape HTML and convert newlines"""
        if not text:
            return ''
        # Escape HTML special characters
        text = text.replace('&', '&amp;')
        text = text.replace('<', '&lt;')
        text = text.replace('>', '&gt;')
        # Convert newlines to <br> tags
        text = text.replace('\n', '<br>')
        return text
