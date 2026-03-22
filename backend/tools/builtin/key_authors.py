"""
Key Authors Tool

Searches PubMed live for articles by key authors tracked by the platform.
"""

import logging
from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, register_tool
from utils.date_utils import format_pub_date

logger = logging.getLogger(__name__)


async def execute_get_key_author_articles(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> str:
    """Search PubMed for articles by key authors."""
    from services.key_authors_service import search_key_author_articles

    author = params.get("author", "").strip() or None
    query = params.get("query", "").strip() or None
    start_date = params.get("start_date") or None
    end_date = params.get("end_date") or None
    max_results = params.get("max_results", 20)
    stream_id = context.get("stream_id")

    articles, total_count = await search_key_author_articles(
        db, author=author, query=query,
        start_date=start_date, end_date=end_date,
        max_results=max_results, stream_id=stream_id,
    )

    if not articles:
        parts = []
        if author:
            parts.append(f"author '{author}'")
        if query:
            parts.append(f"query '{query}'")
        filter_desc = ", ".join(parts) if parts else "any filters"
        return f"No articles found from key authors matching {filter_desc}."

    lines = [f"# Key Author Articles ({len(articles)} unique, {total_count} total matches on PubMed)", ""]

    for art in articles:
        author_str = ", ".join(art.authors[:5])
        if len(art.authors) > 5:
            author_str += f" (+{len(art.authors) - 5} more)"

        date_str = format_pub_date(art.pub_year, art.pub_month, art.pub_day) or "Unknown"

        lines.append(f"## {art.title}")
        lines.append(f"- **Authors:** {author_str}")
        lines.append(f"- **Journal:** {art.journal or 'N/A'}")
        lines.append(f"- **Date:** {date_str}")
        lines.append(f"- **PMID:** {art.pmid} | **DOI:** {art.doi or 'N/A'}")
        lines.append(f"- **URL:** {art.url}")
        if art.abstract:
            abstract_preview = art.abstract[:300]
            if len(art.abstract) > 300:
                abstract_preview += "..."
            lines.append(f"- **Abstract:** {abstract_preview}")
        lines.append("")

    return "\n".join(lines)


register_tool(ToolConfig(
    name="get_key_author_articles",
    description=(
        "Search PubMed for articles published by key authors tracked by the platform. "
        "Searches PubMed live — not a cached database. "
        "Supports filtering by author name, keyword query, date range, and result limit. "
        "Defaults to the last year if no dates are specified."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "author": {
                "type": "string",
                "description": "Key author to search for (e.g. 'Carbone M'). Omit to search all key authors."
            },
            "query": {
                "type": "string",
                "description": "Additional search terms combined with the author filter (e.g. 'mesothelioma', 'BAP1')."
            },
            "start_date": {
                "type": "string",
                "description": "Start date for PubMed search (YYYY/MM/DD). Defaults to 1 year ago."
            },
            "end_date": {
                "type": "string",
                "description": "End date for PubMed search (YYYY/MM/DD). Defaults to today."
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum articles to return per author (default 20)."
            }
        },
        "required": []
    },
    executor=execute_get_key_author_articles,
    category="research",
    is_global=True
))
