"""
Payload configurations for the reports page.
Defines context builder and tools for report chat functionality.
"""

import logging
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from .registry import ClientAction, ToolConfig, register_page

logger = logging.getLogger(__name__)

def build_context(context: Dict[str, Any]) -> str:
    """
    Build context section for reports page.

    Note: The actual report data (articles, summaries, etc.) is loaded from
    the database by the GeneralChatService when it detects report_id in context.
    This context builder provides the base instructions; the service enriches it.
    """
    report_id = context.get("report_id")
    report_name = context.get("report_name", "Unknown Report")
    article_count = context.get("article_count", 0)

    # Base context - the service will enrich this with actual report data
    return f"""The user is viewing the REPORTS page.

    Current report: {report_name}
    Report ID: {report_id}
    Article count: {article_count}

    You are helping the user explore and understand this research report. You have access
    to the full contents of the report including articles, summaries, and analysis.

    You can help the user:
    - Understand key findings and themes in the report
    - Compare different articles and their findings
    - Identify trends and patterns across the research
    - Explain specific articles in more detail
    - Discuss business implications and relevance
    - Answer questions about methodology, authors, or journals
    - Summarize specific categories or topics

    Be conversational, helpful, and specific. Reference article titles when discussing
    specific papers. When discussing multiple articles, help the user understand how
    they relate to each other."""


# Define available client actions for reports page
REPORTS_CLIENT_ACTIONS = [
    ClientAction(
        action="close_chat",
        description="Close the chat panel"
    ),
]


# =============================================================================
# Tool Executors
# =============================================================================

