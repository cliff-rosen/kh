"""
Payload configurations for the edit_research_stream page.
Defines all payload types this page supports.
"""

import json
import logging
from typing import Dict, Any
from services.payload_configs import PayloadConfig, register_page_payloads

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


# Register these configurations on module import
register_page_payloads("edit_research_stream", EDIT_STREAM_PAYLOADS)
