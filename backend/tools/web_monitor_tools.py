"""
Web Monitor Agent Tools

Factory function that creates per-invocation tools for the site exploration agent.
These tools are NOT globally registered — they are created fresh for each agent run
with a shared article_collector list.

Tools:
- fetch_page: Fetch and extract content from a URL
- submit_article: Submit a discovered article to the collector
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Union

import httpx
import trafilatura
from bs4 import BeautifulSoup

from tools.registry import ToolConfig, ToolResult
from schemas.canonical_types import CanonicalResearchArticle

logger = logging.getLogger(__name__)

# HTTP request timeout (seconds)
REQUEST_TIMEOUT = 30


def create_web_monitor_tools(
    article_collector: List[CanonicalResearchArticle],
    source_url: str,
) -> Dict[str, ToolConfig]:
    """
    Create tools for the web monitor site agent.

    Args:
        article_collector: Mutable list that submit_article appends to.
        source_url: The base site URL (for source_metadata).

    Returns:
        Dict mapping tool name -> ToolConfig, ready to pass to run_agent_loop.
    """

    async def execute_fetch_page(
        params: Dict[str, Any], db: Any, user_id: int, context: Dict[str, Any]
    ) -> Union[str, ToolResult]:
        """Fetch a page and extract its content."""
        url = params.get("url", "")
        if not url:
            return "Error: url parameter is required"

        try:
            async with httpx.AsyncClient(
                timeout=REQUEST_TIMEOUT,
                follow_redirects=True,
                headers={
                    "User-Agent": "KnowledgeHorizon/1.0 (research aggregator)",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
            ) as client:
                response = await client.get(url)
                response.raise_for_status()
        except Exception as e:
            return f"Error fetching {url}: {e}"

        html = response.text

        # Extract main content with trafilatura
        extracted = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=True,
            output_format="txt",
        )

        if not extracted:
            return f"Could not extract content from {url}"

        # Parse metadata from HTML
        soup = BeautifulSoup(html, "html.parser")

        # Title
        title = None
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        if not title:
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                title = og_title["content"].strip()
        if not title:
            h1 = soup.find("h1")
            if h1:
                title = h1.get_text(strip=True)

        # Published date
        published_date = _extract_page_date(soup)

        # Author
        authors = _extract_page_authors(soup)

        result_parts = []
        if title:
            result_parts.append(f"Title: {title}")
        if published_date:
            result_parts.append(f"Published: {published_date}")
        if authors:
            result_parts.append(f"Authors: {', '.join(authors)}")
        result_parts.append(f"\nContent:\n{extracted}")

        return "\n".join(result_parts)

    async def execute_submit_article(
        params: Dict[str, Any], db: Any, user_id: int, context: Dict[str, Any]
    ) -> Union[str, ToolResult]:
        """Submit a discovered article to the collector."""
        title = params.get("title", "").strip()
        url = params.get("url", "").strip()
        content = params.get("content", "").strip()

        if not title or not url:
            return "Error: title and url are required"

        # Parse optional fields
        published_date_str = params.get("published_date")
        authors = params.get("authors", [])

        # Parse date if provided
        pub_year = pub_month = pub_day = None
        if published_date_str:
            try:
                from dateutil.parser import parse as dateutil_parse
                dt = dateutil_parse(published_date_str)
                pub_year = dt.year
                pub_month = dt.month
                pub_day = dt.day
            except (ValueError, ImportError):
                pass

        # Build abstract from first 500 chars of content
        abstract = content[:500] if content else None
        if abstract and len(content) > 500:
            abstract += "..."

        import hashlib
        article_id = hashlib.sha256(url.encode()).hexdigest()[:16]

        article = CanonicalResearchArticle(
            id=article_id,
            source="web_monitor",
            title=title,
            authors=authors,
            abstract=abstract,
            full_text=content if content else None,
            url=url,
            pub_year=pub_year,
            pub_month=pub_month,
            pub_day=pub_day,
            source_metadata={
                "site_url": source_url,
                "discovery_method": "site_agent",
                "web_source_id": context.get("web_source_id", ""),
            },
            retrieved_at=datetime.utcnow().isoformat(),
        )

        article_collector.append(article)
        return f"Article submitted: \"{title}\" ({len(article_collector)} total so far)"

    # Build tool configs
    fetch_page = ToolConfig(
        name="fetch_page",
        description="Fetch a web page and extract its text content, title, published date, and authors. Use this to read pages on the site you are monitoring.",
        input_schema={
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The full URL of the page to fetch",
                },
            },
            "required": ["url"],
        },
        executor=execute_fetch_page,
        category="web_monitor",
        is_global=False,
    )

    submit_article = ToolConfig(
        name="submit_article",
        description="Submit an article you've found that matches the directive. Call this for each relevant article you discover.",
        input_schema={
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Article title",
                },
                "url": {
                    "type": "string",
                    "description": "Full URL of the article",
                },
                "content": {
                    "type": "string",
                    "description": "Full text content of the article",
                },
                "published_date": {
                    "type": "string",
                    "description": "Publication date (ISO format or natural language, e.g. '2025-01-15' or 'January 15, 2025')",
                },
                "authors": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of author names",
                },
            },
            "required": ["title", "url", "content"],
        },
        executor=execute_submit_article,
        category="web_monitor",
        is_global=False,
    )

    return {
        "fetch_page": fetch_page,
        "submit_article": submit_article,
    }


# =============================================================================
# Utility functions (extracted from old web_monitor_service.py)
# =============================================================================

def _extract_page_date(soup: BeautifulSoup) -> str | None:
    """Try to extract a publication date string from HTML metadata."""
    # Common meta tags for dates
    date_meta_names = [
        ("property", "article:published_time"),
        ("name", "date"),
        ("name", "pubdate"),
        ("name", "publishdate"),
        ("property", "og:article:published_time"),
        ("name", "DC.date.issued"),
        ("itemprop", "datePublished"),
    ]

    for attr_name, attr_value in date_meta_names:
        tag = soup.find("meta", attrs={attr_name: attr_value})
        if tag and tag.get("content"):
            return tag["content"]

    # Try <time> elements with datetime attribute
    time_tag = soup.find("time", datetime=True)
    if time_tag:
        return time_tag["datetime"]

    return None


def _extract_page_authors(soup: BeautifulSoup) -> List[str]:
    """Try to extract author names from HTML metadata."""
    authors = []

    for attr_name, attr_value in [
        ("name", "author"),
        ("property", "article:author"),
        ("name", "DC.creator"),
    ]:
        tag = soup.find("meta", attrs={attr_name: attr_value})
        if tag and tag.get("content"):
            authors.append(tag["content"].strip())

    if not authors:
        author_links = soup.find_all("a", rel="author")
        for link in author_links:
            text = link.get_text(strip=True)
            if text:
                authors.append(text)

    return authors
