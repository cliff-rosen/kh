"""
Payload Schema Registry

Central definitions for all payload types used in the chat system.
This is the SINGLE SOURCE OF TRUTH for payload definitions.

Tools reference payloads by name (payload_type field).
Pages declare which payloads they use (in their TabConfig/page config).

Payloads can be:
- Global (is_global=True): Automatically available on all pages
- Non-global (is_global=False): Must be explicitly added to a page

For LLM payloads (source="llm"), this also defines:
- parse_marker: Text marker to look for in LLM output
- parser: Function to extract JSON from LLM output
- llm_instructions: Instructions for the LLM on when/how to use this payload
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger(__name__)


# =============================================================================
# Parser Factory
# =============================================================================

def make_json_parser(payload_type: str) -> Callable[[str], Optional[Dict[str, Any]]]:
    """Create a standard JSON parser for a payload type."""
    def parser(text: str) -> Optional[Dict[str, Any]]:
        try:
            data = json.loads(text.strip())
            return {"type": payload_type, "data": data}
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse {payload_type} JSON: {e}")
            return None
    return parser


# =============================================================================
# PayloadType Definition
# =============================================================================

@dataclass
class PayloadType:
    """Complete definition of a payload type."""
    name: str                               # e.g., "pubmed_search_results"
    description: str                        # Human-readable description
    schema: Dict[str, Any]                  # JSON schema for the data field
    source: str = "tool"                    # "tool" or "llm"
    is_global: bool = False                 # If True, available on all pages

    # For LLM payloads (source="llm"):
    parse_marker: Optional[str] = None      # e.g., "SCHEMA_PROPOSAL:"
    parser: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None
    llm_instructions: Optional[str] = None  # Instructions for LLM


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


def get_global_payload_types() -> List[PayloadType]:
    """Get all global payload types."""
    return [p for p in _payload_types.values() if p.is_global]


def get_payload_types_by_source(source: str) -> List[PayloadType]:
    """Get payload types by source ('tool' or 'llm')."""
    return [p for p in _payload_types.values() if p.source == source]


def get_payload_types_by_names(names: List[str]) -> List[PayloadType]:
    """Get payload types by a list of names."""
    return [_payload_types[name] for name in names if name in _payload_types]


# =============================================================================
# Tool Payload Types (from tools)
# =============================================================================

register_payload_type(PayloadType(
    name="pubmed_search_results",
    description="Results from a PubMed search query",
    source="tool",
    is_global=True,  # Tool payloads from global tools are global
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
    is_global=True,
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
# LLM Payload Types (for stream editing)
# =============================================================================

register_payload_type(PayloadType(
    name="schema_proposal",
    description="Proposed changes to a research stream schema",
    source="llm",
    is_global=False,
    parse_marker="SCHEMA_PROPOSAL:",
    parser=make_json_parser("schema_proposal"),
    llm_instructions="""
SCHEMA_PROPOSAL - Use when user asks for recommendations/proposals AND you have enough context:

SCHEMA_PROPOSAL: {
  "proposed_changes": {
    "stream_name": "value",
    "purpose": "value",
    "semantic_space.domain.name": "value",
    "semantic_space.domain.description": "value",
    "semantic_space.context.business_context": "value",
    "semantic_space.topics": [
      {
        "topic_id": "unique_id",
        "name": "Display Name",
        "description": "What this covers",
        "importance": "critical",
        "rationale": "Why this matters"
      }
    ]
  },
  "confidence": "high",
  "reasoning": "Based on our conversation, you mentioned X, Y, and Z, so I'm suggesting..."
}

Guidelines:
- Only propose when user asks for recommendations/proposals
- If you don't have enough information, ask clarifying questions instead
- You can propose some or all fields - only propose what you're confident about
- Use conversation history to inform your proposals
""",
    schema={
        "type": "object",
        "properties": {
            "proposed_changes": {"type": "object"},
            "confidence": {"type": "string"},
            "reasoning": {"type": "string"}
        }
    }
))

register_payload_type(PayloadType(
    name="validation_results",
    description="Validation feedback for a research stream configuration",
    source="llm",
    is_global=False,
    parse_marker="VALIDATION_RESULTS:",
    parser=make_json_parser("validation_results"),
    llm_instructions="""
VALIDATION_RESULTS - Use when analyzing current schema values for issues:

