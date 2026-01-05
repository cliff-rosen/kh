"""
Tools API endpoints - Standalone utilities for testing and analysis
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from database import get_db
from models import User
from routers.auth import get_current_user
from schemas.canonical_types import CanonicalResearchArticle, CanonicalClinicalTrial

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools", tags=["tools"])


# ============================================================================
# PubMed Query Tester
# ============================================================================

class PubMedQueryTestRequest(BaseModel):
    """Request to test a PubMed query"""
    query_expression: str = Field(..., description="PubMed query expression to test")
    max_results: int = Field(100, ge=1, le=1000, description="Maximum articles to return")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[str] = Field('entry', description="Date type for filtering (entry, publication, etc.)")
    sort_by: Optional[str] = Field('relevance', description="Sort order (relevance, date)")


class PubMedQueryTestResponse(BaseModel):
    """Response from PubMed query test"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles returned")
    total_results: int = Field(..., description="Total number of results matching the query")
    returned_count: int = Field(..., description="Number of articles returned in this response")


class PubMedSearchRequest(BaseModel):
    """Request for optimized PubMed search (returns PMIDs + first N articles)"""
    query_expression: str = Field(..., description="PubMed query expression")
    max_pmids: int = Field(500, ge=1, le=1000, description="Maximum PMIDs to retrieve for comparison")
    articles_to_fetch: int = Field(20, ge=1, le=500, description="Number of articles to fetch with full data")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[str] = Field('publication', description="Date type for filtering")
    sort_by: Optional[str] = Field('relevance', description="Sort order (relevance, date)")


class PubMedSearchResponse(BaseModel):
    """Response with PMIDs for comparison + articles for display"""
    all_pmids: List[str] = Field(..., description="All PMIDs matching query (up to max_pmids)")
    articles: List[CanonicalResearchArticle] = Field(..., description="Full article data for first N")
    total_results: int = Field(..., description="Total number of results matching the query")
    pmids_retrieved: int = Field(..., description="Number of PMIDs retrieved")
    articles_retrieved: int = Field(..., description="Number of articles with full data")


class PubMedIdCheckRequest(BaseModel):
    """Request to check which PubMed IDs are captured by a query"""
    query_expression: str = Field(..., description="PubMed query expression to test")
    pubmed_ids: List[str] = Field(..., description="List of PubMed IDs to check")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[str] = Field('publication', description="Date type for filtering (publication=DP [default/matches pipeline], entry=EDAT, pubmed=PDAT, completion=DCOM)")


class PubMedIdCheckResult(BaseModel):
    """Result for a single PubMed ID check"""
    pubmed_id: str
    captured: bool  # Whether this ID was in the query results
    article: Optional[CanonicalResearchArticle] = None  # Article data if found


class PubMedIdCheckResponse(BaseModel):
    """Response from PubMed ID check"""
    total_ids: int = Field(..., description="Total number of IDs checked")
    captured_count: int = Field(..., description="Number of IDs captured by query")
    missed_count: int = Field(..., description="Number of IDs missed by query")
    results: List[PubMedIdCheckResult] = Field(..., description="Results for each ID")
    query_total_results: int = Field(..., description="Total results from query")


