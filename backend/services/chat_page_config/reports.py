"""
Chat page config for the reports page.

Defines context builder and client actions for report chat functionality.
Payload definitions (including parsers and LLM instructions) are in schemas/payloads.py.

ARCHITECTURE NOTE:
    This module provides PAGE-LEVEL INSTRUCTIONS only. It defines:
    - How the LLM should behave on this page
    - What capabilities are available
    - Client actions that can be triggered

    Actual DATA (report contents, articles, summaries) is loaded from the database
    by ChatStreamService._load_report_context(). Do NOT add data formatting here.

    The separation is:
    - chat_page_config/*.py → Instructions, behavior, payload types
    - ChatStreamService → Data loading, context enrichment from DB/frontend

Note: PubMed tools are registered globally via backend/tools/builtin/pubmed.py
"""

from typing import Dict, Any
from .registry import ClientAction, register_page


# =============================================================================
# Context Builder
# =============================================================================

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
    stream_id = context.get("stream_id")
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
- Relate this article to the broader research topic
- View and discuss notes on this article"""
    else:
        focus_instructions = """
You can help the user:
- Understand key findings and themes in the report
- Compare different articles and their findings
- Identify trends and patterns across the research
- Explain specific articles in more detail
- Discuss business implications and relevance
- Answer questions about methodology, authors, or journals
- Summarize specific categories or topics
- Search for articles across report history
- Compare reports to see what's changed"""

    tools_instructions = """

=== AVAILABLE TOOLS ===
You have access to powerful tools for exploring reports and articles:

1. list_stream_reports - List all reports for this research stream. Use this when the user
   asks about report history, previous reports, or wants to navigate between reports.

2. get_report_summary - Get full summary, highlights, and thematic analysis for a report.
   Use this for comprehensive overviews.

3. search_articles_in_reports - Search for articles by keyword across ALL reports in the stream.
   Use this when users ask "have we seen articles about X?" or want to find specific topics.

4. get_article_details - Get full article details including abstract, relevance info, and notes.
   Use this for deep dives into specific articles.

5. get_notes_for_article - Get all notes (personal and shared) for an article.
   Use this when users ask about notes or annotations.

6. compare_reports - Compare two reports to see new/removed articles.
   Use this when users ask "what's new?" or "what changed since last report?"

7. get_starred_articles - Get all starred/important articles across reports.
   Use this when users want to see highlighted or important findings.

Use these tools proactively when they would help answer the user's question.
For example, if asked "what did we find about CRISPR in previous reports?",
use search_articles_in_reports to find relevant articles.
"""

    return f"""The user is viewing the REPORTS page.

Current report: {report_name}
Report ID: {report_id}
Stream ID: {stream_id}
Article count: {article_count}

You are helping the user explore and understand research reports. You have access
to the full contents of the current report including articles, summaries, and analysis,
PLUS tools to explore the entire report history for this stream.
{focus_instructions}
{tools_instructions}

Be conversational, helpful, and specific. Reference article titles when discussing
specific papers. When discussing multiple articles, help the user understand how
they relate to each other. Use your tools to provide comprehensive answers that
draw on the full report history when appropriate."""


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