VALIDATION_RESULTS: {
  "errors": [
    {
      "field": "semantic_space.topics",
      "message": "No topics defined - at least 3 topics recommended",
      "severity": "error"
    }
  ],
  "warnings": [
    {
      "field": "purpose",
      "message": "Purpose is quite generic - consider being more specific",
      "severity": "warning"
    }
  ],
  "suggestions": [
    {
      "field": "semantic_space.domain.description",
      "message": "Consider adding information about the therapeutic area",
      "severity": "info"
    }
  ]
}

Use this when:
- User asks "is this good?" or "what's missing?"
- User requests validation or review
- You notice obvious gaps or issues
""",
    schema={
        "type": "object",
        "properties": {
            "errors": {"type": "array"},
            "warnings": {"type": "array"},
            "suggestions": {"type": "array"}
        }
    }
))

register_payload_type(PayloadType(
    name="retrieval_proposal",
    description="Proposed changes to retrieval queries and filters",
    source="llm",
    is_global=False,
    parse_marker="RETRIEVAL_PROPOSAL:",
    parser=make_json_parser("retrieval_proposal"),
    llm_instructions="""
RETRIEVAL_PROPOSAL - Use when user asks for help with search queries or filters.

You can propose changes to QUERIES ONLY, FILTERS ONLY, or BOTH depending on what the user asks for.

RETRIEVAL_PROPOSAL: {
  "update_type": "queries_only" | "filters_only" | "both",
  "target_ids": ["q1", "c1"],

  "queries": [
    {
      "query_id": "q1",
      "name": "Query name",
      "query_string": "PubMed search string",
      "covered_topics": ["topic_1", "topic_2"],
      "rationale": "Why this query works"
    }
  ],

  "filters": [
    {
      "target_id": "q1",
      "semantic_filter": {
        "enabled": true,
        "criteria": "Include articles that specifically discuss X in the context of Y.",
        "threshold": 0.7
      }
    }
  ],

  "changes_summary": "Brief description of what changed",
  "reasoning": "Why these changes will improve results"
}
""",
    schema={
        "type": "object",
        "properties": {
            "update_type": {"type": "string"},
            "queries": {"type": "array"},
            "filters": {"type": "array"},
            "changes_summary": {"type": "string"},
            "reasoning": {"type": "string"}
        }
    }
))

register_payload_type(PayloadType(
    name="query_suggestion",
    description="Suggested PubMed query",
    source="llm",
    is_global=False,
    parse_marker="QUERY_SUGGESTION:",
    parser=make_json_parser("query_suggestion"),
    llm_instructions="""
QUERY_SUGGESTION - Use when user asks for help writing or improving PubMed queries:

QUERY_SUGGESTION: {
  "query_expression": "The complete PubMed search query",
  "explanation": "Plain English explanation of what this query searches for",
  "syntax_notes": ["Explanation of specific syntax elements used"],
  "expected_results": "What types of articles this query should find",
  "alternatives": [
    {
      "query_expression": "Alternative query option",
      "trade_off": "What this alternative gains/loses vs the main suggestion"
    }
  ]
}
""",
    schema={
        "type": "object",
        "properties": {
            "query_expression": {"type": "string"},
            "explanation": {"type": "string"},
            "syntax_notes": {"type": "array"},
            "expected_results": {"type": "string"},
            "alternatives": {"type": "array"}
        }
    }
))

register_payload_type(PayloadType(
    name="filter_suggestion",
    description="Suggested semantic filter criteria",
    source="llm",
    is_global=False,
    parse_marker="FILTER_SUGGESTION:",
    parser=make_json_parser("filter_suggestion"),
    llm_instructions="""
FILTER_SUGGESTION - Use when user asks for help with semantic filter criteria:

FILTER_SUGGESTION: {
  "criteria": "The semantic filter criteria text",
  "threshold": 0.7,
  "explanation": "What this filter looks for and why",
  "examples": {
    "would_pass": ["Example of an article that should pass this filter"],
    "would_fail": ["Example of an article that should NOT pass this filter"]
  },
  "threshold_guidance": "Explanation of the threshold choice"
}
""",
    schema={
        "type": "object",
        "properties": {
            "criteria": {"type": "string"},
            "threshold": {"type": "number"},
            "explanation": {"type": "string"},
            "examples": {"type": "object"},
            "threshold_guidance": {"type": "string"}
        }
    }
))

register_payload_type(PayloadType(
    name="stream_suggestions",
    description="Suggested new research streams",
    source="llm",
    is_global=False,
    parse_marker="STREAM_SUGGESTIONS:",
    parser=make_json_parser("stream_suggestions"),
    llm_instructions="""
