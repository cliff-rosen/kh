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

    # For payload manifest (summarize for LLM context):
    summarize: Optional[Callable[[Dict[str, Any]], str]] = None  # Returns brief summary


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


def summarize_payload(payload_type: str, data: Dict[str, Any]) -> str:
    """
    Generate a brief summary of a payload for the LLM context manifest.

    Args:
        payload_type: The type name of the payload
        data: The payload data

    Returns:
        A brief summary string (1-2 sentences max)
    """
    pt = _payload_types.get(payload_type)
    if not pt:
        return f"Unknown payload type: {payload_type}"

    if pt.summarize:
        try:
            return pt.summarize(data)
        except Exception as e:
            logger.warning(f"Failed to summarize payload {payload_type}: {e}")
            return pt.description

    # Default: just return the description
    return pt.description


# =============================================================================
# Summarizer Functions
# =============================================================================

def _summarize_pubmed_search(data: Dict[str, Any]) -> str:
    """Summarize PubMed search results."""
    query = data.get("query", "unknown query")
    total = data.get("total_results", 0)
    showing = data.get("showing", len(data.get("articles", [])))
    return f"PubMed search for '{query}': {showing} of {total} results"


def _summarize_pubmed_article(data: Dict[str, Any]) -> str:
    """Summarize a single PubMed article."""
    pmid = data.get("pmid", "unknown")
    title = data.get("title", "Untitled")
    # Truncate title if too long
    if len(title) > 60:
        title = title[:57] + "..."
    return f"Article PMID:{pmid} - {title}"


def _summarize_schema_proposal(data: Dict[str, Any]) -> str:
    """Summarize a schema proposal."""
    changes = data.get("proposed_changes", {})
    fields = list(changes.keys())[:3]
    confidence = data.get("confidence", "unknown")
    if fields:
        return f"Schema proposal ({confidence} confidence) for: {', '.join(fields)}"
    return f"Schema proposal ({confidence} confidence)"


def _summarize_validation_results(data: Dict[str, Any]) -> str:
    """Summarize validation results."""
    errors = len(data.get("errors", []))
    warnings = len(data.get("warnings", []))
    suggestions = len(data.get("suggestions", []))
    parts = []
    if errors:
        parts.append(f"{errors} errors")
    if warnings:
        parts.append(f"{warnings} warnings")
    if suggestions:
        parts.append(f"{suggestions} suggestions")
    return f"Validation results: {', '.join(parts)}" if parts else "Validation results: no issues"


def _summarize_retrieval_proposal(data: Dict[str, Any]) -> str:
    """Summarize a retrieval proposal."""
    update_type = data.get("update_type", "unknown")
    queries = len(data.get("queries", []))
    filters = len(data.get("filters", []))
    return f"Retrieval proposal ({update_type}): {queries} queries, {filters} filters"


def _summarize_query_suggestion(data: Dict[str, Any]) -> str:
    """Summarize a query suggestion."""
    query = data.get("query_expression", "")
    if len(query) > 50:
        query = query[:47] + "..."
    return f"Query suggestion: {query}"


def _summarize_filter_suggestion(data: Dict[str, Any]) -> str:
    """Summarize a filter suggestion."""
    criteria = data.get("criteria", "")
    threshold = data.get("threshold", 0.7)
    if len(criteria) > 50:
        criteria = criteria[:47] + "..."
    return f"Filter suggestion (threshold {threshold}): {criteria}"


def _summarize_stream_suggestions(data: Dict[str, Any]) -> str:
    """Summarize stream suggestions."""
    suggestions = data.get("suggestions", [])
    names = [s.get("suggested_name", "unnamed") for s in suggestions[:3]]
    return f"Stream suggestions: {', '.join(names)}" if names else "Stream suggestions"


def _summarize_portfolio_insights(data: Dict[str, Any]) -> str:
    """Summarize portfolio insights."""
    summary = data.get("summary", {})
    total = summary.get("total_streams", 0)
    insights = len(data.get("insights", []))
    return f"Portfolio analysis: {total} streams, {insights} insights"


