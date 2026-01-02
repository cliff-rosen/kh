"""
Chat page config for the reports page.

Defines context builder and client actions for report chat functionality.

ARCHITECTURE:
- Context builder: Provides page-level context (what the user is viewing)
- Tools: Auto-registered and auto-documented by ChatStreamService
- Data: Report contents loaded by ChatStreamService._load_report_context()
"""

from typing import Dict, Any
from .registry import register_page


# =============================================================================
# Context Builder
# =============================================================================

def build_context(context: Dict[str, Any]) -> str:
    """
    Build context for the reports page.

    Always shows the current state of stream, report, and article selection.
    Actual report data is loaded by ChatStreamService._load_report_context().
    """
    stream_id = context.get("stream_id")
    stream_name = context.get("stream_name")
    report_id = context.get("report_id")
    report_name = context.get("report_name")
    article_count = context.get("article_count", 0)
    current_article = context.get("current_article")

    parts = ["Page: Reports", ""]

    # Stream status
    if stream_id:
        if stream_name:
            parts.append(f"Stream: {stream_name} (ID {stream_id})")
        else:
            parts.append(f"Stream: ID {stream_id}")
    else:
        parts.append("Stream: Not selected - user needs to select a research stream")

    # Report status
    if report_id and report_name:
        parts.append(f"Report: {report_name} (ID {report_id}, {article_count} articles)")
    elif report_id:
        parts.append(f"Report: ID {report_id} (selected)")
    else:
        parts.append("Report: Not selected - user needs to select a report from the stream")

    # Article status
    if current_article:
        article_title = current_article.get("title", "Unknown")
        parts.append(f"Article: Viewing '{article_title[:50]}{'...' if len(article_title) > 50 else ''}'")
        parts.append("")
        parts.append("Focus on the current article unless they ask about other articles or the report.")
    else:
        parts.append("Article: None open - user is viewing the report overview")

    return "\n".join(parts)


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="reports",
    context_builder=build_context
    # Note: Global actions (close_chat) are automatically included
)
