# New package for tool handlers and registry

from schemas.tool_handler_schema import (
    ToolHandlerInput,
    ToolHandlerResult,
    ToolExecutionHandler,
)

# First load the tool registry
from .tool_registry import refresh_tool_registry
refresh_tool_registry()

# Then import individual tool handler modules so their registration side-effects run
# (e.g. they call register_tool_handler when imported).
from .handlers import (  # noqa: F401
    email_handlers,
    extract_handlers,
    map_reduce_handlers,
    summarize_handlers,
    web_search_handlers,
    web_retrieval_handlers,
)

__all__ = [
    "ToolHandlerInput",
    "ToolHandlerResult",
    "ToolExecutionHandler",
] 