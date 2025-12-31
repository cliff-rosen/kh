"""
Chat Page Config Registry

Defines page-specific configurations for the chat system. Each page registers:
- Context builder: Function that builds page-specific instructions for the LLM
- Tabs: Tab-specific tools and payloads
- Page-wide tools/payloads: Available on all tabs of the page
- Client actions: Available client-side actions

Tools and payloads are defined in their respective registries:
- tools/registry.py - Tool definitions
- schemas/payloads.py - Payload definitions

Pages reference tools and payloads BY NAME. Resolution logic:
- Tools for page+tab = global tools + page tools + tab tools
- Payloads for page+tab = global payloads + page payloads + tab payloads
"""

from typing import Dict, List, Any, Callable, Optional
from dataclasses import dataclass, field


@dataclass
class TabConfig:
    """Configuration for a specific tab within a page."""
    payloads: List[str] = field(default_factory=list)  # Payload names for this tab
    tools: List[str] = field(default_factory=list)      # Tool names for this tab


@dataclass
class ClientAction:
    """Definition of a client-side action that the LLM can suggest."""
    action: str                             # Action identifier (e.g., "close_chat")
    description: str                        # What this action does
    parameters: Optional[List[str]] = None  # Expected parameters


@dataclass
class PageConfig:
    """Configuration for a page including tabs, payloads, tools, and context."""
    context_builder: Callable[[Dict[str, Any]], str]
    tabs: Dict[str, TabConfig] = field(default_factory=dict)  # Tab-specific config
    payloads: List[str] = field(default_factory=list)         # Page-wide payloads
    tools: List[str] = field(default_factory=list)            # Page-wide tools
    client_actions: List[ClientAction] = field(default_factory=list)


# =============================================================================
# Registry
# =============================================================================

_page_registry: Dict[str, PageConfig] = {}


def register_page(
    page: str,
    context_builder: Callable[[Dict[str, Any]], str],
    tabs: Optional[Dict[str, TabConfig]] = None,
    payloads: Optional[List[str]] = None,
    tools: Optional[List[str]] = None,
    client_actions: Optional[List[ClientAction]] = None
) -> None:
    """Register a page configuration."""
    _page_registry[page] = PageConfig(
        context_builder=context_builder,
        tabs=tabs or {},
        payloads=payloads or [],
        tools=tools or [],
        client_actions=client_actions or []
    )


def get_page_config(page: str) -> Optional[PageConfig]:
    """Get the full configuration for a page."""
    return _page_registry.get(page)


def has_page(page: str) -> bool:
    """Check if a page is registered."""
    return page in _page_registry


# =============================================================================
# Resolution Functions
# =============================================================================

def get_tool_names_for_page_tab(page: str, tab: Optional[str] = None) -> List[str]:
    """
    Get tool names for a page and optional tab.
    Returns: page-wide tools + tab-specific tools (if tab provided)
    Note: Caller should combine with global tools.
    """
    config = _page_registry.get(page)
    if not config:
        return []

    tools = list(config.tools)  # Page-wide tools

    if tab and tab in config.tabs:
        tools.extend(config.tabs[tab].tools)

    return tools


def get_payload_names_for_page_tab(page: str, tab: Optional[str] = None) -> List[str]:
    """
    Get payload names for a page and optional tab.
    Returns: page-wide payloads + tab-specific payloads (if tab provided)
    Note: Caller should combine with global payloads.
    """
    config = _page_registry.get(page)
    if not config:
        return []

    payloads = list(config.payloads)  # Page-wide payloads

    if tab and tab in config.tabs:
        payloads.extend(config.tabs[tab].payloads)

    return payloads


def get_context_builder(page: str) -> Optional[Callable[[Dict[str, Any]], str]]:
    """Get the context builder function for a page."""
    config = _page_registry.get(page)
    return config.context_builder if config else None


def get_client_actions(page: str) -> List[ClientAction]:
    """Get all client actions for a page."""
    config = _page_registry.get(page)
    return config.client_actions if config else []
