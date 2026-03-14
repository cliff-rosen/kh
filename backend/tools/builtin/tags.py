"""
Tag Tools

Tools for listing tags and searching articles by tags.
These are global tools available on all pages.
"""

import logging
from typing import Any, Dict, Union

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolResult, register_tool
from utils.date_utils import format_pub_date

logger = logging.getLogger(__name__)


# =============================================================================
# Tool Executors
# =============================================================================

async def execute_list_tags(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """List all tags visible to the user."""
    from services.tag_service import TagService

    org_id = context.get("org_id")

    try:
        service = TagService(db)
        include_counts = params.get("include_counts", True)

        if include_counts:
            # Use aggregate to get counts — need article_ids scope
            # For a general listing, get all tags then get counts separately
            tags = await service.list_tags(user_id=user_id, org_id=org_id)
        else:
            tags = await service.list_tags(user_id=user_id, org_id=org_id)

        if not tags:
            return "No tags found. You can create tags in the Article Viewer or from your Profile page."

        personal = [t for t in tags if t["scope"] == "personal"]
        org = [t for t in tags if t["scope"] == "organization"]

        lines = [f"Found {len(tags)} tags:\n"]

        if personal:
            lines.append("**Personal Tags:**")
            for t in personal:
                color_str = f" ({t['color']})" if t.get("color") else ""
                lines.append(f"  - {t['name']}{color_str} [ID: {t['tag_id']}]")
            lines.append("")

        if org:
            lines.append("**Organization Tags:**")
            for t in org:
                color_str = f" ({t['color']})" if t.get("color") else ""
                lines.append(f"  - {t['name']}{color_str} [ID: {t['tag_id']}]")
            lines.append("")

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"Error listing tags: {e}", exc_info=True)
        return f"Error listing tags: {str(e)}"


async def execute_search_articles_by_tags(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Search for articles that have specific tags assigned."""
    from services.tag_service import TagService

    org_id = context.get("org_id")
    tag_names = params.get("tag_names", [])
    tag_ids = params.get("tag_ids", [])
    max_results = min(params.get("max_results", 20), 50)
    stream_id = context.get("stream_id") or params.get("stream_id")

    if not tag_names and not tag_ids:
        return "Error: Provide tag_names or tag_ids to search by."

    try:
        service = TagService(db)

        # Resolve tag names to IDs if needed
        if tag_names and not tag_ids:
            all_tags = await service.list_tags(user_id=user_id, org_id=org_id)
            name_lower = {n.lower() for n in tag_names}
            tag_ids = [t["tag_id"] for t in all_tags if t["name"].lower() in name_lower]
            if not tag_ids:
                return f"No tags found matching: {', '.join(tag_names)}. Use list_tags to see available tags."

        articles = await service.get_articles_by_tags(
            tag_ids=tag_ids,
            user_id=user_id,
            org_id=org_id,
            stream_id=stream_id,
        )

        if not articles:
            return "No articles found with the specified tags."

        # Limit results
        articles = articles[:max_results]

        text_lines = [f"Found {len(articles)} articles with the specified tags:\n"]
        articles_data = []

        for i, article in enumerate(articles, 1):
            pub_date = format_pub_date(
                article.get("pub_year"),
                article.get("pub_month"),
                article.get("pub_day")
            ) or "Unknown"

            text_lines.append(
                f"{i}. Article ID: {article['article_id']} | PMID: {article.get('pmid', 'N/A')}\n"
                f"   Title: {article['title']}\n"
                f"   Journal: {article.get('journal', 'N/A')} ({pub_date})"
            )

            articles_data.append({
                "article_id": article["article_id"],
                "pmid": article.get("pmid"),
                "title": article["title"],
                "journal": article.get("journal"),
                "publication_date": pub_date,
            })

        payload = {
            "type": "tagged_articles",
            "data": {
                "tag_ids": tag_ids,
                "total_results": len(articles),
                "articles": articles_data,
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error searching articles by tags: {e}", exc_info=True)
        return f"Error searching articles by tags: {str(e)}"


# =============================================================================
# Register Tools
# =============================================================================

register_tool(ToolConfig(
    name="list_tags",
    description="List all tags visible to the user (personal + organization tags). Shows tag names, colors, and scopes. Use this when the user asks about their tags or before searching by tags.",
    input_schema={
        "type": "object",
        "properties": {
            "include_counts": {
                "type": "boolean",
                "description": "Include article counts per tag (default true)",
                "default": True
            }
        }
    },
    executor=execute_list_tags,
    category="tags",
    is_global=True
))

register_tool(ToolConfig(
    name="search_articles_by_tags",
    description="Search for articles that have specific tags assigned. Returns articles matching any of the given tags. Use list_tags first to find available tag names.",
    input_schema={
        "type": "object",
        "properties": {
            "tag_names": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Tag names to search for (case-insensitive). Articles matching ANY of the tags are returned."
            },
            "tag_ids": {
                "type": "array",
                "items": {"type": "integer"},
                "description": "Tag IDs to search for (alternative to names)."
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum results to return (default 20, max 50)",
                "default": 20
            }
        }
    },
    executor=execute_search_articles_by_tags,
    category="tags",
    is_global=True
))
