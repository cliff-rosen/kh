"""
Payload configurations for the streams_list page.
Defines all payload types and context builder this page supports.
"""

import json
import logging
from typing import Dict, Any
from .registry import PayloadConfig, register_page

logger = logging.getLogger(__name__)


def parse_stream_suggestions(text: str) -> Dict[str, Any]:
    """Parse STREAM_SUGGESTIONS JSON from LLM response."""
    try:
        suggestions_data = json.loads(text.strip())
        return {
            "type": "stream_suggestions",
            "data": suggestions_data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse STREAM_SUGGESTIONS JSON: {e}")
        return None


def parse_portfolio_insights(text: str) -> Dict[str, Any]:
    """Parse PORTFOLIO_INSIGHTS JSON from LLM response."""
    try:
        insights_data = json.loads(text.strip())
        return {
            "type": "portfolio_insights",
            "data": insights_data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse PORTFOLIO_INSIGHTS JSON: {e}")
        return None


def parse_quick_setup(text: str) -> Dict[str, Any]:
    """Parse QUICK_SETUP JSON from LLM response."""
    try:
        setup_data = json.loads(text.strip())
        return {
            "type": "quick_setup",
            "data": setup_data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse QUICK_SETUP JSON: {e}")
        return None


# Define payload configurations for streams_list page
STREAMS_LIST_PAYLOADS = [
    PayloadConfig(
        type="stream_suggestions",
        parse_marker="STREAM_SUGGESTIONS:",
        parser=parse_stream_suggestions,
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
        """
    ),
    PayloadConfig(
        type="portfolio_insights",
        parse_marker="PORTFOLIO_INSIGHTS:",
        parser=parse_portfolio_insights,
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
        """
    ),
    PayloadConfig(
        type="quick_setup",
        parse_marker="QUICK_SETUP:",
        parser=parse_quick_setup,
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
        """
    )
]


def build_context(context: Dict[str, Any]) -> str:
    """Build context section for streams_list page."""
    streams = context.get("streams", [])
    stream_count = len(streams)

    if stream_count == 0:
        return """The user is viewing their Research Streams list page.

    Current status: No research streams created yet

    WHAT ARE RESEARCH STREAMS:
    Research streams are focused monitoring channels that track specific topics, competitors, or therapeutic areas.
    Each stream defines what information matters, how to find it, and how to organize the results.
    """

    # Build summary of existing streams
    stream_summaries = []
    for stream in streams[:5]:  # Limit to first 5 for context
        name = stream.get("stream_name", "Unnamed")
        purpose = stream.get("purpose", "No purpose defined")
        is_active = stream.get("is_active", False)
        status = "Active" if is_active else "Inactive"
        stream_summaries.append(f"  - {name} ({status}): {purpose}")

    summary_text = "\n".join(stream_summaries)
    more_text = f"\n  ... and {stream_count - 5} more" if stream_count > 5 else ""

    return f"""The user is viewing their Research Streams list page.

    Current portfolio: {stream_count} research stream{'s' if stream_count != 1 else ''}

{summary_text}{more_text}

    CONTEXT:
    The user can create new streams, edit existing ones, or get help understanding their current portfolio.
    Help them understand gaps, overlaps, or suggest new streams that would be valuable.
    """


# Register page configuration on module import
register_page("streams_list", STREAMS_LIST_PAYLOADS, build_context)
