"""
Articles API endpoints - fetches from local database and PubMed

ARTICLE TEXT ACCESS ENDPOINTS:
==============================
1. GET /{pmid} - Get article metadata + abstract from local database
2. GET /{pmid}/full-text - Get full text (checks DB first, then PMC, then returns links as fallback)
3. GET /{pmid}/full-text-links - Get publisher links (LinkOut) for accessing full text

The /full-text endpoint follows this priority:
1. Check if full_text is stored in our database (from pipeline)
2. If not, check if article has PMC ID and fetch from PubMed Central
3. If no PMC available, return publisher links as fallback
"""

import logging
from datetime import date, timedelta
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from models import (
    User, Article, Report, ReportArticleAssociation,
    ResearchStream, Collection, CollectionArticle,
)
from schemas.canonical_types import CanonicalResearchArticle
from schemas.explorer import ExplorerSearchResponse, ExplorerArticle, ExplorerArticleSource, PubMedPagination
from services.article_service import ArticleService, get_article_service
from services.pubmed_service import get_full_text_links, PubMedService
from routers.auth import get_current_user
from database import get_async_db
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/articles", tags=["articles"])


class FullTextLink(BaseModel):
    provider: str
    url: str
    categories: List[str]
    is_free: bool


class FullTextLinksResponse(BaseModel):
    pmid: str
    links: List[FullTextLink]


class FullTextContentResponse(BaseModel):
    """Response for full text endpoint.

    Returns one of:
    - full_text: Article text (from database or PMC)
    - links: Publisher links as fallback when full text unavailable
    - error: Error message if retrieval failed
    """
    pmid: str
    pmc_id: str | None = None
    full_text: str | None = None
    source: str | None = None  # 'database', 'pmc', or None
    links: List[FullTextLink] | None = None  # Fallback when no full text
    error: str | None = None


def _article_to_dict(a) -> dict:
    """Convert an Article ORM model to a simple dict for API responses."""
    return {
        "article_id": a.article_id,
        "title": a.title,
        "authors": a.authors or [],
        "journal": a.journal,
        "pmid": a.pmid,
        "doi": a.doi,
        "abstract": a.abstract,
        "url": a.url,
        "pub_year": a.pub_year,
        "pub_month": a.pub_month,
        "pub_day": a.pub_day,
    }


