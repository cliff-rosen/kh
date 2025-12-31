"""
Payload configurations for the new_stream page.
Defines all payload types and context builder for creating new research streams.
"""

import json
import logging
from typing import Dict, Any
from .registry import PayloadConfig, register_page

logger = logging.getLogger(__name__)


def parse_stream_template(text: str) -> Dict[str, Any]:
    """Parse STREAM_TEMPLATE JSON from LLM response."""
    try:
        data = json.loads(text.strip())
        return {
            "type": "stream_template",
            "data": data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse STREAM_TEMPLATE JSON: {e}")
        return None


def parse_topic_suggestions(text: str) -> Dict[str, Any]:
    """Parse TOPIC_SUGGESTIONS JSON from LLM response."""
    try:
        data = json.loads(text.strip())
        return {
            "type": "topic_suggestions",
            "data": data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse TOPIC_SUGGESTIONS JSON: {e}")
        return None


def parse_validation_feedback(text: str) -> Dict[str, Any]:
    """Parse VALIDATION_FEEDBACK JSON from LLM response."""
    try:
        data = json.loads(text.strip())
        return {
            "type": "validation_feedback",
            "data": data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse VALIDATION_FEEDBACK JSON: {e}")
        return None


# Define payload configurations
NEW_STREAM_PAYLOADS = [
    PayloadConfig(
        type="stream_template",
        parse_marker="STREAM_TEMPLATE:",
        parser=parse_stream_template,
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
        """
    ),
    PayloadConfig(
        type="topic_suggestions",
        parse_marker="TOPIC_SUGGESTIONS:",
        parser=parse_topic_suggestions,
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
        """
    ),
    PayloadConfig(
        type="validation_feedback",
        parse_marker="VALIDATION_FEEDBACK:",
        parser=parse_validation_feedback,
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
        """
    )
]


def build_context(context: Dict[str, Any]) -> str:
    """Build context section for new_stream page."""
    current_form = context.get("current_form", {})
    active_tab = context.get("active_tab", "semantic")

    stream_name = current_form.get("stream_name", "")
    domain_name = current_form.get("semantic_space", {}).get("domain", {}).get("name", "")
    domain_desc = current_form.get("semantic_space", {}).get("domain", {}).get("description", "")
    topics = current_form.get("semantic_space", {}).get("topics", [])
    entities = current_form.get("semantic_space", {}).get("entities", [])
    business_context = current_form.get("semantic_space", {}).get("context", {}).get("business_context", "")

    # Build context summary
    context_parts = []

    context_parts.append("The user is creating a new research stream.")
    context_parts.append(f"Currently viewing: {active_tab} layer")

    if stream_name:
        context_parts.append(f"\nCurrent Stream Name: {stream_name}")
    else:
        context_parts.append("\nStream name not yet set.")

    if domain_name or domain_desc:
        context_parts.append(f"\nDomain:")
        if domain_name:
            context_parts.append(f"  - Name: {domain_name}")
        if domain_desc:
            context_parts.append(f"  - Description: {domain_desc}")
    else:
        context_parts.append("\nDomain not yet defined.")

    if topics:
        context_parts.append(f"\nTopics ({len(topics)}):")
        for topic in topics[:5]:  # Show first 5
            name = topic.get("name", "Unnamed")
            desc = topic.get("description", "No description")
            context_parts.append(f"  - {name}: {desc}")
        if len(topics) > 5:
            context_parts.append(f"  ... and {len(topics) - 5} more")
    else:
        context_parts.append("\nNo topics defined yet.")

    if entities:
        context_parts.append(f"\nEntities ({len(entities)}):")
        for entity in entities[:5]:  # Show first 5
            name = entity.get("name", "Unnamed")
            entity_type = entity.get("type", "unknown")
            context_parts.append(f"  - {name} ({entity_type})")
        if len(entities) > 5:
            context_parts.append(f"  ... and {len(entities) - 5} more")
    else:
        context_parts.append("\nNo entities defined yet.")

    if business_context:
        context_parts.append(f"\nBusiness Context: {business_context}")

    context_parts.append("""
CONTEXT:
You are helping the user create a new research stream. A research stream monitors specific topics,
competitors, or therapeutic areas and generates regular reports. The stream has three layers:

1. Semantic Space (Layer 1): What information matters - domain, topics, entities, business context
2. Retrieval Config (Layer 2): How to find and filter - sources, search strategies, quality criteria
3. Presentation (Layer 3): How to organize results - categories for grouping findings

You can:
- Suggest complete stream templates based on the user's description
- Recommend topics relevant to their domain or business context
- Suggest entities (companies, products, people, etc.) to monitor
- Provide validation feedback on their current configuration
- Help improve domain descriptions and business context
- Answer questions about best practices for stream creation

Be proactive in offering suggestions but let the user guide the conversation. Ask clarifying
questions when needed to provide better recommendations.
""")

    return "\n".join(context_parts)


# Register page configuration on module import
register_page("new_stream", NEW_STREAM_PAYLOADS, build_context)
