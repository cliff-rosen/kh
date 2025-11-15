"""
Payload configurations for the edit_research_stream page.
Defines all payload types and context builder this page supports.
"""

import json
import logging
from typing import Dict, Any
from .registry import PayloadConfig, register_page

logger = logging.getLogger(__name__)


def parse_schema_proposal(text: str) -> Dict[str, Any]:
    """Parse SCHEMA_PROPOSAL JSON from LLM response."""
    try:
        schema_data = json.loads(text.strip())
        return {
            "type": "schema_proposal",
            "data": schema_data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse SCHEMA_PROPOSAL JSON: {e}")
        return None


def parse_validation_results(text: str) -> Dict[str, Any]:
    """Parse VALIDATION_RESULTS JSON from LLM response."""
    try:
        validation_data = json.loads(text.strip())
        return {
            "type": "validation_results",
            "data": validation_data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse VALIDATION_RESULTS JSON: {e}")
        return None


def parse_import_suggestions(text: str) -> Dict[str, Any]:
    """Parse IMPORT_SUGGESTIONS JSON from LLM response."""
    try:
        import_data = json.loads(text.strip())
        return {
            "type": "import_suggestions",
            "data": import_data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse IMPORT_SUGGESTIONS JSON: {e}")
        return None


# Define payload configurations for edit_research_stream page
EDIT_STREAM_PAYLOADS = [
    PayloadConfig(
        type="schema_proposal",
        parse_marker="SCHEMA_PROPOSAL:",
        parser=parse_schema_proposal,
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
        """
    ),
    PayloadConfig(
        type="validation_results",
        parse_marker="VALIDATION_RESULTS:",
        parser=parse_validation_results,
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
        """
    ),
    PayloadConfig(
        type="import_suggestions",
        parse_marker="IMPORT_SUGGESTIONS:",
        parser=parse_import_suggestions,
        llm_instructions="""
        IMPORT_SUGGESTIONS - Use when suggesting templates or starting points:

        IMPORT_SUGGESTIONS: {
          "templates": [
            {
              "template_id": "clinical_trials",
              "name": "Clinical Trials Research Stream",
              "description": "Pre-configured for tracking clinical trial developments",
              "match_score": 0.85,
              "reason": "You mentioned tracking treatments, which suggests clinical trials focus"
            }
          ]
        }

        Use this when:
        - User is starting from scratch
        - User mentions a domain we have templates for
        - User seems uncertain how to begin
        """
    )
]


def build_context(context: Dict[str, Any]) -> str:
    """Build context section for edit_research_stream page."""
    current_schema = context.get("current_schema", {})

    # Extract current values
    stream_name = current_schema.get("stream_name", "Not set")
    purpose = current_schema.get("purpose", "Not set")
    domain = current_schema.get("semantic_space", {}).get("domain", {})
    domain_name = domain.get("name", "Not set")
    domain_description = domain.get("description", "Not set")

    # Get topics if they exist
    topics = current_schema.get("semantic_space", {}).get("topics", [])
    topics_summary = f"{len(topics)} topics defined" if topics else "No topics defined yet"

    return f"""The user is editing a research stream. Current values:
    - Stream Name: {stream_name}
    - Purpose: {purpose}
    - Domain Name: {domain_name}
    - Domain Description: {domain_description}
    - Topics: {topics_summary}

    RESEARCH STREAM SCHEMA FIELDS:

    1. stream_name: Short, clear name for the research stream
    2. purpose: High-level explanation of why this stream exists
    3. semantic_space.domain.name: The domain this research covers
    4. semantic_space.domain.description: Detailed description of the domain
    5. semantic_space.topics: Array of topics to track (topic_id, name, description, importance, rationale)
    6. semantic_space.context.business_context: Business context
    7. semantic_space.context.decision_types: What decisions this informs
    8. semantic_space.context.stakeholders: Who uses this information
    """


# Register page configuration on module import
register_page("edit_research_stream", EDIT_STREAM_PAYLOADS, build_context)