@router.get("/explorer-search", response_model=ExplorerSearchResponse)
async def explorer_search(
    q: str,
    stream_ids: str = "",
    collection_ids: str = "",
    include_streams: bool = False,
    include_collections: bool = False,
    include_pubmed: bool = False,
    limit: int = 50,
    pubmed_limit: int = 20,
    pubmed_offset: int = 0,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Unified search across streams, collections, and optionally PubMed.

    Searches article title and abstract. Results include provenance info
    showing which streams/collections each article was found in.

    PubMed has separate pagination (pubmed_offset/pubmed_limit) since it
    can return thousands of results. Local results are returned in full
    up to `limit`.
    """
    q = q.strip()
    if not q:
        return ExplorerSearchResponse(articles=[], total=0, sources_searched=[])

    sources_searched: List[str] = []
    # Map article_id -> ExplorerArticle (for local dedup and source merging)
    local_map: Dict[int, ExplorerArticle] = {}

    parsed_stream_ids = [int(s) for s in stream_ids.split(",") if s.strip().isdigit()] if stream_ids.strip() else []
    parsed_collection_ids = [int(s) for s in collection_ids.split(",") if s.strip().isdigit()] if collection_ids.strip() else []

    like_pattern = f"%{q}%"

    # --- Stream search ---
    if include_streams:
        sources_searched.append("streams")
        base_stmt = (
            select(Article, Report.report_name, ResearchStream.stream_id, ResearchStream.stream_name)
            .join(ReportArticleAssociation, Article.article_id == ReportArticleAssociation.article_id)
            .join(Report, Report.report_id == ReportArticleAssociation.report_id)
            .join(ResearchStream, ResearchStream.stream_id == Report.research_stream_id)
        )
        conditions = [or_(Article.title.ilike(like_pattern), Article.abstract.ilike(like_pattern))]
        if parsed_stream_ids:
            conditions.append(Report.research_stream_id.in_(parsed_stream_ids))
        stmt = base_stmt.where(and_(*conditions)).limit(limit)

        result = await db.execute(stmt)
        for article, report_name, sid, sname in result.all():
            source = ExplorerArticleSource(type="stream", id=sid, name=sname, report_name=report_name)
            if article.article_id in local_map:
                local_map[article.article_id].sources.append(source)
            else:
                local_map[article.article_id] = ExplorerArticle(
                    article_id=article.article_id,
                    title=article.title,
                    authors=article.authors or [],
                    journal=article.journal,
                    pmid=article.pmid,
                    doi=article.doi,
                    abstract=article.abstract,
                    url=article.url,
                    pub_year=article.pub_year,
                    pub_month=article.pub_month,
                    pub_day=article.pub_day,
                    sources=[source],
                    is_local=True,
                )

    # --- Collection search ---
    if include_collections:
        sources_searched.append("collections")
        base_stmt = (
            select(Article, Collection.collection_id, Collection.name)
            .join(CollectionArticle, Article.article_id == CollectionArticle.article_id)
            .join(Collection, Collection.collection_id == CollectionArticle.collection_id)
        )
        conditions = [or_(Article.title.ilike(like_pattern), Article.abstract.ilike(like_pattern))]
        if parsed_collection_ids:
            conditions.append(CollectionArticle.collection_id.in_(parsed_collection_ids))
        stmt = base_stmt.where(and_(*conditions)).limit(limit)

        result = await db.execute(stmt)
        for article, cid, cname in result.all():
            source = ExplorerArticleSource(type="collection", id=cid, name=cname)
            if article.article_id in local_map:
                local_map[article.article_id].sources.append(source)
            else:
                local_map[article.article_id] = ExplorerArticle(
                    article_id=article.article_id,
                    title=article.title,
                    authors=article.authors or [],
                    journal=article.journal,
                    pmid=article.pmid,
                    doi=article.doi,
                    abstract=article.abstract,
                    url=article.url,
                    pub_year=article.pub_year,
                    pub_month=article.pub_month,
                    pub_day=article.pub_day,
                    sources=[source],
                    is_local=True,
                )

    # --- PubMed search (optional, with pagination) ---
    pubmed_articles: List[ExplorerArticle] = []
    pubmed_pagination: PubMedPagination | None = None

    if include_pubmed:
        sources_searched.append("pubmed")
        try:
            pubmed_svc = PubMedService()

            end_date = date.today().strftime("%Y-%m-%d")
            start_date = (date.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")

            pm_results, pm_meta = await pubmed_svc.search_articles(
                query=q,
                max_results=pubmed_limit,
                offset=pubmed_offset,
                start_date=start_date,
                end_date=end_date,
                date_type="publication",
            )

            pm_total = pm_meta.get("total_results", 0)
            pm_returned = pm_meta.get("returned", 0)

            # Build a set of PMIDs already in local results for dedup
            local_pmids = {ea.pmid for ea in local_map.values() if ea.pmid}
            overlap_count = 0

            for pm in pm_results:
                if pm.pmid and pm.pmid in local_pmids:
                    # Article already in local results -- just add PubMed source tag
                    overlap_count += 1
                    for ea in local_map.values():
                        if ea.pmid == pm.pmid:
                            ea.sources.append(ExplorerArticleSource(type="pubmed", name="PubMed"))
                            break
                    continue

                pubmed_articles.append(ExplorerArticle(
                    article_id=None,
                    title=pm.title,
                    authors=pm.authors or [],
                    journal=pm.journal,
                    pmid=pm.pmid,
                    doi=pm.doi,
                    abstract=pm.abstract,
                    url=pm.url,
                    pub_year=pm.pub_year,
                    pub_month=pm.pub_month,
                    pub_day=pm.pub_day,
                    sources=[ExplorerArticleSource(type="pubmed", name="PubMed")],
                    is_local=False,
                ))

            pubmed_pagination = PubMedPagination(
                total=pm_total,
                offset=pubmed_offset,
                returned=len(pubmed_articles),
                overlap_count=overlap_count,
                has_more=(pubmed_offset + pubmed_limit) < pm_total,
            )

        except Exception as e:
            logger.error(f"PubMed search failed (non-fatal): {e}", exc_info=True)
            pubmed_pagination = PubMedPagination(total=0, offset=0, returned=0, has_more=False)

    # Combine results: local first, then PubMed-only
    local_articles = list(local_map.values())
    all_articles = local_articles + pubmed_articles

    return ExplorerSearchResponse(
        articles=all_articles,
        total=len(all_articles),
        sources_searched=sources_searched,
        local_count=len(local_articles),
        pubmed=pubmed_pagination,
    )


class BulkPmidRequest(BaseModel):
    pmids: List[str]


class BulkPmidResult(BaseModel):
    found: List[dict]       # articles successfully resolved
    not_found: List[str]    # PMIDs that couldn't be found/imported


@router.post("/bulk-resolve-pmids", response_model=BulkPmidResult)
async def bulk_resolve_pmids(
    data: BulkPmidRequest,
    service: ArticleService = Depends(get_article_service),
    current_user: User = Depends(get_current_user),
):
    """
    Resolve a list of PMIDs to article_ids. For each PMID:
    - If it exists in the local DB, return it.
    - If not, fetch from PubMed and create it, then return it.
    - If PubMed doesn't have it either, add to not_found list.
    """
    found = []
    not_found = []

    for raw_pmid in data.pmids:
        pmid = raw_pmid.strip()
        if not pmid:
            continue
        try:
            article = await service.find_by_pmid(pmid)
            if not article:
                article = await service.find_or_create_from_pubmed(pmid)
            if article:
                found.append(_article_to_dict(article))
            else:
                not_found.append(pmid)
        except Exception as e:
            logger.error(f"Failed to resolve PMID {pmid}: {e}")
            not_found.append(pmid)

    return BulkPmidResult(found=found, not_found=not_found)


@router.get("/db-search")
async def search_articles_db(
    q: str = "",
    pmid: str = "",
    limit: int = 20,
    service: ArticleService = Depends(get_article_service),
    current_user: User = Depends(get_current_user)
):
    """
    Search articles by keyword or PMID.

    For PMID lookups: checks local DB first, then fetches from PubMed if not found
    and creates the article in our DB so it can be added to collections.

    For keyword searches: searches local DB by title.
    """
    query = pmid or q
    if not query.strip():
        return {"articles": []}

    try:
        # PMID lookup: try DB first, then PubMed
        if pmid:
            pmid_clean = pmid.strip()
            article = await service.find_by_pmid(pmid_clean)

            if not article:
                # Not in our DB — fetch from PubMed and create it
                article = await service.find_or_create_from_pubmed(pmid_clean)

            if article:
                return _article_to_dict(article)
            else:
                return {"error": "Article not found in PubMed"}

        # Keyword search: local DB only
        articles = await service.search(query.strip(), limit=limit)
        return {"articles": [_article_to_dict(a) for a in articles]}

    except Exception as e:
        logger.error(f"Error searching articles: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/{pmid}", response_model=CanonicalResearchArticle)
async def get_article_by_pmid(
    pmid: str,
    service: ArticleService = Depends(get_article_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get an article by its PMID from the local database.
    This fetches from our stored articles, not from PubMed directly.
    """
    try:
        return await service.get_article_by_pmid(pmid)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error fetching article {pmid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching article: {str(e)}"
        )


@router.get("/{pmid}/full-text-links", response_model=FullTextLinksResponse)
async def get_article_full_text_links(
    pmid: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get full text link options for an article from PubMed's LinkOut system.

    This fetches live data from PubMed's ELink API and returns URLs to publisher
    websites where the full text may be available. Links are categorized as:
    - is_free=True: Open access, no subscription required
    - is_free=False: May require subscription or purchase

    Use this as a fallback when the article is not in PubMed Central.
    """
    try:
        links = await get_full_text_links(pmid)
        return FullTextLinksResponse(pmid=pmid, links=links)
    except Exception as e:
        logger.error(f"Error fetching full text links for {pmid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching full text links: {str(e)}"
        )


@router.get("/{pmid}/full-text", response_model=FullTextContentResponse)
async def get_article_full_text(
    pmid: str,
    article_service: ArticleService = Depends(get_article_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get the full text content of an article.

    Checks sources in order of priority:
    1. Database - If we have full_text stored from pipeline
    2. PubMed Central - If article has a PMC ID
    3. Publisher links - As fallback when full text unavailable

    Returns:
    - full_text + source='database': Text from our database
    - full_text + source='pmc': Text fetched from PubMed Central
    - links: Publisher URLs when no full text available
    - error: Message if all retrieval methods failed
    """
    try:
        # 1. Check database first - do we have full_text stored?
        db_article = await article_service.find_by_pmid(pmid)
        if db_article and db_article.full_text:
            logger.info(f"Returning stored full text for PMID {pmid}")
            return FullTextContentResponse(
                pmid=pmid,
                pmc_id=None,  # We don't track PMC ID in Article model currently
                full_text=db_article.full_text,
                source="database"
            )

        # 2. Check PubMed Central - fetch article to get PMC ID
        pubmed_service = PubMedService()
        articles = await pubmed_service.get_articles_from_ids([pmid])

        if not articles:
            return FullTextContentResponse(
                pmid=pmid,
                error="Article not found in PubMed"
            )

        article = articles[0]

        # If article has PMC ID, try to fetch full text from PMC
        if article.pmc_id:
            full_text = await pubmed_service.get_pmc_full_text(article.pmc_id)
            if full_text:
                logger.info(f"Returning PMC full text for PMID {pmid} (PMC {article.pmc_id})")
                return FullTextContentResponse(
                    pmid=pmid,
                    pmc_id=article.pmc_id,
                    full_text=full_text,
                    source="pmc"
                )
            else:
                logger.warning(f"PMC fetch failed for PMID {pmid} (PMC {article.pmc_id})")

        # 3. Fallback - get publisher links
        logger.info(f"No full text available for PMID {pmid}, fetching links")
        try:
            links = await get_full_text_links(pmid)
            if links:
                return FullTextContentResponse(
                    pmid=pmid,
                    pmc_id=article.pmc_id,  # Include PMC ID if we have it (even if fetch failed)
                    links=links,
                    error="Full text not available in PubMed Central. Publisher links provided."
                )
        except Exception as link_err:
            logger.warning(f"Failed to fetch links for PMID {pmid}: {link_err}")

        # No full text and no links available
        return FullTextContentResponse(
            pmid=pmid,
            pmc_id=article.pmc_id,
            error="Full text not available. Article is not in PubMed Central and no publisher links found."
        )

    except Exception as e:
        logger.error(f"Error fetching full text for {pmid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching full text: {str(e)}"
        )
