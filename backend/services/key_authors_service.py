"""
Key Authors Service

Manages the curated key authors list and searches PubMed live
for their publications.
"""

import logging
from typing import List, Optional
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from schemas.canonical_types import CanonicalResearchArticle

logger = logging.getLogger(__name__)


async def get_key_authors_list(
    db: AsyncSession, stream_id: Optional[int] = None
) -> List[str]:
    """
    Get the curated list of key author names, optionally scoped to a stream.
    """
    if stream_id:
        q = text("SELECT name FROM key_authors WHERE stream_id = :sid ORDER BY name")
        result = await db.execute(q, {"sid": stream_id})
    else:
        result = await db.execute(text("SELECT name FROM key_authors ORDER BY name"))
    return [row[0] for row in result.fetchall()]


async def search_key_author_articles(
    db: AsyncSession,
    author: Optional[str] = None,
    query: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    max_results: int = 20,
    stream_id: Optional[int] = None,
) -> tuple[List[CanonicalResearchArticle], int]:
    """
    Search PubMed live for articles by key authors.

    Args:
        author: Specific key author to search (e.g. 'Carbone M').
                If omitted, searches all key authors.
        query: Additional search terms to combine with author (e.g. 'mesothelioma').
        start_date: Start date filter (YYYY/MM/DD). Defaults to 1 year ago.
        end_date: End date filter (YYYY/MM/DD). Defaults to today.
        max_results: Maximum articles to return per author (default 20).

    Returns:
        Tuple of (articles, total_count)
    """
    from services.pubmed_service import PubMedService

    # Get author(s) to search
    if author:
        authors_to_search = [author]
    else:
        authors_to_search = await get_key_authors_list(db, stream_id=stream_id)
        if not authors_to_search:
            return [], 0

    # Default date range: last year
    if not start_date:
        one_year_ago = datetime.now() - timedelta(days=365)
        start_date = one_year_ago.strftime("%Y/%m/%d")
    if not end_date:
        end_date = datetime.now().strftime("%Y/%m/%d")

    service = PubMedService()
    all_articles: List[CanonicalResearchArticle] = []
    seen_pmids: set[str] = set()
    total_count = 0

    for auth in authors_to_search:
        # Build PubMed query
        pubmed_query = f"{auth}[Author]"
        if query:
            pubmed_query = f"({pubmed_query}) AND ({query})"

        try:
            articles, metadata = await service.search_articles(
                query=pubmed_query,
                max_results=max_results,
                start_date=start_date,
                end_date=end_date,
                date_type="pdat",
                sort_by="date",
            )
            total_count += metadata.get("total_results", len(articles))

            for article in articles:
                pmid = article.pmid or article.id
                if pmid and pmid not in seen_pmids:
                    seen_pmids.add(pmid)
                    all_articles.append(article)
        except Exception as e:
            logger.warning(f"PubMed search failed for author {auth}: {e}")

    # Sort newest first
    all_articles.sort(
        key=lambda a: (a.pub_year or 0, a.pub_month or 0, a.pub_day or 0),
        reverse=True,
    )

    return all_articles, total_count


async def cross_reference_key_authors(
    db: AsyncSession,
    articles: List[CanonicalResearchArticle],
    total_results: int,
    stream_id: Optional[int] = None,
) -> str:
    """
    Check a list of articles for key author overlap and return a note for the LLM.

    Args:
        articles: The articles that were actually fetched and can be checked.
        total_results: The total number of results the search matched (may be larger than len(articles)).
        stream_id: Scope key authors to a specific stream.

    Returns empty string if no key authors configured for this stream.
    """
    key_authors = await get_key_authors_list(db, stream_id=stream_id)
    if not key_authors:
        return ""

    checked_count = len(articles)
    unchecked_count = max(0, total_results - checked_count)

    key_author_set = set(key_authors)
    matches = []
    for article in articles:
        if article.authors:
            found = [a for a in article.authors if a in key_author_set]
            if found:
                matches.append(f"- PMID {article.pmid}: {', '.join(found)}")

    lines = []

    if matches:
        lines.append("\n\n**Key author articles found in results:**")
        lines.extend(matches)
        lines.append("Highlight these to the user — they are recognized experts tracked by the platform.")
    else:
        lines.append(f"\n\nNo key author articles found in the {checked_count} results examined.")

    if unchecked_count > 0:
        lines.append(f"Note: {unchecked_count} additional results were not checked for key author overlap.")

    return "\n".join(lines)