@router.post("/pubmed/test-query", response_model=PubMedQueryTestResponse)
async def test_pubmed_query(
    request: PubMedQueryTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test a PubMed query and return results.

    Standalone tool for testing PubMed queries without requiring a research stream.
    """
    from services.pubmed_service import PubMedService

    try:
        # Use dates as provided (None means no date filtering)
        start_date = request.start_date
        end_date = request.end_date

        # Execute query
        pubmed_service = PubMedService()
        articles, metadata = pubmed_service.search_articles(
            query=request.query_expression,
            max_results=request.max_results,
            offset=0,
            start_date=start_date,
            end_date=end_date,
            date_type=request.date_type,
            sort_by=request.sort_by
        )

        return PubMedQueryTestResponse(
            articles=articles,
            total_results=metadata.get("total_results", len(articles)),
            returned_count=len(articles)
        )

    except Exception as e:
        logger.error(f"PubMed query test failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PubMed query test failed: {str(e)}"
        )


@router.post("/pubmed/search", response_model=PubMedSearchResponse)
async def search_pubmed(
    request: PubMedSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Optimized PubMed search that returns:
    - Up to max_pmids PMIDs for comparison (fast)
    - Full article data for first articles_to_fetch articles (for display)

    This enables efficient comparison of search results while keeping
    the initial display fast.
    """
    from services.pubmed_service import PubMedService
    from schemas.canonical_types import CanonicalPubMedArticle
    from schemas.research_article_converters import pubmed_to_research_article

    try:
        pubmed_service = PubMedService()

        # Step 1: Get all PMIDs (fast - no article data)
        all_pmids, total_count = pubmed_service.get_article_ids(
            query=request.query_expression,
            max_results=request.max_pmids,
            sort_by=request.sort_by,
            start_date=request.start_date,
            end_date=request.end_date,
            date_type=request.date_type
        )

        logger.info(f"Retrieved {len(all_pmids)} PMIDs from {total_count} total results")

        # Step 2: Fetch full article data for first N PMIDs
        articles = []
        if all_pmids:
            pmids_to_fetch = all_pmids[:request.articles_to_fetch]
            raw_articles = pubmed_service.get_articles_from_ids(pmids_to_fetch)

            # Convert to canonical format
            for article in raw_articles:
                try:
                    canonical_pubmed = CanonicalPubMedArticle(
                        pmid=article.PMID,
                        title=article.title or "[No title available]",
                        abstract=article.abstract or "[No abstract available]",
                        authors=article.authors.split(', ') if article.authors else [],
                        journal=article.journal or "[Unknown journal]",
                        publication_date=article.pub_date if article.pub_date else None,
                        keywords=[],
                        mesh_terms=[],
                        metadata={
                            "volume": article.volume,
                            "issue": article.issue,
                            "pages": article.pages,
                        }
                    )
                    research_article = pubmed_to_research_article(canonical_pubmed)
                    articles.append(research_article)
                except Exception as e:
                    logger.error(f"Error converting article {article.PMID}: {e}")

        return PubMedSearchResponse(
            all_pmids=all_pmids,
            articles=articles,
            total_results=total_count,
            pmids_retrieved=len(all_pmids),
            articles_retrieved=len(articles)
        )

    except Exception as e:
        logger.error(f"PubMed search failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PubMed search failed: {str(e)}"
        )


@router.post("/pubmed/check-ids", response_model=PubMedIdCheckResponse)
async def check_pubmed_ids(
    request: PubMedIdCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Check which PubMed IDs from a list are captured by a query.

    This tool runs a query and checks which of the provided PubMed IDs
    appear in the results, helping validate query coverage.

    This is optimized for speed: it only fetches article IDs from the query
    (very fast), then fetches full metadata only for the captured IDs.
    """
    from services.pubmed_service import PubMedService
    from schemas.canonical_types import CanonicalPubMedArticle
    from schemas.research_article_converters import pubmed_to_research_article

    try:
        # Apply default date range if not provided
        start_date = request.start_date
        end_date = request.end_date

        if not start_date or not end_date:
            end_date_obj = datetime.now()
            start_date_obj = end_date_obj - timedelta(days=365)  # 1 year for ID checking
            start_date = start_date_obj.strftime("%Y/%m/%d")
            end_date = end_date_obj.strftime("%Y/%m/%d")

        # FAST: Get just the IDs from the query (no article fetching)
        pubmed_service = PubMedService()
        logger.info(f"Fetching IDs for query with date_type={request.date_type}: {request.query_expression}")

        # Use same max_results as pipeline to ensure consistency
        pmids_from_query, total_count = pubmed_service.get_article_ids(
            query=request.query_expression,
            max_results=500,  # Match pipeline's MAX_ARTICLES_PER_SOURCE
            sort_by='relevance',
            start_date=start_date,
            end_date=end_date,
            date_type=request.date_type
        )

        # Build set of captured PubMed IDs
        captured_pmids_set = set(pmids_from_query)
        logger.info(f"Query returned {total_count} total results, got {len(pmids_from_query)} IDs")

        # Determine which user IDs were captured
        user_pmids_clean = [pmid.strip() for pmid in request.pubmed_ids]
        captured_user_pmids = [pmid for pmid in user_pmids_clean if pmid in captured_pmids_set]

        logger.info(f"User provided {len(user_pmids_clean)} IDs, {len(captured_user_pmids)} were captured")

        # SLOW: Fetch full article metadata ONLY for captured IDs
        article_lookup = {}
        if captured_user_pmids:
            logger.info(f"Fetching full article data for {len(captured_user_pmids)} captured IDs")
            articles = pubmed_service.get_articles_from_ids(captured_user_pmids)

            # Convert to canonical format and build lookup
            for article in articles:
                try:
                    canonical_pubmed = CanonicalPubMedArticle(
                        pmid=article.PMID,
                        title=article.title or "[No title available]",
                        abstract=article.abstract or "[No abstract available]",
                        authors=article.authors.split(', ') if article.authors else [],
                        journal=article.journal or "[Unknown journal]",
                        publication_date=article.pub_date if article.pub_date else None,
                        keywords=[],
                        mesh_terms=[],
                        metadata={
                            "volume": article.volume,
                            "issue": article.issue,
                            "pages": article.pages,
                        }
                    )
                    research_article = pubmed_to_research_article(canonical_pubmed)
                    article_lookup[article.PMID] = research_article
                except Exception as e:
                    logger.error(f"Error converting article {article.PMID}: {e}")

        # Build results for each user-provided ID
        results = []
        for pmid_clean in user_pmids_clean:
            is_captured = pmid_clean in captured_pmids_set

            result = PubMedIdCheckResult(
                pubmed_id=pmid_clean,
                captured=is_captured,
                article=article_lookup.get(pmid_clean) if is_captured else None
            )
            results.append(result)

        captured_count = sum(1 for r in results if r.captured)

        return PubMedIdCheckResponse(
            total_ids=len(request.pubmed_ids),
            captured_count=captured_count,
            missed_count=len(request.pubmed_ids) - captured_count,
            results=results,
            query_total_results=total_count
        )

    except Exception as e:
        logger.error(f"PubMed ID check failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PubMed ID check failed: {str(e)}"
        )


# ============================================================================
# Clinical Trials Search (ClinicalTrials.gov)
# ============================================================================

from schemas.canonical_types import CanonicalClinicalTrial


class TrialSearchRequest(BaseModel):
    """Request for clinical trial search"""
    condition: Optional[str] = Field(None, description="Disease or condition to search for")
    intervention: Optional[str] = Field(None, description="Drug, treatment, or intervention name")
    sponsor: Optional[str] = Field(None, description="Sponsor organization name")
    status: Optional[List[str]] = Field(None, description="Recruitment statuses (RECRUITING, COMPLETED, etc.)")
    phase: Optional[List[str]] = Field(None, description="Study phases (PHASE1, PHASE2, PHASE3, etc.)")
    study_type: Optional[str] = Field(None, description="Study type (INTERVENTIONAL, OBSERVATIONAL)")
    location: Optional[str] = Field(None, description="Country or location")
    start_date: Optional[str] = Field(None, description="Start date filter (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="End date filter (YYYY-MM-DD)")
    max_results: int = Field(100, ge=1, le=500, description="Maximum trials to return")


class TrialSearchResponse(BaseModel):
    """Response from clinical trial search"""
    trials: List[CanonicalClinicalTrial] = Field(..., description="Trials returned")
    total_results: int = Field(..., description="Total number of results matching the query")
    returned_count: int = Field(..., description="Number of trials returned in this response")


@router.post("/trials/search", response_model=TrialSearchResponse)
async def search_clinical_trials(
    request: TrialSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Search ClinicalTrials.gov for clinical trials.

    Standalone tool for searching clinical trials with filters for condition,
    intervention, sponsor, phase, status, and more.
    """
    from services.clinical_trials_service import get_clinical_trials_service

    try:
        service = get_clinical_trials_service()

        # Fetch trials (may need multiple pages for large result sets)
        all_trials = []
        total_count = 0
        page_token = None
        remaining = request.max_results

        while remaining > 0:
            trials, total_count, next_token = service.search_trials(
                condition=request.condition,
                intervention=request.intervention,
                sponsor=request.sponsor,
                status=request.status,
                phase=request.phase,
                study_type=request.study_type,
                location=request.location,
                start_date=request.start_date,
                end_date=request.end_date,
                max_results=min(remaining, 100),
                page_token=page_token
            )

            all_trials.extend(trials)
            remaining -= len(trials)

            # Stop if no more pages or we have enough
            if not next_token or len(trials) == 0:
                break
            page_token = next_token

        logger.info(f"Retrieved {len(all_trials)} trials from {total_count} total matches")

        return TrialSearchResponse(
            trials=all_trials,
            total_results=total_count,
            returned_count=len(all_trials)
        )

    except Exception as e:
        logger.error(f"Clinical trials search failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clinical trials search failed: {str(e)}"
        )


class TrialDetailRequest(BaseModel):
    """Request for trial details by NCT ID"""
    nct_id: str = Field(..., description="NCT identifier (e.g., NCT00000000)")


@router.post("/trials/detail")
async def get_trial_detail(
    request: TrialDetailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get detailed information about a specific clinical trial.
    """
    from services.clinical_trials_service import get_clinical_trials_service

    try:
        service = get_clinical_trials_service()
        trial = service.get_trial_by_nct_id(request.nct_id)

        if not trial:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Trial {request.nct_id} not found"
            )

        return trial

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get trial {request.nct_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get trial details: {str(e)}"
        )


# ============================================================================
# Clinical Trials Filter (AI Column Support)
# ============================================================================

class TrialFilterRequest(BaseModel):
    """Request to filter clinical trials using AI"""
    trials: List[CanonicalClinicalTrial] = Field(..., description="Trials to filter")
    filter_criteria: str = Field(..., description="Natural language filter criteria")
    threshold: float = Field(0.5, ge=0.0, le=1.0, description="Minimum score to pass")
    output_type: str = Field("boolean", description="Expected output type: 'boolean' (yes/no), 'number' (score), or 'text' (classification)")


class TrialFilterResult(BaseModel):
    """Result for a single trial filter evaluation"""
    nct_id: str
    passed: bool
    score: float
    reasoning: str


class TrialFilterResponse(BaseModel):
    """Response from trial filter"""
    results: List[TrialFilterResult]
    count: int
    passed: int
    failed: int


@router.post("/trials/filter", response_model=TrialFilterResponse)
async def filter_clinical_trials(
    request: TrialFilterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Apply semantic AI filtering to clinical trials.

    Used by TrialScout to power AI columns that analyze trial data
    based on natural language criteria.
    """
    from services.semantic_filter_service import SemanticFilterService

    try:
        filter_service = SemanticFilterService()

        # Adapt trials to have the attributes the filter service expects
        # The filter service looks for 'title' and 'abstract' attributes
        # Also expose trial-specific fields for template slug replacement
        class TrialAdapter:
            def __init__(self, trial: CanonicalClinicalTrial):
                self.trial = trial
                self.title = trial.title or trial.brief_title or ""

                # Combine relevant trial info into "abstract" for simple criteria evaluation
                abstract_parts = []
                if trial.brief_summary:
                    abstract_parts.append(trial.brief_summary)
                if trial.conditions:
                    abstract_parts.append(f"Conditions: {', '.join(trial.conditions)}")
                if trial.interventions:
                    interv_names = [i.name for i in trial.interventions]
                    abstract_parts.append(f"Interventions: {', '.join(interv_names)}")
                if trial.phase:
                    abstract_parts.append(f"Phase: {trial.phase}")
                if trial.status:
                    abstract_parts.append(f"Status: {trial.status}")
                if trial.primary_outcomes:
                    outcomes = [o.measure for o in trial.primary_outcomes[:3]]
                    abstract_parts.append(f"Primary Outcomes: {', '.join(outcomes)}")
                self.abstract = "\n".join(abstract_parts)

                # Standard fields expected by filter service
                self.journal = trial.lead_sponsor.name if trial.lead_sponsor else None
                self.year = trial.start_date[:4] if trial.start_date else None

                # Trial-specific fields for template slug replacement like {nct_id}, {phase}, etc.
                self.nct_id = trial.nct_id or ""
                self.conditions = ', '.join(trial.conditions) if trial.conditions else ""
                self.interventions = ', '.join([i.name for i in trial.interventions]) if trial.interventions else ""
                self.phase = trial.phase or ""
                self.status = trial.status or ""
                self.enrollment = str(trial.enrollment) if trial.enrollment else ""
                self.sponsor = trial.lead_sponsor.name if trial.lead_sponsor else ""
                self.brief_summary = trial.brief_summary or ""
                self.study_type = trial.study_type or ""
                self.start_date = trial.start_date or ""
                self.completion_date = trial.completion_date or ""
                self.primary_outcomes = '; '.join([o.measure for o in trial.primary_outcomes]) if trial.primary_outcomes else ""
                self.eligibility_criteria = trial.eligibility_criteria or ""

        adapted_trials = [TrialAdapter(t) for t in request.trials]

        # Use the semantic filter service
        batch_results = await filter_service.evaluate_articles_batch(
            articles=adapted_trials,
            filter_criteria=request.filter_criteria,
            threshold=request.threshold,
            max_concurrent=50,
            output_type=request.output_type
        )

        # Convert results
        results = []
        for adapter, is_relevant, score, reasoning in batch_results:
            results.append(TrialFilterResult(
                nct_id=adapter.trial.nct_id,
                passed=is_relevant,
                score=score,
                reasoning=reasoning
            ))

        passed_count = sum(1 for r in results if r.passed)

        return TrialFilterResponse(
            results=results,
            count=len(results),
            passed=passed_count,
            failed=len(results) - passed_count
        )

    except Exception as e:
        logger.error(f"Trial filter failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Trial filter failed: {str(e)}"
        )
