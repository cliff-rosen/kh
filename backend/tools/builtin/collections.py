"""
Collection Tools

Tools for listing collections and browsing collection articles.
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

async def execute_list_collections(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """List all collections visible to the user."""
    from services.collection_service import CollectionService

    org_id = context.get("org_id")
    scope = params.get("scope")

    try:
        service = CollectionService(db)
        collections = await service.list_collections(
            user_id=user_id,
            org_id=org_id,
            scope=scope,
        )

        if not collections:
            return "No collections found. You can create collections from the Explorer page or Collections page."

        personal = [c for c in collections if c["scope"] == "personal"]
        org = [c for c in collections if c["scope"] == "organization"]
        stream = [c for c in collections if c["scope"] == "stream"]

        lines = [f"Found {len(collections)} collections:\n"]

        for label, group in [("Personal", personal), ("Organization", org), ("Stream", stream)]:
            if group:
                lines.append(f"**{label} Collections:**")
                for c in group:
                    desc = f" — {c['description'][:60]}..." if c.get("description") and len(c["description"]) > 60 else (f" — {c['description']}" if c.get("description") else "")
                    lines.append(f"  - {c['name']} ({c['article_count']} articles) [ID: {c['collection_id']}]{desc}")
                lines.append("")

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"Error listing collections: {e}", exc_info=True)
        return f"Error listing collections: {str(e)}"


async def execute_get_collection_articles(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Get articles in a specific collection."""
    from services.collection_service import CollectionService

    org_id = context.get("org_id")
    collection_id = params.get("collection_id")
    max_results = min(params.get("max_results", 20), 50)

    if not collection_id:
        return "Error: collection_id is required. Use list_collections to find the ID."

    try:
        service = CollectionService(db)
        articles = await service.get_articles(
            collection_id=collection_id,
            user_id=user_id,
            org_id=org_id,
        )

        if articles is None:
            return "Error: Collection not found or you don't have access to it."

        if not articles:
            return "This collection is empty."

        # Limit results
        total = len(articles)
        articles = articles[:max_results]

        text_lines = [f"Collection has {total} articles{f' (showing first {max_results})' if total > max_results else ''}:\n"]
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
            "type": "collection_articles",
            "data": {
                "collection_id": collection_id,
                "total_articles": total,
                "articles": articles_data,
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error getting collection articles: {e}", exc_info=True)
        return f"Error getting collection articles: {str(e)}"


# =============================================================================
# Register Tools
# =============================================================================

register_tool(ToolConfig(
    name="list_collections",
    description="List all article collections visible to the user. Shows collection names, scopes (personal/organization/stream), article counts, and descriptions. Use this when the user asks about their collections.",
    input_schema={
        "type": "object",
        "properties": {
            "scope": {
                "type": "string",
                "enum": ["personal", "organization", "stream"],
                "description": "Filter by scope (optional — returns all if not specified)"
            }
        }
    },
    executor=execute_list_collections,
    category="collections",
    is_global=True
))

register_tool(ToolConfig(
    name="get_collection_articles",
    description="Get all articles in a specific collection. Use list_collections first to find the collection ID.",
    input_schema={
        "type": "object",
        "properties": {
            "collection_id": {
                "type": "integer",
                "description": "The collection ID"
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum results to return (default 20, max 50)",
                "default": 20
            }
        },
        "required": ["collection_id"]
    },
    executor=execute_get_collection_articles,
    category="collections",
    is_global=True
))