def _summarize_quick_setup(data: Dict[str, Any]) -> str:
    """Summarize a quick setup."""
    name = data.get("stream_name", "Unnamed stream")
    topics = len(data.get("suggested_topics", []))
    return f"Quick setup: '{name}' with {topics} topics"


def _summarize_stream_template(data: Dict[str, Any]) -> str:
    """Summarize a stream template."""
    name = data.get("stream_name", "Unnamed stream")
    topics = len(data.get("topics", []))
    entities = len(data.get("entities", []))
    return f"Stream template: '{name}' with {topics} topics, {entities} entities"


def _summarize_topic_suggestions(data: Dict[str, Any]) -> str:
    """Summarize topic suggestions."""
    suggestions = data.get("suggestions", [])
    names = [s.get("name", "unnamed") for s in suggestions[:3]]
    return f"Topic suggestions: {', '.join(names)}" if names else "Topic suggestions"


def _summarize_validation_feedback(data: Dict[str, Any]) -> str:
    """Summarize validation feedback."""
    issues = len(data.get("issues", []))
    strengths = len(data.get("strengths", []))
    return f"Validation feedback: {issues} issues, {strengths} strengths noted"


def _summarize_web_search(data: Dict[str, Any]) -> str:
    """Summarize web search results."""
    query = data.get("query", "unknown query")
    total = data.get("total_results", 0)
    results = data.get("results", [])
    return f"Web search for '{query}': {len(results)} of {total} results"


def _summarize_webpage_content(data: Dict[str, Any]) -> str:
    """Summarize fetched webpage content."""
    title = data.get("title", "Untitled")
    url = data.get("url", "")
    # Truncate title if too long
    if len(title) > 50:
        title = title[:47] + "..."
    # Extract domain from URL
    try:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc
    except:
        domain = url[:30] if url else "unknown"
    return f"Webpage: {title} ({domain})"


# =============================================================================
# Tool Payload Types (from tools)
# =============================================================================

register_payload_type(PayloadType(
    name="pubmed_search_results",
    description="Results from a PubMed search query",
    source="tool",
    is_global=True,  # Tool payloads from global tools are global
    summarize=_summarize_pubmed_search,
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
    summarize=_summarize_pubmed_article,
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
            "doi": {"type": ["string", "null"]},
            "full_text": {"type": ["string", "null"], "description": "Full text content from PMC (Markdown formatted)"}
        },
        "required": ["pmid", "title"]
    }
))

register_payload_type(PayloadType(
    name="web_search_results",
    description="Results from a web search",
    source="tool",
    is_global=True,
    summarize=_summarize_web_search,
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query used"},
            "total_results": {"type": "integer", "description": "Total results found"},
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "snippet": {"type": "string"},
                        "source": {"type": "string"},
                        "rank": {"type": "integer"}
                    },
                    "required": ["title", "url"]
                }
            }
        },
        "required": ["query", "results"]
    }
))

