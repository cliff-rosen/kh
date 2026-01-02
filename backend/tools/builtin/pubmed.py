"""
PubMed Tools

Tools for searching and retrieving articles from PubMed.
"""

import logging
from typing import Any, Dict, Union

from sqlalchemy.orm import Session

from tools.registry import ToolConfig, ToolResult, register_tool

logger = logging.getLogger(__name__)


def execute_search_pubmed(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """
    Execute a PubMed search and return formatted results.
    Returns a ToolResult with both text for LLM and payload for frontend table.
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

        total_results = metadata.get('total_results', len(articles))

        # Format results for the LLM
        text_results = [f"Found {total_results} total results. Showing top {len(articles)}:\n"]

        # Build payload data for frontend
        articles_data = []

        for i, article in enumerate(articles, 1):
            # Get authors - handle both list and string formats
            authors = article.authors
            if isinstance(authors, list):
                authors_str = ", ".join(authors[:3])
                if len(authors) > 3:
                    authors_str += " et al."
            else:
                authors_str = str(authors) if authors else "Unknown"

            pmid = article.pmid or article.id
            journal = article.journal or 'Unknown'
            year = article.publication_date or 'Unknown'

            # Text for LLM
            text_results.append(f"""
            {i}. "{article.title}"
            PMID: {pmid}
            Authors: {authors_str}
            Journal: {journal} ({year})
            Abstract: {(article.abstract or 'No abstract')[:300]}{'...' if article.abstract and len(article.abstract) > 300 else ''}
            """)

            # Data for frontend payload
            articles_data.append({
                "pmid": str(pmid),
                "title": article.title,
                "authors": authors_str,
                "journal": journal,
                "year": str(year),
                "abstract": article.abstract or "",
                "has_free_full_text": bool(getattr(article, 'pmc_id', None))
            })

        text_result = "\n".join(text_results)

        payload = {
            "type": "pubmed_search_results",
            "data": {
                "query": query,
                "total_results": total_results,
                "showing": len(articles),
                "articles": articles_data
            }
        }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"PubMed search error: {e}", exc_info=True)
        return f"Error searching PubMed: {str(e)}"


def execute_get_pubmed_article(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """
    Retrieve a specific PubMed article by PMID.
    Returns a ToolResult with both text for LLM and payload for frontend card.
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

        text_result = f"""
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

        # Build payload for frontend card
        payload = {
            "type": "pubmed_article",
            "data": {
                "pmid": article.PMID,
                "title": article.title,
                "authors": article.authors,
                "journal": article.journal,
                "year": article.year,
                "volume": article.volume,
                "issue": article.issue,
                "pages": article.pages,
                "abstract": article.abstract,
                "pmc_id": article.pmc_id if article.pmc_id else None,
                "doi": article.doi if article.doi else None
            }
        }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"PubMed fetch error: {e}", exc_info=True)
        return f"Error fetching article: {str(e)}"


def execute_get_full_text(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """
    Retrieve the full text of an article from PubMed Central.
    Only works for articles that have a PMC ID (free full text).
    Returns a ToolResult with article card payload including full text.
    """
    from services.pubmed_service import PubMedService

    pmc_id = params.get("pmc_id", "")
    pmid = params.get("pmid", "")

    if not pmc_id and not pmid:
        return "Error: Either pmc_id or pmid must be provided."

    try:
        service = PubMedService()
        article = None

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
        else:
            # If PMC ID provided directly, try to get article metadata
            # Clean the PMC ID
            pmc_id = str(pmc_id).strip()
            if pmc_id.lower().startswith("pmc"):
                pmc_id_num = pmc_id[3:]
            else:
                pmc_id_num = pmc_id
                pmc_id = f"PMC{pmc_id}"

        # Fetch the full text
        full_text = service.get_pmc_full_text(pmc_id)

        if not full_text:
            return f"Could not retrieve full text for PMC ID: {pmc_id}. The article may not be available or there was an error."

        # If we don't have article metadata yet, try to fetch it
        if not article and pmid:
            articles = service.get_articles_from_ids([pmid])
            if articles:
                article = articles[0]

        # Build text result for LLM (truncated for token limits)
        text_full_text = full_text
        max_chars = 15000
        if len(text_full_text) > max_chars:
            text_full_text = text_full_text[:max_chars] + f"\n\n... [Text truncated. Full article is {len(full_text)} characters]"

        text_result = f"=== Full Text (PMC ID: {pmc_id}) ===\n\n{text_full_text}"

        # Build payload for frontend card with full text
        if article:
            payload = {
                "type": "pubmed_article",
                "data": {
                    "pmid": article.PMID,
                    "title": article.title,
                    "authors": article.authors,
                    "journal": article.journal,
                    "year": article.year,
                    "volume": article.volume,
                    "issue": article.issue,
                    "pages": article.pages,
                    "abstract": article.abstract,
                    "pmc_id": pmc_id,
                    "doi": article.doi if article.doi else None,
                    "full_text": full_text  # Full text for the card
                }
            }
        else:
            # Minimal payload if we couldn't fetch article metadata
            payload = {
                "type": "pubmed_article",
                "data": {
                    "pmid": pmid or "Unknown",
                    "title": "Full Text Retrieved",
                    "authors": "Unknown",
                    "journal": "Unknown",
                    "year": "Unknown",
                    "pmc_id": pmc_id,
                    "full_text": full_text
                }
            }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"Full text fetch error: {e}", exc_info=True)
        return f"Error fetching full text: {str(e)}"


# =============================================================================
# Register Tools
# =============================================================================

register_tool(ToolConfig(
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
    executor=execute_search_pubmed,
    category="research",
    payload_type="pubmed_search_results"
))

register_tool(ToolConfig(
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
    executor=execute_get_pubmed_article,
    category="research",
    payload_type="pubmed_article"
))

register_tool(ToolConfig(
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
    executor=execute_get_full_text,
    category="research",
    payload_type="pubmed_article"
))
