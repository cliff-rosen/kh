"""
Help Tool

Provides access to app documentation for the chat system.
Retrieves help content filtered by user role.
"""

import logging
from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, register_tool
from services.help_registry import get_help_section

logger = logging.getLogger(__name__)


async def execute_get_help_section(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> str:
    """
    Retrieve detailed help documentation for a specific topic.

    Uses the section_id from the help table of contents in the system prompt.
    """
    section_id = params.get("section_id", "").strip()

    if not section_id:
        return "Error: No section_id provided. Check the HELP TABLE OF CONTENTS for available sections."

    # Get user role from context (default to member for safety)
    user_role = context.get("user_role", "member")

    section = get_help_section(section_id, user_role)

    if not section:
        return f"Error: Help section '{section_id}' not found or not accessible. Check the HELP TABLE OF CONTENTS for available sections."

    return f"""# {section.title}

{section.content}"""


# =============================================================================
# Register Tool
# =============================================================================

register_tool(ToolConfig(
    name="get_help_section",
    description="Retrieve detailed help documentation about how to use the app. Use this when users ask how to do something or need guidance on app features. Check the HELP TABLE OF CONTENTS in the system prompt for available section IDs.",
    input_schema={
        "type": "object",
        "properties": {
            "section_id": {
                "type": "string",
                "description": "The section ID from the HELP TABLE OF CONTENTS (e.g., 'reports/viewing', 'getting-started')."
            }
        },
        "required": ["section_id"]
    },
    executor=execute_get_help_section,
    category="help",
    is_global=True  # Available on all pages
))
