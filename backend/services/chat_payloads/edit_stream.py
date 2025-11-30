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


def parse_presentation_categories(text: str) -> Dict[str, Any]:
    """Parse PRESENTATION_CATEGORIES JSON from LLM response."""
    try:
        categories_data = json.loads(text.strip())
        return {
            "type": "presentation_categories",
            "data": categories_data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse PRESENTATION_CATEGORIES JSON: {e}")
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
    ),
    PayloadConfig(
        type="presentation_categories",
        parse_marker="PRESENTATION_CATEGORIES:",
        parser=parse_presentation_categories,
        llm_instructions="""
        PRESENTATION_CATEGORIES - Use when user asks for help organizing articles into categories:

        PRESENTATION_CATEGORIES: {
          "categories": [
            {
              "id": "category_1",
              "name": "Treatment Advances",
              "topics": ["topic_1", "topic_2"],
              "specific_inclusions": [
                "New drug approvals",
                "Clinical trial results for treatments",
                "Novel therapeutic approaches"
              ]
            },
            {
              "id": "category_2",
              "name": "Disease Understanding",
              "topics": ["topic_3", "topic_4"],
              "specific_inclusions": [
                "Mechanisms of disease progression",
                "Biomarker discoveries",
                "Risk factor identification"
              ]
            }
          ],
          "reasoning": "Based on the semantic topics you've defined, I've organized them into categories that group related research areas for easier consumption in reports."
        }

        Guidelines:
        - Only propose categories when on the presentation tab
        - Use the semantic space topics as the foundation
        - Create logical groupings that make sense for report readers
        - Each category should reference topic IDs from the semantic space
        - Provide specific_inclusions that clarify what types of articles go in each category
        - Typically 3-5 categories work well for most research streams
        """
    )
]


def _build_semantic_tab_context(context: Dict[str, Any]) -> str:
    """Build context for the Semantic Space tab (Layer 1)."""
    current_schema = context.get("current_schema", {})
    stream_name = current_schema.get("stream_name", "Not set")
    purpose = current_schema.get("purpose", "Not set")
    domain = current_schema.get("semantic_space", {}).get("domain", {})
    domain_name = domain.get("name", "Not set")
    domain_description = domain.get("description", "Not set")
    topics = current_schema.get("semantic_space", {}).get("topics", [])
    topics_summary = f"{len(topics)} topics defined" if topics else "No topics defined yet"

    return f"""The user is on the SEMANTIC SPACE tab (Layer 1: What information matters).

    Current values:
    - Stream Name: {stream_name}
    - Purpose: {purpose}
    - Domain Name: {domain_name}
    - Domain Description: {domain_description}
    - Topics: {topics_summary}

    SEMANTIC SPACE defines the canonical, source-agnostic ground truth about what information matters for this research area. This layer describes the knowledge domain itself, independent of any specific data source.

    Key fields you can help with:
    1. stream_name: Short, clear name for the research stream
    2. purpose: High-level explanation of why this stream exists
    3. semantic_space.domain.name: The domain this research covers
    4. semantic_space.domain.description: Detailed description of the domain
    5. semantic_space.topics: Array of topics to track (topic_id, name, description, importance, rationale)
    6. semantic_space.context.business_context: Why this research matters to the organization
    7. semantic_space.context.decision_types: What decisions this informs
    8. semantic_space.context.stakeholders: Who uses this information
    9. semantic_space.entities: Key entities to track (people, organizations, drugs, etc.)
    10. semantic_space.coverage: What types of signals, time periods, and quality criteria matter

    Help the user define what information is important, regardless of where it comes from."""


