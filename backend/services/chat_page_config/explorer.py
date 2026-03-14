"""
Chat page config for the Explorer page.

Defines context builder and persona for the unified article search interface.

ARCHITECTURE:
- Context builder: Provides search state (query, sources, results)
- Persona: Specialized for search/discovery interactions
- Tools: Uses global tools (search, tags, collections, help)
"""

from typing import Dict, Any
from .registry import register_page


# =============================================================================
# Persona
# =============================================================================

EXPLORER_PERSONA = """## Explorer

The user is on the Explorer page — a unified search interface for discovering articles across streams, collections, and PubMed.

**Your tools let you:**
- Search PubMed for articles beyond what's loaded
- List available collections and their contents
- List available tags and search articles by tags
- Get detailed article information

**Your focus should be on:**
- Helping refine search queries for better results
- Explaining what sources are being searched and how deduplication works
- Helping the user decide which articles to select or add to collections
- Answering questions about articles in the current results

**Page-specific guidance:**
- The user can toggle between list view and table view (Tablizer with AI columns)
- Results come from a mix of local DB (streams/collections) and PubMed
- PubMed results load incrementally (20 at a time) — the user must click Load More
- Articles can be selected and added to existing collections or used to create new ones
- In table view, the user can add AI columns for analysis but must load all desired results first
- Use the context below to understand what the user has already searched and loaded
"""


# =============================================================================
# Context Builder
# =============================================================================

def build_context(context: Dict[str, Any]) -> str:
    """Build context for the Explorer page."""
    parts = ["Page: Explorer", ""]

    # Search state
    query = context.get("search_query")
    if query:
        parts.append(f"Search query: \"{query}\"")
    else:
        parts.append("Search query: None (no search performed yet)")

    # Active sources
    sources = context.get("sources", {})
    active_sources = []
    if sources.get("streams"):
        active_sources.append("Streams")
    if sources.get("collections"):
        active_sources.append("Collections")
    if sources.get("pubmed"):
        active_sources.append("PubMed")
    if active_sources:
        parts.append(f"Sources enabled: {', '.join(active_sources)}")

    # Stream filter
    stream_ids = context.get("selected_stream_ids", [])
    if stream_ids:
        parts.append(f"Filtering by stream IDs: {stream_ids}")

    # Results
    result_count = context.get("result_count", 0)
    local_count = context.get("local_count", 0)
    pubmed_total = context.get("pubmed_total", 0)
    if result_count > 0:
        parts.append(f"Results loaded: {result_count} articles")
        if local_count:
            parts.append(f"  From local DB: {local_count}")
        if pubmed_total:
            parts.append(f"  PubMed total matches: {pubmed_total}")

    # Selection
    selected_count = context.get("selected_count", 0)
    if selected_count > 0:
        parts.append(f"Selected: {selected_count} articles")

    # View mode
    view_mode = context.get("view_mode", "list")
    parts.append(f"View: {view_mode}")

    return "\n".join(parts)


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="explorer",
    context_builder=build_context,
    persona=EXPLORER_PERSONA,
    # Global tools cover everything needed (search_pubmed, list_tags, etc.)
    # No page-specific payloads needed
)