STREAM_SUGGESTIONS - Suggest new research streams based on user's needs:

STREAM_SUGGESTIONS: {
  "suggestions": [
    {
      "suggested_name": "Clinical Trials in Oncology",
      "rationale": "Based on your existing cardiovascular stream, expanding to oncology would provide competitive intelligence on parallel therapeutic approaches",
      "domain": "Cancer Research",
      "key_topics": ["Immunotherapy", "CAR-T", "Checkpoint Inhibitors"],
      "business_value": "Track emerging competitive threats in adjacent therapeutic areas",
      "confidence": "high"
    }
  ],
  "reasoning": "Analysis based on your current portfolio and typical research patterns"
}

Use this when:
- User asks "what streams should I create?"
- User wants to expand their monitoring coverage
- User describes a need or gap in their current streams
""",
    schema={
        "type": "object",
        "properties": {
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "suggested_name": {"type": "string"},
                        "rationale": {"type": "string"},
                        "domain": {"type": "string"},
                        "key_topics": {"type": "array", "items": {"type": "string"}},
                        "business_value": {"type": "string"},
                        "confidence": {"type": "string"}
                    }
                }
            },
            "reasoning": {"type": "string"}
        }
    }
))


register_payload_type(PayloadType(
    name="portfolio_insights",
    description="Analysis of user's current stream portfolio",
    source="llm",
    is_global=False,
    parse_marker="PORTFOLIO_INSIGHTS:",
    parser=make_json_parser("portfolio_insights"),
    llm_instructions="""
PORTFOLIO_INSIGHTS - Analyze the user's current stream portfolio:

PORTFOLIO_INSIGHTS: {
  "summary": {
    "total_streams": 5,
    "active_streams": 4,
    "coverage_areas": ["Cardiovascular", "Neurology", "Oncology"]
  },
  "insights": [
    {
      "type": "gap",
      "title": "No coverage of regulatory developments",
      "description": "Your streams focus on clinical research but don't monitor FDA approvals or regulatory changes",
      "severity": "medium",
      "recommendation": "Consider adding a regulatory intelligence stream"
    },
    {
      "type": "overlap",
      "title": "Overlapping topics in streams 2 and 4",
      "description": "Both 'Cardiovascular Drugs' and 'Heart Failure Therapeutics' monitor beta blockers",
      "severity": "low",
      "recommendation": "Consider consolidating or clarifying boundaries"
    }
  ]
}

Use this when:
- User asks to analyze their streams
- User wants to optimize their portfolio
- User asks "what's missing?" or "any problems?"
""",
    schema={
        "type": "object",
        "properties": {
            "summary": {
                "type": "object",
                "properties": {
                    "total_streams": {"type": "integer"},
                    "active_streams": {"type": "integer"},
                    "coverage_areas": {"type": "array", "items": {"type": "string"}}
                }
            },
            "insights": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "severity": {"type": "string"},
                        "recommendation": {"type": "string"}
                    }
                }
            }
        }
    }
))


register_payload_type(PayloadType(
    name="quick_setup",
    description="Pre-configured stream setup for quick creation",
    source="llm",
    is_global=False,
    parse_marker="QUICK_SETUP:",
    parser=make_json_parser("quick_setup"),
    llm_instructions="""
QUICK_SETUP - Provide a pre-configured stream setup for quick creation:

QUICK_SETUP: {
  "stream_name": "Alzheimer's Disease Research",
  "purpose": "Monitor emerging treatments and biomarker research for competitive intelligence",
  "domain": {
    "name": "Neurodegenerative Disease - Alzheimer's",
    "description": "Research focused on Alzheimer's disease pathology, diagnostics, and therapeutics"
  },
  "suggested_topics": [
    {
      "topic_id": "amyloid_targeting",
      "name": "Amyloid-Beta Targeting Therapies",
      "description": "Drugs and treatments targeting amyloid plaques",
      "importance": "critical"
    },
    {
      "topic_id": "biomarkers",
      "name": "Early Detection Biomarkers",
      "description": "Blood-based and imaging biomarkers for early diagnosis",
      "importance": "important"
    }
  ],
  "reasoning": "Based on your request to track Alzheimer's research, this configuration covers key therapeutic and diagnostic areas"
}