def _build_retrieval_tab_context(context: Dict[str, Any]) -> str:
    """Build context for the Retrieval Config tab (Layer 2)."""
    current_schema = context.get("current_schema", {})
    stream_name = current_schema.get("stream_name", "Not set")
    topics = current_schema.get("semantic_space", {}).get("topics", [])
    topics_summary = f"{len(topics)} topics defined" if topics else "No topics defined yet"

    return f"""The user is on the RETRIEVAL CONFIG tab (Layer 2: How to find & filter).

    Current stream: {stream_name}
    Semantic topics defined: {topics_summary}

    RETRIEVAL CONFIG translates the semantic space into specific search strategies for finding relevant articles from PubMed and other sources. This layer is about HOW to query and filter, not WHAT information matters (that's Layer 1).

    Key concepts:
    1. retrieval_config.concepts: Search concepts with boolean operators (AND, OR, NOT) and specific terms
    2. retrieval_config.article_limit_per_week: How many articles to retrieve per week

    The retrieval wizard helps users create effective search queries from their semantic topics. You can:
    - Explain how concepts map to semantic topics
    - Help troubleshoot retrieval strategies
    - Suggest refinements to search terms
    - Guide users on using the wizard for AI-assisted setup

    This layer derives from the semantic space but expresses it as executable search logic."""


def _build_presentation_tab_context(context: Dict[str, Any]) -> str:
    """Build context for the Presentation tab (Layer 3)."""
    current_schema = context.get("current_schema", {})
    stream_name = current_schema.get("stream_name", "Not set")
    topics = current_schema.get("semantic_space", {}).get("topics", [])
    topics_list = [f"  - {t.get('topic_id', 'unknown')}: {t.get('name', 'Unnamed')}" for t in topics] if topics else ["  (No topics defined yet)"]

    return f"""The user is on the PRESENTATION tab (Layer 3: How to organize results).

    Current stream: {stream_name}

    Available semantic topics from Layer 1:
    {chr(10).join(topics_list)}

    PRESENTATION TAXONOMY defines how to organize retrieved articles into categories for report consumption. This layer groups semantic topics into logical categories that make sense for readers.

    Key concepts:
    1. categories: Array of presentation categories, each with:
      - id: Unique identifier for the category
      - name: Display name for the category
      - topics: Array of topic_ids from the semantic space
      - specific_inclusions: Specific types of content to include in this category

    You can help by:
    - Proposing logical category groupings based on the semantic topics
    - Suggesting how to organize topics for different audience types
    - Recommending specific_inclusions that clarify category boundaries

    Categories make reports more digestible by grouping related research areas together."""


def _build_execute_tab_context(context: Dict[str, Any]) -> str:
    """Build context for the Test & Refine tab."""
    current_schema = context.get("current_schema", {})
    stream_name = current_schema.get("stream_name", "Not set")
    topics = current_schema.get("semantic_space", {}).get("topics", [])
    topics_summary = f"{len(topics)} topics defined" if topics else "No topics defined yet"

    return f"""The user is on the TEST & REFINE tab (Test queries and run pipeline).

    Current stream: {stream_name}
    Semantic topics: {topics_summary}

    This tab allows users to:
    1. Test individual retrieval concepts to see what articles they return
    2. Refine search queries based on results
    3. Run the full pipeline to generate a report
    4. Validate that the entire three-layer architecture is working correctly

    You can help by:
    - Explaining how to test and refine queries
    - Troubleshooting why certain searches might not be working
    - Interpreting test results
    - Suggesting improvements based on retrieval performance

    This is where the rubber meets the road - testing that the semantic space, retrieval config, and presentation categories all work together."""


def build_context(context: Dict[str, Any]) -> str:
    """
    Build context section for edit_research_stream page.
    Routes to tab-specific context builders based on active_tab.
    """
    active_tab = context.get("active_tab", "semantic")

    # Route to tab-specific context builder
    if active_tab == "semantic":
        return _build_semantic_tab_context(context)
    elif active_tab == "retrieval":
        return _build_retrieval_tab_context(context)
    elif active_tab == "presentation":
        return _build_presentation_tab_context(context)
    elif active_tab == "execute":
        return _build_execute_tab_context(context)
    else:
        # Fallback to semantic tab if unknown tab
        return _build_semantic_tab_context(context)


# Register page configuration on module import
register_page("edit_research_stream", EDIT_STREAM_PAYLOADS, build_context)
