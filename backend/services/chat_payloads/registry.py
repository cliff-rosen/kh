"""
Payload Configuration Registry
Defines available payload types and their LLM instructions for each page.
"""

from typing import Dict, List, Any, Callable, Optional
from dataclasses import dataclass


@dataclass
class PayloadConfig:
    """Configuration for a specific payload type."""
    type: str  # Identifier like "schema_proposal", "validation_results"
    parse_marker: str  # What to look for in LLM response, e.g., "SCHEMA_PROPOSAL:"
    llm_instructions: str  # Instructions for LLM on when/how to use this payload
    parser: Callable[[str], Dict[str, Any]]  # Function to parse this payload type
    relevant_tabs: Optional[List[str]] = None  # Which tabs this payload is relevant for (None = all tabs)


@dataclass
class PageConfig:
    """Configuration for a page including payloads and context builder."""
    payloads: List[PayloadConfig]
    context_builder: Callable[[Dict[str, Any]], str]  # Function to build context section


class PayloadRegistry:
    """Central registry mapping pages to their payload and context configurations."""

    def __init__(self):
        self._registry: Dict[str, PageConfig] = {}

    def register_page(self, page: str, payloads: List[PayloadConfig], context_builder: Callable[[Dict[str, Any]], str]):
        """Register page configuration including payloads and context builder."""
        self._registry[page] = PageConfig(
            payloads=payloads,
            context_builder=context_builder
        )

    def get_payloads(self, page: str) -> List[PayloadConfig]:
        """Get all payload configurations for a page."""
        page_config = self._registry.get(page)
        return page_config.payloads if page_config else []

    def get_context_builder(self, page: str) -> Optional[Callable[[Dict[str, Any]], str]]:
        """Get the context builder function for a page."""
        page_config = self._registry.get(page)
        return page_config.context_builder if page_config else None

    def has_page(self, page: str) -> bool:
        """Check if a page is registered."""
        return page in self._registry


# Global registry instance
_payload_registry = PayloadRegistry()


def register_page(page: str, payloads: List[PayloadConfig], context_builder: Callable[[Dict[str, Any]], str]):
    """Register page configuration including payloads and context builder."""
    _payload_registry.register_page(page, payloads, context_builder)


def get_page_payloads(page: str) -> List[PayloadConfig]:
    """Get all payload configurations for a page."""
    return _payload_registry.get_payloads(page)


def get_page_context_builder(page: str) -> Optional[Callable[[Dict[str, Any]], str]]:
    """Get the context builder function for a page."""
    return _payload_registry.get_context_builder(page)


def has_page_payloads(page: str) -> bool:
    """Check if a page is registered."""
    return _payload_registry.has_page(page)
