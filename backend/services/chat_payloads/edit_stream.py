"""
Payload configurations for the edit_research_stream page.
Defines all payload types and context builder this page supports.
"""

import json
import logging
from typing import Dict, Any
from .registry import PayloadConfig, ClientAction, register_page

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


def parse_prompt_suggestions(text: str) -> Dict[str, Any]:
    """Parse PROMPT_SUGGESTIONS JSON from LLM response."""
    try:
        suggestions_data = json.loads(text.strip())
        return {
            "type": "prompt_suggestions",
            "data": suggestions_data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse PROMPT_SUGGESTIONS JSON: {e}")
        return None


def parse_retrieval_proposal(text: str) -> Dict[str, Any]:
    """Parse RETRIEVAL_PROPOSAL JSON from LLM response."""
    try:
        proposal_data = json.loads(text.strip())
        return {
            "type": "retrieval_proposal",
            "data": proposal_data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse RETRIEVAL_PROPOSAL JSON: {e}")
        return None


# Define payload configurations for edit_research_stream page
EDIT_STREAM_PAYLOADS = [
    PayloadConfig(
        type="schema_proposal",
        parse_marker="SCHEMA_PROPOSAL:",
        parser=parse_schema_proposal,
        relevant_tabs=["semantic"],  # Only relevant on semantic tab
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
        relevant_tabs=["semantic"],  # Only relevant on semantic tab
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
        relevant_tabs=["semantic"],  # Only relevant on semantic tab
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
        relevant_tabs=["presentation"],  # Only relevant on presentation tab
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
    ),
    PayloadConfig(
        type="retrieval_proposal",
        parse_marker="RETRIEVAL_PROPOSAL:",
        parser=parse_retrieval_proposal,
        relevant_tabs=["retrieval"],  # Only relevant on retrieval tab
        llm_instructions="""
        RETRIEVAL_PROPOSAL - Use when user asks for help with search queries or filters.

        You can propose changes to QUERIES ONLY, FILTERS ONLY, or BOTH depending on what the user asks for.

        RETRIEVAL_PROPOSAL: {
          "update_type": "queries_only" | "filters_only" | "both",
          "target_ids": ["q1", "c1"],  // Which query/concept IDs to update (omit for new or all)

          // Include this section for query updates (when update_type is "queries_only" or "both")
          "queries": [
            {
              "query_id": "q1",
              "name": "Query name",
              "query_string": "PubMed search string",
              "covered_topics": ["topic_1", "topic_2"],
              "rationale": "Why this query works"
            }
          ],

          // Include this section for filter updates (when update_type is "filters_only" or "both")
          "filters": [
            {
              "target_id": "q1",  // Which query/concept this filter applies to
              "semantic_filter": {
                "enabled": true,
                "criteria": "Include articles that specifically discuss X in the context of Y. Exclude general reviews without specific findings.",
                "threshold": 0.7
              }
            }
          ],

          "changes_summary": "Brief description of what changed",
          "reasoning": "Why these changes will improve results"
        }

        Guidelines:
        - If user asks about FILTERS: use update_type "filters_only" and only include "filters" array
        - If user asks about QUERIES/SEARCHES: use update_type "queries_only" and only include "queries" array
        - If user wants both or a complete overhaul: use update_type "both"
        - Semantic filter criteria should be specific and actionable
        - Filter threshold: 0.5-0.6 for lenient, 0.7-0.8 for balanced, 0.9+ for strict
        - PubMed query syntax: AND, OR, NOT, field tags like [Title/Abstract], [MeSH Terms]
        """
    ),
    PayloadConfig(
        type="prompt_suggestions",
        parse_marker="PROMPT_SUGGESTIONS:",
        parser=parse_prompt_suggestions,
        relevant_tabs=["enrichment"],  # Only relevant on enrichment tab
        llm_instructions="""
        PROMPT_SUGGESTIONS - Use when user asks for help improving their prompts:

        PROMPT_SUGGESTIONS: {
          "prompt_type": "executive_summary" or "category_summary",
          "suggestions": [
            {
              "target": "system_prompt" or "user_prompt_template",
              "current_issue": "Description of what could be improved",
              "suggested_text": "The improved prompt text",
              "reasoning": "Why this change would help"
            }
          ],
          "general_advice": "Overall recommendations for prompt improvement"
        }

        Guidelines:
        - Review the current prompts and identify specific improvements
        - Consider the stream's purpose, domain, and topics when suggesting changes
        - Ensure suggested prompts use the available slugs correctly
        - Focus on clarity, specificity, and alignment with the research mandate
        - Suggest using more context from the semantic space where appropriate
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

    # Format topics
    topics = current_schema.get("semantic_space", {}).get("topics", [])
    topics_list = [f"  - {t.get('topic_id', 'unknown')}: {t.get('name', 'Unnamed')}" for t in topics] if topics else ["  (No topics defined)"]

    # Format current retrieval config
    retrieval_config = current_schema.get("retrieval_config", {})
    retrieval_section = ""

    def format_filter(f):
        if not f or not f.get("enabled"):
            return "Filter: disabled"
        return f"Filter: enabled (threshold: {f.get('threshold', 0.7)}) - {f.get('criteria', 'No criteria')[:60]}..."

    if retrieval_config.get("broad_search"):
        broad_search = retrieval_config["broad_search"]
        queries = broad_search.get("queries", [])
        queries_list = []
        for q in queries:
            query_id = q.get("query_id", "unknown")
            query_str = q.get("query_string", q.get("query", ""))
            covered = ", ".join(q.get("covered_topics", []))
            sem_filter = q.get("semantic_filter", {})
            filter_info = format_filter(sem_filter)
            queries_list.append(
                f"    [{query_id}] {q.get('name', 'Unnamed')}:\n"
                f"      Query: {query_str[:100]}{'...' if len(query_str) > 100 else ''}\n"
                f"      Covers: {covered}\n"
                f"      {filter_info}"
            )

        retrieval_section = f"""
    === CURRENT RETRIEVAL STRATEGY: BROAD SEARCH ===
    Strategy Rationale: {broad_search.get('strategy_rationale', 'Not specified')}

    Queries ({len(queries)}):
{chr(10).join(queries_list) if queries_list else '    (No queries defined)'}
"""
    elif retrieval_config.get("concepts"):
        concepts = retrieval_config["concepts"]
        concepts_list = []
        for c in concepts:
            concept_id = c.get("concept_id", "unknown")
            search_query = c.get("search_query", "")
            covered = ", ".join(c.get("covered_topics", []))
            sem_filter = c.get("semantic_filter", {})
            filter_info = format_filter(sem_filter)
            concepts_list.append(
                f"    [{concept_id}] {c.get('name', 'Unnamed')}:\n"
                f"      Query: {search_query[:80]}{'...' if len(search_query) > 80 else ''}\n"
                f"      Covers: {covered}\n"
                f"      {filter_info}"
            )

        retrieval_section = f"""
    === CURRENT RETRIEVAL STRATEGY: CONCEPTS ===
    Number of concepts: {len(concepts)}

    Concepts:
{chr(10).join(concepts_list) if concepts_list else '    (No concepts defined)'}
"""
    else:
        retrieval_section = """
    === CURRENT RETRIEVAL STRATEGY ===
    No retrieval strategy configured yet.
"""

    return f"""The user is on the RETRIEVAL CONFIG tab (Layer 2: How to find & filter).

    Current stream: {stream_name}

    Semantic Topics (from Layer 1):
{chr(10).join(topics_list)}
{retrieval_section}

    RETRIEVAL CONFIG translates the semantic space into specific search strategies for finding relevant articles from PubMed and other sources.

    Two retrieval strategies are available:
    1. BROAD SEARCH: Simple, high-recall queries (1-3 queries) that cast a wide net. Best for weekly monitoring.
    2. CONCEPTS: Focused boolean queries per topic with entity patterns. Best for precise retrieval.

    You can help by:
    - Proposing new or improved search queries using RETRIEVAL_PROPOSAL
    - Explaining PubMed query syntax (AND, OR, NOT, field tags)
    - Suggesting how to improve topic coverage
    - Troubleshooting why certain searches might not be working"""


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


def _build_enrichment_tab_context(context: Dict[str, Any]) -> str:
    """Build context for the Content Enrichment tab (Layer 4)."""
    current_schema = context.get("current_schema", {})
    stream_name = current_schema.get("stream_name", "Not set")
    purpose = current_schema.get("purpose", "Not set")
    enrichment = current_schema.get("enrichment", {})

    # Format topics for context
    topics = current_schema.get("semantic_space", {}).get("topics", [])
    topics_list = [f"  - {t.get('name', 'Unnamed')}: {t.get('description', '')[:100]}" for t in topics[:10]] if topics else ["  (No topics defined)"]

    # Format categories for context
    categories = current_schema.get("categories", [])
    categories_list = [f"  - {c.get('name', 'Unnamed')}" for c in categories] if categories else ["  (No categories defined)"]

    # Format enrichment config
    if enrichment:
        is_using_defaults = enrichment.get("is_using_defaults", True)
        exec_summary = enrichment.get("executive_summary", {})
        cat_summary = enrichment.get("category_summary", {})

        # Format available slugs
        exec_slugs = exec_summary.get("available_slugs", [])
        exec_slugs_list = [f"    - {s.get('slug', '')}: {s.get('description', '')}" for s in exec_slugs] if exec_slugs else ["    (No slugs available)"]

        cat_slugs = cat_summary.get("available_slugs", [])
        cat_slugs_list = [f"    - {s.get('slug', '')}: {s.get('description', '')}" for s in cat_slugs] if cat_slugs else ["    (No slugs available)"]

        enrichment_section = f"""
    === CURRENT ENRICHMENT CONFIG ===
    Using Defaults: {is_using_defaults}

    EXECUTIVE SUMMARY PROMPT:
    System Prompt:
    ```
    {exec_summary.get('system_prompt', '(Not set)')[:1500]}
    ```

    User Prompt Template:
    ```
    {exec_summary.get('user_prompt_template', '(Not set)')[:1500]}
    ```

    Available Slugs for Executive Summary:
{chr(10).join(exec_slugs_list)}

    CATEGORY SUMMARY PROMPT:
    System Prompt:
    ```
    {cat_summary.get('system_prompt', '(Not set)')[:1500]}
    ```

    User Prompt Template:
    ```
    {cat_summary.get('user_prompt_template', '(Not set)')[:1500]}
    ```

    Available Slugs for Category Summary:
{chr(10).join(cat_slugs_list)}
    """
    else:
        enrichment_section = """
    === ENRICHMENT CONFIG ===
    (Enrichment config not yet loaded - user may need to wait for it to load)
    """

    return f"""The user is on the CONTENT ENRICHMENT tab (Layer 4: How to summarize results).

    Current stream: {stream_name}
    Purpose: {purpose}

    Semantic Topics:
{chr(10).join(topics_list)}

    Presentation Categories:
{chr(10).join(categories_list)}
{enrichment_section}

    CONTENT ENRICHMENT controls how the LLM generates summaries for reports:
    1. Executive Summary - Synthesizes the entire report into key insights
    2. Category Summary - Summarizes articles within each presentation category

    Each prompt type has:
    - System Prompt: Sets the LLM's role and guidelines
    - User Prompt Template: The actual prompt with slugs that get replaced with real data

    SLUGS are placeholders like {{stream.name}}, {{articles.count}}, {{category.name}} that get replaced
    with actual data when the prompt runs. Users should use these to make prompts dynamic.

    You can help by:
    - Reviewing prompts and suggesting improvements
    - Explaining what each slug provides
    - Recommending prompts tailored to the stream's domain and purpose
    - Suggesting how to make summaries more relevant to stakeholders
    - Identifying missing context that could improve summary quality
    - Helping align prompts with the semantic space topics and categories"""


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
    elif active_tab == "enrichment":
        return _build_enrichment_tab_context(context)
    elif active_tab == "execute":
        return _build_execute_tab_context(context)
    else:
        # Fallback to semantic tab if unknown tab
        return _build_semantic_tab_context(context)


# Define available client actions for edit_research_stream page
EDIT_STREAM_CLIENT_ACTIONS = [
    ClientAction(
        action="close_chat",
        description="Close the chat tray"
    ),
]


# Register page configuration on module import
register_page("edit_research_stream", EDIT_STREAM_PAYLOADS, build_context, EDIT_STREAM_CLIENT_ACTIONS)