register_payload_type(PayloadType(
    name="webpage_content",
    description="Content extracted from a webpage",
    source="tool",
    is_global=True,
    summarize=_summarize_webpage_content,
    schema={
        "type": "object",
        "properties": {
            "url": {"type": "string"},
            "title": {"type": "string"},
            "content": {"type": "string"},
            "description": {"type": ["string", "null"]},
            "author": {"type": ["string", "null"]},
            "published_date": {"type": ["string", "null"]},
            "word_count": {"type": ["integer", "null"]},
            "truncated": {"type": "boolean"}
        },
        "required": ["url", "title", "content"]
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
    summarize=_summarize_schema_proposal,
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
    summarize=_summarize_validation_results,
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
    summarize=_summarize_retrieval_proposal,
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
    summarize=_summarize_query_suggestion,
    llm_instructions="""
QUERY_SUGGESTION - Use when user asks for help writing or improving PubMed queries.

When you output this payload, it will appear in a side panel for the user to review.
If they click "Accept", the query will be automatically executed and results will load.
Tell the user: "I've prepared a query for you - you can see it in the panel on the right. Click 'Use This Query' to run the search."

IMPORTANT: Date filtering is done via separate fields, NOT in the query_expression itself.
Do NOT add date ranges like "2020:2024[dp]" to the query - use start_date/end_date instead.

QUERY_SUGGESTION: {
  "query_expression": "The PubMed search query (NO date filters here)",
  "start_date": "YYYY-MM-DD or null (e.g., '2020-01-01')",
  "end_date": "YYYY-MM-DD or null (e.g., '2024-12-31')",
  "date_type": "publication or entry (default: publication)",
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

Example with date filter:
QUERY_SUGGESTION: {
  "query_expression": "CRISPR[MeSH] AND gene therapy[MeSH]",
  "start_date": "2020-01-01",
  "end_date": null,
  "date_type": "publication",
  "explanation": "Searches for articles about CRISPR gene therapy published since 2020",
  ...
}
""",
    schema={
        "type": "object",
        "properties": {
            "query_expression": {"type": "string"},
            "start_date": {"type": ["string", "null"]},
            "end_date": {"type": ["string", "null"]},
            "date_type": {"type": "string", "enum": ["publication", "entry"]},
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
    summarize=_summarize_filter_suggestion,
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
    summarize=_summarize_stream_suggestions,
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
    summarize=_summarize_portfolio_insights,
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
    summarize=_summarize_quick_setup,
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
    summarize=_summarize_stream_template,
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
    summarize=_summarize_topic_suggestions,
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
    summarize=_summarize_validation_feedback,
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


# =============================================================================
# Tablizer / TrialScout Payloads
# =============================================================================

def _summarize_ai_column_suggestion(data: Dict[str, Any]) -> str:
    """Summarize an AI column suggestion."""
    name = data.get("name", "Unnamed column")
    col_type = data.get("type", "unknown")
    return f"AI column suggestion: '{name}' ({col_type})"


register_payload_type(PayloadType(
    name="ai_column_suggestion",
    description="Suggested AI column for filtering or categorizing results",
    source="llm",
    is_global=False,
    parse_marker="AI_COLUMN:",
    parser=make_json_parser("ai_column_suggestion"),
    summarize=_summarize_ai_column_suggestion,
    llm_instructions="""
AI_COLUMN - Use when user wants to filter or categorize results with an AI-powered column.

When you output this payload, it will appear in a side panel for the user to review.
If they click "Add Column", the AI column will be created and start processing their articles.
Tell the user: "I've prepared an AI column for you - you can see the details in the panel on the right. Click 'Add Column' to create it."

AI_COLUMN: {
  "name": "Column display name",
  "criteria": "The criteria prompt for the AI to evaluate each item",
  "type": "boolean",
  "explanation": "What this column will help identify and how to use it"
}

Guidelines:
- type "boolean" = yes/no filtering (enables quick filter toggles) - best for narrowing results
- type "text" = extract or summarize information from each article
- Write clear, specific criteria that the AI can evaluate for each article
- The explanation should tell the user what the column does and how to use the results

Example:
User: "I only want articles about clinical trials"
AI_COLUMN: {
  "name": "Is Clinical Trial",
  "criteria": "Is this article about a clinical trial? Look for trial registration, randomized/placebo-controlled design, or clinical trial phases.",
  "type": "boolean",
  "explanation": "Identifies clinical trial articles. After adding, filter to 'Yes' to see only trials."
}

Example for extraction:
User: "Add a column showing the main drug studied"
AI_COLUMN: {
  "name": "Main Drug",
  "criteria": "What is the primary drug or compound being studied in this article? Provide the drug name or 'N/A' if not applicable.",
  "type": "text",
  "explanation": "Extracts the main drug or compound studied, making it easy to scan and compare across articles."
}
""",
    schema={
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Display name for the column"},
            "criteria": {"type": "string", "description": "Criteria prompt for AI evaluation"},
            "type": {"type": "string", "enum": ["boolean", "text"], "description": "Output type"},
            "explanation": {"type": "string", "description": "Explanation for the user"}
        },
        "required": ["name", "criteria", "type"]
    }
))


# =============================================================================
# Report Tool Payloads
# =============================================================================

def _summarize_report_list(data: Dict[str, Any]) -> str:
    """Summarize a report list."""
    total = data.get("total_reports", 0)
    return f"List of {total} reports for the stream"


def _summarize_report_summary(data: Dict[str, Any]) -> str:
    """Summarize report summary data."""
    name = data.get("report_name", "Unknown")
    article_count = data.get("article_count", 0)
    if len(name) > 40:
        name = name[:37] + "..."
    return f"Report summary: '{name}' ({article_count} articles)"


def _summarize_report_articles(data: Dict[str, Any]) -> str:
    """Summarize report articles list."""
    name = data.get("report_name", "Unknown")
    total = data.get("total_articles", 0)
    mode = data.get("mode", "condensed")
    if len(name) > 30:
        name = name[:27] + "..."
    return f"{total} articles from '{name}' ({mode})"


def _summarize_article_search_results(data: Dict[str, Any]) -> str:
    """Summarize article search results."""
    query = data.get("query", "unknown")
    total = data.get("total_results", 0)
    if len(query) > 30:
        query = query[:27] + "..."
    return f"Article search for '{query}': {total} results"


def _summarize_article_details(data: Dict[str, Any]) -> str:
    """Summarize article details."""
    pmid = data.get("pmid", "unknown")
    title = data.get("title", "Untitled")
    if len(title) > 50:
        title = title[:47] + "..."
    return f"Article PMID:{pmid} - {title}"


def _summarize_article_notes(data: Dict[str, Any]) -> str:
    """Summarize article notes."""
    article_id = data.get("article_id", "unknown")
    total = data.get("total_notes", 0)
    return f"{total} notes for article {article_id}"


def _summarize_report_comparison(data: Dict[str, Any]) -> str:
    """Summarize report comparison."""
    r1 = data.get("report_1", {})
    r2 = data.get("report_2", {})
    only_1 = data.get("only_in_report_1", 0)
    only_2 = data.get("only_in_report_2", 0)
    return f"Comparison: {only_2} new, {only_1} removed"


def _summarize_starred_articles(data: Dict[str, Any]) -> str:
    """Summarize starred articles."""
    total = data.get("total_starred", 0)
    return f"{total} starred articles in stream"


register_payload_type(PayloadType(
    name="report_list",
    description="List of reports for a research stream",
    source="tool",
    is_global=True,
    summarize=_summarize_report_list,
    schema={
        "type": "object",
        "properties": {
            "stream_id": {"type": "integer"},
            "total_reports": {"type": "integer"},
            "reports": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "report_id": {"type": "integer"},
                        "report_name": {"type": "string"},
                        "report_date": {"type": ["string", "null"]},
                        "has_highlights": {"type": "boolean"},
                        "has_thematic_analysis": {"type": "boolean"}
                    }
                }
            }
        }
    }
))

register_payload_type(PayloadType(
    name="report_summary",
    description="Summary, highlights, and analysis for a report",
    source="tool",
    is_global=True,
    summarize=_summarize_report_summary,
    schema={
        "type": "object",
        "properties": {
            "report_id": {"type": "integer"},
            "report_name": {"type": "string"},
            "report_date": {"type": ["string", "null"]},
            "article_count": {"type": "integer"},
            "key_highlights": {"type": ["string", "null"]},
            "thematic_analysis": {"type": ["string", "null"]},
            "executive_summary": {"type": ["string", "null"]},
            "category_summaries": {"type": "array"}
        }
    }
))

register_payload_type(PayloadType(
    name="report_articles",
    description="List of articles in a report",
    source="tool",
    is_global=True,
    summarize=_summarize_report_articles,
    schema={
        "type": "object",
        "properties": {
            "report_id": {"type": "integer"},
            "report_name": {"type": "string"},
            "total_articles": {"type": "integer"},
            "articles": {"type": "array"},
            "mode": {"type": "string"}
        }
    }
))

register_payload_type(PayloadType(
    name="article_search_results",
    description="Search results for articles across reports",
    source="tool",
    is_global=True,
    summarize=_summarize_article_search_results,
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "total_results": {"type": "integer"},
            "articles": {"type": "array"}
        }
    }
))

