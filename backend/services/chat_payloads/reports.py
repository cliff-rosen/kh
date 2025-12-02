"""
Payload configurations for the reports page.
Defines context builder for report chat functionality.
"""

from typing import Dict, Any
from .registry import ClientAction, register_page

# Reports page doesn't need custom payloads - it's purely conversational
# about the report contents. The heavy lifting is in the context builder.

def build_context(context: Dict[str, Any]) -> str:
    """
    Build context section for reports page.

    Note: The actual report data (articles, summaries, etc.) is loaded from
    the database by the GeneralChatService when it detects report_id in context.
    This context builder provides the base instructions; the service enriches it.
    """
    report_id = context.get("report_id")
    report_name = context.get("report_name", "Unknown Report")
    article_count = context.get("article_count", 0)

    # Base context - the service will enrich this with actual report data
    return f"""The user is viewing the REPORTS page.

    Current report: {report_name}
    Report ID: {report_id}
    Article count: {article_count}

    You are helping the user explore and understand this research report. You have access
    to the full contents of the report including articles, summaries, and analysis.

    You can help the user:
    - Understand key findings and themes in the report
    - Compare different articles and their findings
    - Identify trends and patterns across the research
    - Explain specific articles in more detail
    - Discuss business implications and relevance
    - Answer questions about methodology, authors, or journals
    - Summarize specific categories or topics

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
# Empty payloads list - reports chat is conversational, not structured
register_page("reports", [], build_context, REPORTS_CLIENT_ACTIONS)
