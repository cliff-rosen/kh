"""
Payload Configuration Registry
Defines available payload types and their LLM instructions for each page.
"""

from typing import Dict, List, Any, Callable
from dataclasses import dataclass


@dataclass
class PayloadConfig:
    """Configuration for a specific payload type."""
    type: str  # Identifier like "schema_proposal", "validation_results"
    parse_marker: str  # What to look for in LLM response, e.g., "SCHEMA_PROPOSAL:"
    llm_instructions: str  # Instructions for LLM on when/how to use this payload
    parser: Callable[[str], Dict[str, Any]]  # Function to parse this payload type


class PayloadRegistry:
    """Central registry mapping pages to their available payload types."""

    def __init__(self):
        self._registry: Dict[str, List[PayloadConfig]] = {}

    def register_page(self, page: str, configs: List[PayloadConfig]):
        """Register payload configurations for a page."""
        self._registry[page] = configs

    def get_configs(self, page: str) -> List[PayloadConfig]:
        """Get all payload configurations for a page."""
        return self._registry.get(page, [])

    def has_payloads(self, page: str) -> bool:
        """Check if a page has registered payload types."""
        return page in self._registry and len(self._registry[page]) > 0


# Global registry instance
_payload_registry = PayloadRegistry()


def register_page_payloads(page: str, configs: List[PayloadConfig]):
    """Register payload configurations for a page."""
    _payload_registry.register_page(page, configs)


def get_page_payloads(page: str) -> List[PayloadConfig]:
    """Get all payload configurations for a page."""
    return _payload_registry.get_configs(page)


def has_page_payloads(page: str) -> bool:
    """Check if a page has registered payload types."""
    return _payload_registry.has_payloads(page)