Use this when:
- User says "create a stream for X" where X is a specific topic
- User wants help setting up a new stream quickly
- User describes what they want to monitor and asks for a starting point
""",
    schema={
        "type": "object",
        "properties": {
            "stream_name": {"type": "string"},
            "purpose": {"type": "string"},
            "domain": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"}
                }
            },
            "suggested_topics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "topic_id": {"type": "string"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "importance": {"type": "string"}
                    }
                }
            },
            "reasoning": {"type": "string"}
        }
    }
))


register_payload_type(PayloadType(
    name="stream_template",
    description="Complete research stream configuration template",
    source="llm",
    is_global=False,
    parse_marker="STREAM_TEMPLATE:",
    parser=make_json_parser("stream_template"),
    llm_instructions="""
STREAM_TEMPLATE - Suggest a complete research stream configuration:

STREAM_TEMPLATE: {
  "stream_name": "string",
  "domain": {
    "name": "string",
    "description": "string"
  },
  "topics": [
    {
      "name": "string",
      "description": "string",
      "importance": "high" | "medium" | "low",
      "rationale": "string (why this topic is important)"
    }
  ],
  "entities": [
    {
      "name": "string",
      "type": "disease" | "substance" | "chemical" | "organization" | "regulation" | "standard" | "methodology" | "biomarker" | "geographic" | "population" | "drug" | "gene" | "protein" | "pathway" | "therapy" | "device",
      "description": "string",
      "importance": "high" | "medium" | "low"
    }
  ],
  "business_context": "string",
  "confidence": "high" | "medium" | "low",
  "reasoning": "string"
}

Use this when:
- User asks "help me create a stream for X"
- User describes what they want to monitor
- User asks "what would a good stream look like for X"
- User wants a complete setup suggestion
""",
    schema={
        "type": "object",
        "properties": {
            "stream_name": {"type": "string"},
            "domain": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"}
                }
            },
            "topics": {"type": "array"},
            "entities": {"type": "array"},
            "business_context": {"type": "string"},
            "confidence": {"type": "string"},
            "reasoning": {"type": "string"}
        }
    }
))


register_payload_type(PayloadType(
    name="topic_suggestions",
    description="Suggested topics for a research stream",
    source="llm",
    is_global=False,
    parse_marker="TOPIC_SUGGESTIONS:",
    parser=make_json_parser("topic_suggestions"),
    llm_instructions="""
TOPIC_SUGGESTIONS - Suggest topics for the research stream:

TOPIC_SUGGESTIONS: {
  "suggestions": [
    {
      "name": "string",
      "description": "string",
      "importance": "high" | "medium" | "low",
      "rationale": "string"
    }
  ],
  "based_on": "string describing what the suggestions are based on"
}

Use this when:
- User asks "what topics should I include"
- User mentions a domain and needs topic ideas
- User asks "what else should I cover"
- User describes business context and needs relevant topics
""",
    schema={
        "type": "object",
        "properties": {
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "importance": {"type": "string"},
                        "rationale": {"type": "string"}
                    }
                }
            },
            "based_on": {"type": "string"}
        }
    }
))


register_payload_type(PayloadType(
    name="validation_feedback",
    description="Validation and improvement suggestions for stream configuration",
    source="llm",
    is_global=False,
    parse_marker="VALIDATION_FEEDBACK:",
    parser=make_json_parser("validation_feedback"),
    llm_instructions="""
VALIDATION_FEEDBACK - Provide validation and improvement suggestions:

VALIDATION_FEEDBACK: {
  "issues": [
    {
      "field": "string (field path like 'stream_name' or 'domain.description')",
      "severity": "error" | "warning" | "suggestion",
      "message": "string describing the issue",
      "suggestion": "string with improvement recommendation"
    }
  ],
  "strengths": [
    "string describing what's good about the current setup"
  ],
  "overall_assessment": "string with overall quality assessment"
}

Use this when:
- User asks "does this look good"
- User asks "what am I missing"
- User wants feedback on their configuration
- User asks "how can I improve this"
- User wants validation before submitting
""",
    schema={
        "type": "object",
        "properties": {
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "severity": {"type": "string"},
                        "message": {"type": "string"},
                        "suggestion": {"type": "string"}
                    }
                }
            },
            "strengths": {"type": "array", "items": {"type": "string"}},
            "overall_assessment": {"type": "string"}
        }
    }
))
