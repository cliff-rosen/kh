"""
Chat page config for the reports page.

Defines context builder, payloads, and client actions for report chat functionality.

ARCHITECTURE:
- Context builder: Provides page-level context (what the user is viewing)
- Tools: Report tools are global (is_global=True in tools/builtin/reports.py)
- Payloads: Tool results return payloads for structured data
- Data: Report contents loaded by ChatStreamService._load_report_context()
"""

from typing import Dict, Any
from .registry import register_page, ClientAction


# =============================================================================
# Identity
# =============================================================================

REPORTS_IDENTITY = """You are a research assistant helping users explore and understand their biomedical research reports.

You have access to tools that let you:
- List and navigate reports in a research stream
- Get report summaries, highlights, and thematic analysis
- Browse and search articles within reports
- View article details, notes, and relevance information
- Compare reports to see what's changed over time
- Find starred/important articles

When helping users:
- Be specific about article PMIDs so they can find them
- Summarize findings concisely but thoroughly
- Highlight key insights from thematic analysis and category summaries
- Help users understand trends across reports
- If an article modal is open, focus on that specific article unless asked otherwise"""


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

    # Article status (modal open)
    if current_article:
        article_title = current_article.get("title", "Unknown")
        article_pmid = current_article.get("pmid", "Unknown")
        parts.append(f"Article Modal: OPEN - Viewing PMID {article_pmid}")
        parts.append(f"  Title: {article_title[:80]}{'...' if len(article_title) > 80 else ''}")

        # Include stance analysis if available
        stance = current_article.get("stance_analysis")
        if stance and isinstance(stance, dict):
            parts.append(f"  Stance: {stance.get('stance', 'Unknown')} (confidence: {stance.get('confidence', 'N/A')})")

        parts.append("")
        parts.append("The user is viewing a specific article. Focus on this article unless they ask about others.")
    else:
        parts.append("Article Modal: Closed - user is viewing the report overview")

    return "\n".join(parts)


# =============================================================================
# Client Actions
# =============================================================================

REPORTS_CLIENT_ACTIONS = [
    ClientAction(
        action="navigate_to_article",
        description="Open a specific article in the article viewer modal",
        parameters=["article_id", "pmid"]
    ),
    ClientAction(
        action="navigate_to_report",
        description="Switch to viewing a different report",
        parameters=["report_id"]
    ),
    ClientAction(
        action="compare_reports",
        description="Open the report comparison view",
        parameters=["report_id_1", "report_id_2"]
    ),
]


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="reports",
    context_builder=build_context,
    identity=REPORTS_IDENTITY,
    client_actions=REPORTS_CLIENT_ACTIONS,
    # Payloads that tools on this page can return
    # These are for documentation - actual rendering depends on frontend handlers
    payloads=[
        "report_list",
        "report_summary",
        "report_articles",
        "article_search_results",
        "article_details",
        "article_notes",
        "report_comparison",
        "starred_articles",
    ]
    # Note: Tools are global (is_global=True) so not listed here
    # Global actions (close_chat) are automatically included
)
