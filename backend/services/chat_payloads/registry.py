"""
Page Payload Registry

Defines LLM payload configurations for each page. This enables the LLM to output
structured payloads that get parsed and sent to the frontend for rich rendering.

Components:
- PayloadConfig: Defines a payload type with parse marker, instructions, and parser
- ClientAction: Defines available client-side actions for a page
- Context builder: Function that builds page-specific context for the LLM prompt

Note: Tools are registered separately via backend/tools/registry.py
Payloads can come from either LLM output (parsed here) or tools (via ToolResult).
"""

from typing import Dict, List, Any, Callable, Optional
from dataclasses import dataclass


@dataclass
class PayloadConfig:
    """
    Configuration for a payload type that the LLM can output.

    The LLM is instructed (via llm_instructions) to output a marker followed by JSON.
    The backend looks for parse_marker in the response and uses parser to extract it.
    """
    type: str  # Identifier like "schema_proposal", "validation_results"
    parse_marker: str  # What to look for in LLM response, e.g., "SCHEMA_PROPOSAL:"
    llm_instructions: str  # Instructions for LLM on when/how to use this payload
    parser: Callable[[str], Dict[str, Any]]  # Function to parse JSON into {type, data}
    relevant_tabs: Optional[List[str]] = None  # Which tabs this payload is relevant for (None = all)


@dataclass
class ClientAction:
    """Definition of a client-side action that the LLM can suggest."""
    action: str  # Action identifier (e.g., "close_chat", "navigate_to_tab")
    description: str  # What this action does
    parameters: Optional[List[str]] = None  # Expected parameters (e.g., ["tab_name"])


@dataclass
class PageConfig:
    """Configuration for a page including payloads, context builder, and client actions."""
    payloads: List[PayloadConfig]
    context_builder: Callable[[Dict[str, Any]], str]
    client_actions: Optional[List[ClientAction]] = None


class PayloadRegistry:
    """Central registry mapping pages to their payload and context configurations."""

    def __init__(self):
        self._registry: Dict[str, PageConfig] = {}

    def register_page(
        self,
        page: str,
        payloads: List[PayloadConfig],
        context_builder: Callable[[Dict[str, Any]], str],
        client_actions: Optional[List[ClientAction]] = None
    ):
        """Register page configuration."""
        self._registry[page] = PageConfig(
            payloads=payloads,
            context_builder=context_builder,
            client_actions=client_actions or []
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

    def has_page(self, page: str) -> bool:
        """Check if a page is registered."""
        return page in self._registry


# Global registry instance
_payload_registry = PayloadRegistry()


def register_page(
    page: str,
    payloads: List[PayloadConfig],
    context_builder: Callable[[Dict[str, Any]], str],
    client_actions: Optional[List[ClientAction]] = None
):
    """Register page configuration including payloads, context builder, and client actions."""
    _payload_registry.register_page(page, payloads, context_builder, client_actions)


def get_page_payloads(page: str) -> List[PayloadConfig]:
    """Get all payload configurations for a page."""
    return _payload_registry.get_payloads(page)


def get_page_context_builder(page: str) -> Optional[Callable[[Dict[str, Any]], str]]:
    """Get the context builder function for a page."""
    return _payload_registry.get_context_builder(page)


def get_page_client_actions(page: str) -> List[ClientAction]:
    """Get all client actions for a page."""
    return _payload_registry.get_client_actions(page)


def has_page_payloads(page: str) -> bool:
    """Check if a page is registered."""
    return _payload_registry.has_page(page)
