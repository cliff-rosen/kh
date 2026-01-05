"""
Chat page config for Tablizer (standalone PubMed article analysis app).

Defines context builder and payload configuration.
"""

from typing import Dict, Any, List
from .registry import register_page


# =============================================================================
# Application Guide (shown to LLM to help guide users)
# =============================================================================

TABLIZER_GUIDE = """
=== WHAT IS TABLIZER ===
Tablizer is a powerful alternative to searching directly on PubMed. It lets users search,
filter, and enrich PubMed articles with AI-generated columns — all in one place.

=== CORE FEATURES ===

1. SEARCH
   - Uses standard PubMed query syntax
   - Supports date filters (publication date or entry date)
   - Initial search fetches 20 articles quickly
   - When AI columns are added, automatically fetches up to 500 for processing

2. AI COLUMNS (key feature!)
   Users can add custom AI-powered columns to analyze articles:

   - Boolean (Yes/No): Great for filtering. Examples:
     * "Is this a clinical trial?"
     * "Does this study involve human subjects?"
     * "Is this about drug X?"
     After adding, users can filter by Yes/No with quick toggle buttons.

   - Text: Extract information from each article. Examples:
     * "What is the study design?"
     * "Summarize the main findings in one sentence"
     * "Extract the sample size and population"

   - Number: Extract numeric values. Examples:
     * "What is the sample size?"
     * "How many months of follow-up?"

3. FILTERING & SAVING
   - Text search filters across all visible columns
   - Boolean AI columns have Yes/No/All quick filter buttons
   - Filtered results can be saved to History for later reference
   - Export to CSV for use in other tools

4. HISTORY & COMPARE (powerful workflow!)
   - Every search is automatically saved to History panel
   - Users can click past searches to view those results
   - COMPARE MODE: Select two searches to see:
     * What's in both (intersection)
     * What's only in A
     * What's only in B
   - Useful for finding articles one query missed that another found

=== KEY WORKFLOW: Finding False Negatives ===
This is a common use case - validating whether a broader query captures relevant articles missed by a narrower one:

1. Run original query (Query A) - the baseline
2. Run expanded query (Query B) - broader to catch more
3. Use Compare Mode to see what's "Only in B" (the extra articles)
4. Save "Only in B" to History
5. View that snapshot, add a boolean AI column: "Is this relevant to [topic]?"
6. Filter by "Yes" to find confirmed false negatives

=== UI ELEMENTS ===
- Search form at top with query input and date filters
- Results table showing articles with sortable columns
- "Add AI Column" button (purple) to add new AI columns
- History panel on right showing saved searches
- "Compare Searches" button to enter compare mode
- Quick filter buttons appear for boolean AI columns
- Click any row to open full article viewer

=== TIPS FOR GUIDING USERS ===
- If user hasn't searched yet, help them formulate a good PubMed query
- If user has results but seems unsure, suggest an AI column to filter/categorize
- If user mentions missing articles, guide them through the compare workflow
- Boolean AI columns are most useful for filtering; suggest these for yes/no questions
- Remind users they can export to CSV when they have a good filtered set
"""


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

    return f"""{TABLIZER_GUIDE}

=== CURRENT USER STATE ===

SEARCH:
- Query: {query or "No search yet"}
- Results: {loaded_count} articles loaded (of {total_matched} total matches)

SAVED SEARCHES (History):
{snapshots_text}
- Compare mode: {"ACTIVE" if compare_mode else "inactive"}

AI COLUMNS:
{ai_columns_text}

LOADED ARTICLES:
{articles_text}

=== YOUR CAPABILITIES ===

1. SUGGEST QUERIES: Help formulate PubMed queries
   - Use proper syntax: MeSH terms [MeSH], field tags [Title], [Author], [Journal]
   - Boolean operators: AND, OR, NOT (must be uppercase)
   - Offer both narrow and broad versions when appropriate
   - Use QUERY_SUGGESTION payload to propose queries user can accept

2. SUGGEST AI COLUMNS: Propose columns to filter or analyze articles
   - Use "boolean" type for yes/no filtering (most useful for narrowing results)
   - Use "text" type for extracting information
   - Write clear, specific criteria for the AI to evaluate
   - Use AI_COLUMN payload to propose columns user can accept

3. GUIDE WORKFLOWS: Help users with compare mode, filtering, exporting
   - Explain how to use compare mode to find missed articles
   - Suggest saving filtered results to history
   - Remind about CSV export when they have a good set

4. ANSWER QUESTIONS: About the loaded articles or PubMed in general
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
