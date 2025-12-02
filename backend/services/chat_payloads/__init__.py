"""
Chat Payloads Package

This package contains all page-specific payload configurations and context builders.
Each module defines payloads and context for a specific page in the application.

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
    register_page
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
    'register_page'
]