def execute_search_pubmed(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> str:
    """
    Execute a PubMed search and return formatted results.
    """
    from services.pubmed_service import PubMedService

    query = params.get("query", "")
    max_results = min(params.get("max_results", 10), 20)  # Cap at 20

    if not query:
        return "Error: No search query provided."

    try:
        service = PubMedService()
        articles, metadata = service.search_articles(
            query=query,
            max_results=max_results
        )

        if not articles:
            return f"No articles found for query: {query}"

        # Format results for the LLM
        results = [f"Found {metadata.get('total_results', len(articles))} total results. Showing top {len(articles)}:\n"]

        for i, article in enumerate(articles, 1):
            # Get authors - handle both list and string formats
            authors = article.authors
            if isinstance(authors, list):
                authors_str = ", ".join(authors[:3])
                if len(authors) > 3:
                    authors_str += " et al."
            else:
                authors_str = str(authors) if authors else "Unknown"

            result = f"""
            {i}. "{article.title}"
            PMID: {article.pmid or article.id}
            Authors: {authors_str}
            Journal: {article.journal or 'Unknown'} ({article.publication_date or 'Unknown'})
            Abstract: {(article.abstract or 'No abstract')[:300]}{'...' if article.abstract and len(article.abstract) > 300 else ''}
            """
            results.append(result)

        return "\n".join(results)

    except Exception as e:
        logger.error(f"PubMed search error: {e}", exc_info=True)
        return f"Error searching PubMed: {str(e)}"


def execute_get_pubmed_article(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> str:
    """
    Retrieve a specific PubMed article by PMID.
    """
    from services.pubmed_service import PubMedService

    pmid = params.get("pmid", "")

    if not pmid:
        return "Error: No PMID provided."

    # Clean the PMID - remove any prefixes
    pmid = str(pmid).strip()
    if pmid.lower().startswith("pmid:"):
        pmid = pmid[5:].strip()

    try:
        service = PubMedService()
        articles = service.get_articles_from_ids([pmid])

        if not articles:
            return f"No article found with PMID: {pmid}"

        article = articles[0]

        # Format the full article for the LLM
        pmc_info = ""
        if article.pmc_id:
            pmc_info = f"\n        PMC ID: {article.pmc_id} (free full text available)"
        doi_info = ""
        if article.doi:
            doi_info = f"\n        DOI: {article.doi}"

        result = f"""
        === PubMed Article ===
        PMID: {article.PMID}
        Title: {article.title}
        Authors: {article.authors}
        Journal: {article.journal}
        Year: {article.year}
        Volume: {article.volume}, Issue: {article.issue}, Pages: {article.pages}{pmc_info}{doi_info}

        === Abstract ===
        {article.abstract or 'No abstract available.'}
        """
        return result

    except Exception as e:
        logger.error(f"PubMed fetch error: {e}", exc_info=True)
        return f"Error fetching article: {str(e)}"


def execute_get_full_text(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> str:
    """
    Retrieve the full text of an article from PubMed Central.
    Only works for articles that have a PMC ID (free full text).
    """
    from services.pubmed_service import PubMedService

    pmc_id = params.get("pmc_id", "")
    pmid = params.get("pmid", "")

    if not pmc_id and not pmid:
        return "Error: Either pmc_id or pmid must be provided."

    try:
        service = PubMedService()

        # If only PMID provided, first fetch the article to get PMC ID
        if not pmc_id and pmid:
            # Clean the PMID
            pmid = str(pmid).strip()
            if pmid.lower().startswith("pmid:"):
                pmid = pmid[5:].strip()

            articles = service.get_articles_from_ids([pmid])
            if not articles:
                return f"No article found with PMID: {pmid}"

            article = articles[0]
            if not article.pmc_id:
                return f"Article PMID {pmid} does not have free full text available in PubMed Central. Only the abstract is available."

            pmc_id = article.pmc_id

        # Fetch the full text
        full_text = service.get_pmc_full_text(pmc_id)

        if not full_text:
            return f"Could not retrieve full text for PMC ID: {pmc_id}. The article may not be available or there was an error."

        # Truncate if too long (to avoid token limits)
        max_chars = 15000
        if len(full_text) > max_chars:
            full_text = full_text[:max_chars] + f"\n\n... [Text truncated. Full article is {len(full_text)} characters]"

        return f"=== Full Text (PMC ID: {pmc_id}) ===\n\n{full_text}"

    except Exception as e:
        logger.error(f"Full text fetch error: {e}", exc_info=True)
        return f"Error fetching full text: {str(e)}"


# =============================================================================
# Tool Definitions
# =============================================================================

REPORTS_TOOLS = [
    ToolConfig(
        name="search_pubmed",
        description="Search PubMed for research articles. Use this to find additional articles related to topics in the report, or to answer questions about recent research.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The PubMed search query. Can include boolean operators (AND, OR, NOT), field tags like [Title], [Author], etc."
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (1-20). Default is 10.",
                    "default": 10,
                    "minimum": 1,
                    "maximum": 20
                }
            },
            "required": ["query"]
        },
        executor=execute_search_pubmed
    ),
    ToolConfig(
        name="get_pubmed_article",
        description="Retrieve the full details of a specific PubMed article by its PMID. Use this to get complete information about an article including the full abstract. The response will indicate if free full text is available (PMC ID present).",
        input_schema={
            "type": "object",
            "properties": {
                "pmid": {
                    "type": "string",
                    "description": "The PubMed ID (PMID) of the article to retrieve."
                }
            },
            "required": ["pmid"]
        },
        executor=execute_get_pubmed_article
    ),
    ToolConfig(
        name="get_full_text",
        description="Retrieve the full text of an article from PubMed Central. Only works for articles with free full text (those with a PMC ID). Use this when the user wants to read the complete article, not just the abstract. You can provide either a PMC ID directly or a PMID (which will be checked for PMC availability).",
        input_schema={
            "type": "object",
            "properties": {
                "pmc_id": {
                    "type": "string",
                    "description": "The PubMed Central ID (e.g., 'PMC1234567' or just '1234567'). Preferred if known."
                },
                "pmid": {
                    "type": "string",
                    "description": "The PubMed ID. Will be used to look up the PMC ID if pmc_id is not provided."
                }
            }
        },
        executor=execute_get_full_text
    )
]


# Register page configuration on module import
register_page("reports", [], build_context, REPORTS_CLIENT_ACTIONS, REPORTS_TOOLS)