register_payload_type(PayloadType(
    name="article_details",
    description="Full details of a specific article",
    source="tool",
    is_global=True,
    summarize=_summarize_article_details,
    schema={
        "type": "object",
        "properties": {
            "article_id": {"type": "integer"},
            "pmid": {"type": "string"},
            "title": {"type": "string"},
            "authors": {"type": "string"},
            "abstract": {"type": ["string", "null"]},
            "journal": {"type": "string"},
            "year": {"type": ["string", "integer", "null"]},
            "relevance_score": {"type": ["number", "null"]},
            "is_starred": {"type": ["boolean", "null"]},
            "notes_count": {"type": "integer"}
        }
    }
))

register_payload_type(PayloadType(
    name="article_notes",
    description="Notes for a specific article",
    source="tool",
    is_global=True,
    summarize=_summarize_article_notes,
    schema={
        "type": "object",
        "properties": {
            "article_id": {"type": "integer"},
            "report_id": {"type": "integer"},
            "total_notes": {"type": "integer"},
            "notes": {"type": "array"}
        }
    }
))

register_payload_type(PayloadType(
    name="report_comparison",
    description="Comparison between two reports",
    source="tool",
    is_global=True,
    summarize=_summarize_report_comparison,
    schema={
        "type": "object",
        "properties": {
            "report_1": {"type": "object"},
            "report_2": {"type": "object"},
            "only_in_report_1": {"type": "integer"},
            "only_in_report_2": {"type": "integer"},
            "in_both": {"type": "integer"}
        }
    }
))

