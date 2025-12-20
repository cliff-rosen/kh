"""
Chat Payloads Package

This package contains page-specific payload configurations and context builders.
Each module defines payloads and context for a specific page in the application.

MIGRATION NOTE:
- Tools have been migrated to the global tools registry (backend/tools/)
- ToolConfig and get_page_tools are deprecated - use tools.registry instead
- PayloadConfig, context builders, and client actions are still in use

Import this package to automatically register all page configurations.
"""

from .registry import (
    PayloadConfig,
    PageConfig,
    ClientAction,
    get_page_payloads,
    get_page_context_builder,
    get_page_client_actions,
    has_page_payloads,
    register_page,
    # Deprecated - use tools.registry instead
    ToolConfig,
    ToolResult,
    get_page_tools,
)

# Import all page configurations to register them
from . import edit_stream
from . import streams_list
from . import new_stream
from . import reports

__all__ = [
    'PayloadConfig',
    'PageConfig',
    'ClientAction',
    'get_page_payloads',
    'get_page_context_builder',
    'get_page_client_actions',
    'has_page_payloads',
    'register_page',
    # Deprecated exports (for backward compatibility)
    'ToolConfig',
    'ToolResult',
    'get_page_tools',
]
