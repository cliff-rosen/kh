"""
Payload configurations for the reports page.
Defines context builder and client actions for report chat functionality.

ARCHITECTURE NOTE:
    This module provides PAGE-LEVEL INSTRUCTIONS only. It defines:
    - How the LLM should behave on this page
    - What capabilities are available
    - Client actions that can be triggered

    Actual DATA (report contents, articles, summaries) is loaded from the database
    by GeneralChatService._load_report_context(). Do NOT add data formatting here.

    The separation is:
    - chat_payloads/*.py → Instructions, behavior, payload types
    - GeneralChatService → Data loading, context enrichment from DB/frontend

Note: PubMed tools are registered globally via backend/tools/builtin/pubmed.py
"""

from typing import Dict, Any
from .registry import ClientAction, register_page


def build_context(context: Dict[str, Any]) -> str:
    """
    Build INSTRUCTIONS for the reports page chat.

    NOTE: This provides behavioral instructions only. Actual report/article data
    is loaded by GeneralChatService._load_report_context() which merges:
    - Database data (report, articles, summaries)
    - Frontend context (current_article with stance analysis from UI cache)

    Do NOT add data formatting here - that belongs in GeneralChatService.
    """
    report_id = context.get("report_id")
    report_name = context.get("report_name", "Unknown Report")
    article_count = context.get("article_count", 0)
    has_current_article = context.get("current_article") is not None

    # Adjust instructions based on whether user is viewing a specific article
    if has_current_article:
        focus_instructions = """
    IMPORTANT: The user is currently viewing a SPECIFIC ARTICLE in detail.
    The full article data including abstract and any stance analysis is provided below.
    Focus your responses on this article unless the user explicitly asks about other articles
    or the broader report.

    You can help the user:
    - Explain the article's findings, methodology, and conclusions
    - Discuss the stance analysis and what it means
    - Compare this article to others in the report
    - Explain technical terms or concepts from the abstract
    - Discuss the authors, journal, or publication context
    - Relate this article to the broader research topic"""
    else:
        focus_instructions = """
    You can help the user:
    - Understand key findings and themes in the report
    - Compare different articles and their findings
    - Identify trends and patterns across the research
    - Explain specific articles in more detail
    - Discuss business implications and relevance
    - Answer questions about methodology, authors, or journals
    - Summarize specific categories or topics"""

    return f"""The user is viewing the REPORTS page.

    Current report: {report_name}
    Report ID: {report_id}
    Article count: {article_count}

    You are helping the user explore and understand this research report. You have access
    to the full contents of the report including articles, summaries, and analysis.
    {focus_instructions}

    Be conversational, helpful, and specific. Reference article titles when discussing
    specific papers. When discussing multiple articles, help the user understand how
    they relate to each other."""


# Define available client actions for reports page
REPORTS_CLIENT_ACTIONS = [
    ClientAction(
        action="close_chat",
        description="Close the chat panel"
    ),
]


# Register page configuration on module import
register_page("reports", [], build_context, REPORTS_CLIENT_ACTIONS)
