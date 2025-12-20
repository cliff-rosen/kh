"""
Global Tool Registry

Provides tool configuration and registration for the chat system.
Tools are globally available regardless of which page the chat is on.

Supports streaming tools that yield ToolProgress updates before returning ToolResult.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Generator, List, Optional, Union
from sqlalchemy.orm import Session


@dataclass
class ToolProgress:
    """Progress update from a streaming tool."""
    stage: str                          # Current stage name (e.g., "searching", "processing")
    message: str                        # Human-readable status message
    progress: float = 0.0               # 0.0 to 1.0 progress indicator
    data: Optional[Dict[str, Any]] = None  # Optional structured data for UI


@dataclass
class ToolResult:
    """Result from a tool execution."""
    text: str                           # Text result for LLM
    payload: Optional[Dict[str, Any]] = None  # Structured data for frontend (type, data)


@dataclass
class ToolConfig:
    """Configuration for a tool the agent can use."""
    name: str                           # Tool name (e.g., "search_pubmed")
    description: str                    # Description for LLM
    input_schema: Dict[str, Any]        # JSON schema for parameters
    executor: Callable[
        [Dict[str, Any], Session, int, Dict[str, Any]],
        Union[str, ToolResult, Generator[ToolProgress, None, ToolResult]]
    ]  # (params, db, user_id, context) -> str | ToolResult | Generator[ToolProgress, None, ToolResult]
    streaming: bool = False             # If True, executor yields ToolProgress before returning ToolResult
    category: str = "general"           # Tool category for organization


# =============================================================================
# Global Registry
# =============================================================================

_tool_registry: Dict[str, ToolConfig] = {}


def register_tool(tool: ToolConfig) -> None:
    """Register a tool in the global registry."""
    _tool_registry[tool.name] = tool


def get_tool(name: str) -> Optional[ToolConfig]:
    """Get a tool by name."""
    return _tool_registry.get(name)


def get_all_tools() -> List[ToolConfig]:
    """Get all registered tools."""
    return list(_tool_registry.values())


def get_tools_by_category(category: str) -> List[ToolConfig]:
    """Get all tools in a specific category."""
    return [t for t in _tool_registry.values() if t.category == category]


def get_tools_for_anthropic() -> List[Dict[str, Any]]:
    """Get all tools in Anthropic API format."""
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.input_schema
        }
        for tool in _tool_registry.values()
    ]


def get_tools_dict() -> Dict[str, ToolConfig]:
    """Get all tools as a dict mapping name to config."""
    return dict(_tool_registry)
