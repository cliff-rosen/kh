"""
Global Tool System

Provides tool registration and execution for the chat system.
"""

from tools.registry import (
    ToolProgress,
    ToolResult,
    ToolConfig,
    register_tool,
    get_tool,
    get_all_tools,
    get_tools_by_category,
    get_tools_for_anthropic,
    get_tools_dict,
)

# Import builtin tools to auto-register them
from tools import builtin

__all__ = [
    "ToolProgress",
    "ToolResult",
    "ToolConfig",
    "register_tool",
    "get_tool",
    "get_all_tools",
    "get_tools_by_category",
    "get_tools_for_anthropic",
    "get_tools_dict",
]
