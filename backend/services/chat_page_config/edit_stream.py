"""
Chat page config for the edit_stream page.

Defines context builders and tab-specific tool/payload configuration.
Payload definitions (including parsers and LLM instructions) are in schemas/payloads.py.
"""

from typing import Dict, Any
from .registry import TabConfig, SubTabConfig, register_page


# =============================================================================
# Context Builders (tab-specific)
# =============================================================================

def _build_semantic_tab_context(context: Dict[str, Any]) -> str:
    """Build context for the Semantic Space tab."""
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

SEMANTIC SPACE defines the canonical, source-agnostic ground truth about what information matters for this research area.

Key fields you can help with:
1. stream_name: Short, clear name for the research stream
2. purpose: High-level explanation of why this stream exists
3. semantic_space.domain.name: The domain this research covers
4. semantic_space.domain.description: Detailed description of the domain
5. semantic_space.topics: Array of topics to track

Help the user define what information is important, regardless of where it comes from."""


def _build_retrieval_tab_context(context: Dict[str, Any]) -> str:
    """Build context for the Retrieval Config tab."""
    current_schema = context.get("current_schema", {})
    stream_name = current_schema.get("stream_name", "Not set")
    topics = current_schema.get("semantic_space", {}).get("topics", [])
    topics_list = [f"  - {t.get('topic_id', 'unknown')}: {t.get('name', 'Unnamed')}" for t in topics] if topics else ["  (No topics defined)"]

    return f"""The user is on the RETRIEVAL CONFIG tab (Layer 2: How to find & filter).

Current stream: {stream_name}

Semantic Topics (from Layer 1):
{chr(10).join(topics_list)}

RETRIEVAL CONFIG translates the semantic space into specific search strategies for finding relevant articles.

You can help by:
- Proposing new or improved search queries
- Explaining PubMed query syntax (AND, OR, NOT, field tags)
- Suggesting semantic filter criteria
- Troubleshooting search issues"""


def _build_execute_tab_context(context: Dict[str, Any]) -> str:
    """Build context for the Test & Refine tab."""
    current_schema = context.get("current_schema", {})
    stream_name = current_schema.get("stream_name", "Not set")
    topics = current_schema.get("semantic_space", {}).get("topics", [])
    topics_list = [f"  - {t.get('topic_id', 'unknown')}: {t.get('name', 'Unnamed')}" for t in topics] if topics else ["  (No topics defined)"]

    return f"""The user is on the TEST & REFINE tab (Refinement Workbench).

Current stream: {stream_name}

Semantic Topics:
{chr(10).join(topics_list)}

The Refinement Workbench is an interactive testing environment where users:
1. Test PubMed queries to see what articles they retrieve
2. Apply semantic filters to refine results
3. Compare results and iterate on their configuration

You can help by:
- Writing or improving PubMed query expressions (use QUERY_SUGGESTION payload)
- Suggesting semantic filter criteria (use FILTER_SUGGESTION payload)
- Analyzing test results and explaining what's happening"""


def build_context(context: Dict[str, Any]) -> str:
    """
    Build context section for edit_stream page.
    Routes to tab-specific context builders based on active_tab.
    """
    active_tab = context.get("active_tab", "semantic")

    if active_tab == "semantic":
        return _build_semantic_tab_context(context)
    elif active_tab == "retrieval":
        return _build_retrieval_tab_context(context)
    elif active_tab == "execute":
        return _build_execute_tab_context(context)
    else:
        return _build_semantic_tab_context(context)


# =============================================================================
# Persona
# =============================================================================

EDIT_STREAM_PERSONA = """## Edit Research Stream

You are helping the user configure and refine an existing research stream. The stream already exists
and may have reports — changes affect future pipeline runs.

**Your role:**
1. Help improve the semantic space (domain, topics, entities)
2. Generate or refine retrieval queries and filters
3. Generate or adjust presentation categories
4. Validate configuration and suggest improvements
5. Help test and refine search queries in the workbench

**How you work by tab:**

- **Semantic Space tab**: Help define what information matters. Use generate_semantic_space tool to
  rebuild from a description, or use VALIDATION_FEEDBACK to assess the current config.

- **Retrieval Config tab**: Help configure how articles are found. Use generate_retrieval_queries tool
  to create queries from the semantic space. Use QUERY_SUGGESTION to propose individual PubMed query
  expressions. Use FILTER_SUGGESTION to propose semantic filter criteria.

- **Presentation tab**: Help organize how results are categorized. Use generate_categories tool to
  create categories from topics.

- **Control Panel / Workbench tab**: Help test and refine queries interactively. Use QUERY_SUGGESTION
  and FILTER_SUGGESTION payloads here.

**Be proactive:** If you see obvious gaps (no topics, missing queries, empty categories), point them
out and offer to fix them immediately.
"""

# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="edit_research_stream",
    context_builder=build_context,
    tabs={
        "semantic": TabConfig(
            payloads=["validation_feedback", "semantic_space_proposal"],
        ),
        "retrieval": TabConfig(
            payloads=["retrieval_config_proposal"],
        ),
        "presentation": TabConfig(
            payloads=["presentation_config_proposal"],
        ),
        "execute": TabConfig(
            subtabs={
                "workbench": SubTabConfig(
                    payloads=["query_suggestion", "filter_suggestion"],
                ),
                "pipeline": SubTabConfig(),
            }
        ),
    },
    persona=EDIT_STREAM_PERSONA,
)
