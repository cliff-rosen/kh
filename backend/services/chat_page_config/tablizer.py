"""
Chat page config for Tablizer (standalone PubMed article analysis app).

Defines context builder and payload configuration.
"""

from typing import Dict, Any, List
from .registry import register_page


def build_context(context: Dict[str, Any]) -> str:
    """
    Build context string for the Tablizer page.

    Context expected from frontend:
    - query: Current PubMed search query
    - total_matched: Total articles matching query
    - loaded_count: Number of articles loaded
    - snapshots: List of saved search snapshots
    - compare_mode: Whether compare mode is active
    - ai_columns: List of AI columns with their configs
    - articles: List of article summaries (pmid, title, year, journal)
    """
    query = context.get("query", "")
    total_matched = context.get("total_matched", 0)
    loaded_count = context.get("loaded_count", 0)
    snapshots = context.get("snapshots", [])
    compare_mode = context.get("compare_mode", False)
    ai_columns = context.get("ai_columns", [])
    articles = context.get("articles", [])

    # Format snapshots
    snapshots_text = "None"
    if snapshots:
        snapshot_lines = [f"  - {s.get('label', 'Unnamed')}: \"{s.get('query', '')}\" ({s.get('count', 0)} articles)" for s in snapshots]
        snapshots_text = "\n".join(snapshot_lines)

    # Format AI columns
    ai_columns_text = "None"
    if ai_columns:
        col_lines = [f"  - {c.get('name', 'Unnamed')} ({c.get('type', 'unknown')}){' [filtering]' if c.get('filter_active') else ''}" for c in ai_columns]
        ai_columns_text = "\n".join(col_lines)

    # Format articles (first 15)
    articles_text = "None loaded"
    if articles:
        article_lines = [f"  - [{a.get('pmid', '?')}] {a.get('title', 'Untitled')[:50]}... ({a.get('year', '?')})" for a in articles[:15]]
        if len(articles) > 15:
            article_lines.append(f"  ... and {len(articles) - 15} more")
        articles_text = "\n".join(article_lines)

    return f"""The user is using Tablizer to search and analyze PubMed articles.

CURRENT SEARCH:
- Query: {query or "No search yet"}
- Results: {loaded_count} articles loaded (of {total_matched} total matches)

SAVED SEARCHES (Snapshots):
{snapshots_text}
- Compare mode: {"ACTIVE" if compare_mode else "inactive"}

AI COLUMNS:
{ai_columns_text}

LOADED ARTICLES:
{articles_text}

---
CAPABILITIES:
1. Query formulation: Help build PubMed queries with MeSH terms, boolean operators, field tags
2. AI column suggestions: Propose AI columns to filter or categorize articles
3. Comparison workflow: Guide through comparing searches to find missed articles
4. Analysis: Answer questions about the loaded articles

WHEN HELPING WITH QUERIES:
- Use proper PubMed syntax: MeSH terms in brackets like [MeSH], field tags like [Title], [Author]
- Boolean operators: AND, OR, NOT (must be uppercase)
- Suggest both narrow and broad versions when appropriate

WHEN SUGGESTING AI COLUMNS:
- Use type "boolean" for yes/no filtering (enables quick filter toggles)
- Use type "text" for extracting information
- Write clear, specific criteria for the AI to evaluate
"""


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="tablizer",
    context_builder=build_context,
    payloads=["query_suggestion", "ai_column_suggestion"],
    tools=["get_pubmed_article"]  # For fetching full article details
)
