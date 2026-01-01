"""
Chat page config for the reports page.

Defines context builder and client actions for report chat functionality.

ARCHITECTURE:
- Context builder: Provides page-level context (what the user is viewing)
- Tools: Auto-registered and auto-documented by ChatStreamService
- Data: Report contents loaded by ChatStreamService._load_report_context()
"""

from typing import Dict, Any
from .registry import ClientAction, register_page


# =============================================================================
# Context Builder
# =============================================================================

def build_context(context: Dict[str, Any]) -> str:
    """
    Build context for the reports page.

    Returns page state info. Actual report data and tool docs are added
    by ChatStreamService automatically.
    """
    report_name = context.get("report_name", "Unknown Report")
    article_count = context.get("article_count", 0)
    has_current_article = context.get("current_article") is not None

    parts = [
        f"Page: Reports",
        f"Report: {report_name}",
        f"Articles: {article_count}",
    ]

    if has_current_article:
        parts.append("")
        parts.append("The user is viewing a specific article in detail. Focus on that article unless they ask about other articles or the broader report.")

    return "\n".join(parts)


# =============================================================================
# Client Actions
# =============================================================================

CLIENT_ACTIONS = [
    ClientAction(
        action="close_chat",
        description="Close the chat panel"
    ),
]


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="reports",
    context_builder=build_context,
    client_actions=CLIENT_ACTIONS
)
