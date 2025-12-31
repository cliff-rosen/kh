"""
Payload Schema Registry

Central definitions for all payload types used in the chat system.
Both tools and LLM payloads reference types defined here.

This provides:
- Single source of truth for payload type names
- JSON schemas for payload data validation
- TypeScript type generation (future)
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional


@dataclass
class PayloadType:
    """Definition of a payload type with its schema."""
    name: str                               # e.g., "pubmed_search_results"
    description: str                        # Human-readable description
    schema: Dict[str, Any]                  # JSON schema for the data field
    source: str = "tool"                    # "tool" or "llm" - primary source


# =============================================================================
# Payload Type Registry
# =============================================================================

_payload_types: Dict[str, PayloadType] = {}


def register_payload_type(payload_type: PayloadType) -> None:
    """Register a payload type."""
    _payload_types[payload_type.name] = payload_type


def get_payload_type(name: str) -> Optional[PayloadType]:
    """Get a payload type by name."""
    return _payload_types.get(name)


def get_all_payload_types() -> List[PayloadType]:
    """Get all registered payload types."""
    return list(_payload_types.values())


def get_payload_schema(name: str) -> Optional[Dict[str, Any]]:
    """Get the JSON schema for a payload type."""
    payload_type = _payload_types.get(name)
    return payload_type.schema if payload_type else None


# =============================================================================
# PubMed Payload Types (from tools)
# =============================================================================

register_payload_type(PayloadType(
    name="pubmed_search_results",
    description="Results from a PubMed search query",
    source="tool",
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query used"},
            "total_results": {"type": "integer", "description": "Total results found"},
            "showing": {"type": "integer", "description": "Number of results returned"},
            "articles": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "pmid": {"type": "string"},
                        "title": {"type": "string"},
                        "authors": {"type": "string"},
                        "journal": {"type": "string"},
                        "year": {"type": "string"},
                        "abstract": {"type": "string"},
                        "has_free_full_text": {"type": "boolean"}
                    },
                    "required": ["pmid", "title"]
                }
            }
        },
        "required": ["query", "articles"]
    }
))

register_payload_type(PayloadType(
    name="pubmed_article",
    description="Details of a single PubMed article",
    source="tool",
    schema={
        "type": "object",
        "properties": {
            "pmid": {"type": "string"},
            "title": {"type": "string"},
            "authors": {"type": "string"},
            "journal": {"type": "string"},
            "year": {"type": "string"},
            "volume": {"type": "string"},
            "issue": {"type": "string"},
            "pages": {"type": "string"},
            "abstract": {"type": "string"},
            "pmc_id": {"type": ["string", "null"]},
            "doi": {"type": ["string", "null"]}
        },
        "required": ["pmid", "title"]
    }
))


# =============================================================================
# Stream Payload Types (from LLM)
# =============================================================================

register_payload_type(PayloadType(
    name="schema_proposal",
    description="Proposed changes to a research stream schema",
    source="llm",
    schema={
        "type": "object",
        "properties": {
            "stream_name": {"type": "string"},
            "purpose": {"type": "string"},
            "topics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "keywords": {"type": "array", "items": {"type": "string"}}
                    }
                }
            },
            "rationale": {"type": "string"}
        }
    }
))

register_payload_type(PayloadType(
    name="validation_results",
    description="Validation feedback for a research stream configuration",
    source="llm",
    schema={
        "type": "object",
        "properties": {
            "is_valid": {"type": "boolean"},
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "severity": {"type": "string", "enum": ["error", "warning", "info"]},
                        "message": {"type": "string"}
                    }
                }
            },
            "suggestions": {"type": "array", "items": {"type": "string"}}
        }
    }
))

register_payload_type(PayloadType(
    name="stream_suggestions",
    description="Suggested new research streams",
    source="llm",
    schema={
        "type": "object",
        "properties": {
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "purpose": {"type": "string"},
                        "rationale": {"type": "string"}
                    }
                }
            }
        }
    }
))