register_payload_type(PayloadType(
    name="starred_articles",
    description="Starred articles across a stream's reports",
    source="tool",
    is_global=True,
    summarize=_summarize_starred_articles,
    schema={
        "type": "object",
        "properties": {
            "stream_id": {"type": "integer"},
            "total_starred": {"type": "integer"},
            "articles": {"type": "array"}
        }
    }
))


# =============================================================================
# Deep Research Payloads
# =============================================================================

def _summarize_deep_research_result(data: Dict[str, Any]) -> str:
    """Summarize deep research result."""
    status = data.get("status", "unknown")
    iterations = data.get("iterations_used", 0)
    sources = len(data.get("sources", []))
    return f"Deep research: {status} ({iterations} iterations, {sources} sources)"


register_payload_type(PayloadType(
    name="deep_research_result",
    description="Result from deep research tool with synthesized answer and citations",
    source="tool",
    is_global=True,
    summarize=_summarize_deep_research_result,
    schema={
        "type": "object",
        "properties": {
            "trace_id": {"type": "string", "description": "Trace ID for research execution"},
            "answer": {"type": "string", "description": "Synthesized answer with inline citations"},
            "sources": {
                "type": "array",
                "description": "Sources used in the answer",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "type": {"type": "string", "enum": ["pubmed", "web"]},
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "snippet": {"type": "string"}
                    }
                }
            },
            "checklist_coverage": {
                "type": "object",
                "description": "Coverage of checklist items",
                "properties": {
                    "satisfied": {"type": "array", "items": {"type": "string"}},
                    "partial": {"type": "array", "items": {"type": "string"}},
                    "gaps": {"type": "array", "items": {"type": "string"}}
                }
            },
            "iterations_used": {"type": "integer", "description": "Number of research iterations performed"},
            "status": {"type": "string", "enum": ["completed", "max_iterations_reached", "error"]},
            "limitations": {"type": "array", "items": {"type": "string"}, "description": "Known limitations"},
            "evaluation": {
                "type": "object",
                "description": "Evaluation details from the research process",
                "properties": {
                    "final_confidence": {"type": "number", "description": "Final confidence score (0.0 to 1.0)"},
                    "used_second_opinion": {"type": "boolean", "description": "Whether a second opinion was requested"}
                }
            }
        },
        "required": ["trace_id", "answer", "sources", "status"]
    }
))
