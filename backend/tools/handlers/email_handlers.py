"""Email-related tool handlers.

This module contains concrete implementations for tools that interact with
email data (currently Gmail search).
"""

from __future__ import annotations

from typing import Dict, Any, List
from schemas.base import SchemaType, ValueType

from database import get_db
from services.email_service import EmailService
from schemas.tool_handler_schema import ToolHandlerInput, ToolHandlerResult, ToolExecutionHandler
from tools.tool_registry import register_tool_handler

# Singleton service instance – reuse HTTP connections etc.
email_service = EmailService()

async def handle_email_search(input: ToolHandlerInput) -> Dict[str, Any]:
    """Execution logic for the *email_search* tool.

    Expects the following parameters (as defined in the tool schema):
        • query : str - Gmail search query (e.g., 'from:user@example.com', 'subject:meeting', 'after:2024/01/01')
        • label_ids : List[str] | None - label IDs to search inside (optional)
        • max_results : int - maximum number of messages (1-500, defaults to 100)
        • include_spam_trash : bool - whether to include messages from SPAM and TRASH
        • page_token : str | None - token for retrieving the next page of results

    Returns a mapping with keys exactly matching the tool's declared outputs:
        • emails - List[dict] - List of matching emails
        • count - int - Total number of matching emails
        • next_page_token - str | None - Token for retrieving the next page
    """
    print("handle_email_search executing")

    try:
        print("Authenticating user")        
        db = next(get_db())
        await email_service.authenticate(1, db)
    except Exception as e:
        print(f"Error authenticating user: {e}")
        raise Exception(f"Error authenticating user: {e}")

    try:
        params = input.params

        # Get the query string and validate it doesn't contain label: prefix
        query = params.get("query", "")
        if "label:" in query:
            raise ValueError("Labels should be specified using the label_ids parameter, not in the query string")

        # Transform inputs for EmailService API
        endpoint_params: Dict[str, Any] = {
            "db": db,
            "query": query,
            "label_ids": params.get("label_ids"),  # Use consistent parameter name
            "max_results": min(int(params.get("max_results", 100)), 500),
            "include_spam_trash": bool(params.get("include_spam_trash", False)),
            "page_token": params.get("page_token")
        }

        print("Authenticated user. Awaiting response")
        print(f"Search params: query='{query}', label_ids={endpoint_params['label_ids']}")
        response = await email_service.get_messages_and_store(**endpoint_params)
        print("Response received")
        
        # Return just the outputs mapping
        return {
            "emails": response.get("messages", []),
            "count": response.get("count", 0)
        }
    except Exception as e:
        print(f"Error executing email search: {e}")
        raise Exception(f"Error executing email search: {e}")

# ---------------------------------------------------------------------------
# Register the handler so the framework can invoke it.
# ---------------------------------------------------------------------------

register_tool_handler(
    "email_search",
    ToolExecutionHandler(
        handler=handle_email_search,
        description="Executes Gmail search and returns basic message metadata with stubbing support",
    ),
) 