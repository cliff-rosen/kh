"""
Payload Configuration Registry
Defines available payload types and their LLM instructions for each page.
"""

from typing import Dict, List, Any, Callable, Optional
from dataclasses import dataclass, field
from sqlalchemy.orm import Session


@dataclass
class PayloadConfig:
    """Configuration for a specific payload type."""
    type: str  # Identifier like "schema_proposal", "validation_results"
    parse_marker: str  # What to look for in LLM response, e.g., "SCHEMA_PROPOSAL:"
    llm_instructions: str  # Instructions for LLM on when/how to use this payload
    parser: Callable[[str], Dict[str, Any]]  # Function to parse this payload type
    relevant_tabs: Optional[List[str]] = None  # Which tabs this payload is relevant for (None = all tabs)


@dataclass
class ClientAction:
    """Definition of a client-side action that can be suggested by the LLM."""
    action: str  # Action identifier (e.g., "close_chat", "navigate_to_tab")
    description: str  # What this action does
    parameters: Optional[List[str]] = None  # Expected parameters (e.g., ["tab_name"])


@dataclass
class ToolConfig:
    """Configuration for a tool that the LLM can call."""
    name: str  # Tool name (e.g., "search_pubmed")
    description: str  # Description for the LLM
    input_schema: Dict[str, Any]  # JSON schema for tool parameters
    executor: Callable[[Dict[str, Any], Session, int, Dict[str, Any]], Any]  # (params, db, user_id, context) -> result


@dataclass
class PageConfig:
    """Configuration for a page including payloads, tools, and context builder."""
    payloads: List[PayloadConfig]
    context_builder: Callable[[Dict[str, Any]], str]  # Function to build context section
    client_actions: Optional[List[ClientAction]] = None  # Available client actions for this page
    tools: Optional[List[ToolConfig]] = None  # Available tools for this page


class PayloadRegistry:
    """Central registry mapping pages to their payload and context configurations."""

    def __init__(self):
        self._registry: Dict[str, PageConfig] = {}

    def register_page(
        self,
        page: str,
        payloads: List[PayloadConfig],
        context_builder: Callable[[Dict[str, Any]], str],
        client_actions: Optional[List[ClientAction]] = None,
        tools: Optional[List[ToolConfig]] = None
    ):
        """Register page configuration including payloads, context builder, client actions, and tools."""
        self._registry[page] = PageConfig(
            payloads=payloads,
            context_builder=context_builder,
            client_actions=client_actions or [],
            tools=tools or []
        )

    def get_payloads(self, page: str) -> List[PayloadConfig]:
        """Get all payload configurations for a page."""
        page_config = self._registry.get(page)
        return page_config.payloads if page_config else []

    def get_context_builder(self, page: str) -> Optional[Callable[[Dict[str, Any]], str]]:
        """Get the context builder function for a page."""
        page_config = self._registry.get(page)
        return page_config.context_builder if page_config else None

    def get_client_actions(self, page: str) -> List[ClientAction]:
        """Get all client actions for a page."""
        page_config = self._registry.get(page)
        return page_config.client_actions if page_config else []

    def get_tools(self, page: str) -> List[ToolConfig]:
        """Get all tools for a page."""
        page_config = self._registry.get(page)
        return page_config.tools if page_config else []

    def has_page(self, page: str) -> bool:
        """Check if a page is registered."""
        return page in self._registry


# Global registry instance
_payload_registry = PayloadRegistry()


def register_page(
    page: str,
    payloads: List[PayloadConfig],
    context_builder: Callable[[Dict[str, Any]], str],
    client_actions: Optional[List[ClientAction]] = None,
    tools: Optional[List[ToolConfig]] = None
):
    """Register page configuration including payloads, context builder, client actions, and tools."""
    _payload_registry.register_page(page, payloads, context_builder, client_actions, tools)


def get_page_payloads(page: str) -> List[PayloadConfig]:
    """Get all payload configurations for a page."""
    return _payload_registry.get_payloads(page)


def get_page_context_builder(page: str) -> Optional[Callable[[Dict[str, Any]], str]]:
    """Get the context builder function for a page."""
    return _payload_registry.get_context_builder(page)


def get_page_client_actions(page: str) -> List[ClientAction]:
    """Get all client actions for a page."""
    return _payload_registry.get_client_actions(page)


def get_page_tools(page: str) -> List[ToolConfig]:
    """Get all tools for a page."""
    return _payload_registry.get_tools(page)


def has_page_payloads(page: str) -> bool:
    """Check if a page is registered."""
    return _payload_registry.has_page(page)
