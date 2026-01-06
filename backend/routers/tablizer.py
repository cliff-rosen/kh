"""
Tablizer API Router

All operations for the Tablizer table workbench, including:
- PubMed article search
- Clinical trials search
- AI column operations (filter for boolean/number, extract for text)

Used by both PubMed Tablizer (/pubmed) and TrialScout (/trialscout) frontends.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from database import get_db
from models import User
from routers.auth import get_current_user
from schemas.canonical_types import CanonicalResearchArticle, CanonicalClinicalTrial

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tablizer", tags=["tablizer"])


# ============================================================================
# PubMed Search
# ============================================================================

class PubMedSearchRequest(BaseModel):
    """Request for PubMed search"""
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


@router.post("/search/pubmed", response_model=PubMedSearchResponse)
async def search_pubmed(
    request: PubMedSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Search PubMed and return PMIDs for comparison + articles for display.

    Optimized for Tablizer: returns up to max_pmids PMIDs (fast) plus
    full article data for the first articles_to_fetch articles.
    """
    from services.pubmed_service import PubMedService
    from schemas.canonical_types import CanonicalPubMedArticle
    from schemas.research_article_converters import pubmed_to_research_article

    try:
        pubmed_service = PubMedService()

        # Get all PMIDs (fast - no article data)
        all_pmids, total_count = pubmed_service.get_article_ids(
            query=request.query_expression,
            max_results=request.max_pmids,
            sort_by=request.sort_by,
            start_date=request.start_date,
            end_date=request.end_date,
            date_type=request.date_type
        )

        logger.info(f"Retrieved {len(all_pmids)} PMIDs from {total_count} total results")

        # Fetch full article data for first N PMIDs
        articles = []
        if all_pmids:
            pmids_to_fetch = all_pmids[:request.articles_to_fetch]
            raw_articles = pubmed_service.get_articles_from_ids(pmids_to_fetch)

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


# ============================================================================
# Clinical Trials Search
# ============================================================================

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


@router.post("/search/trials", response_model=TrialSearchResponse)
async def search_trials(
    request: TrialSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Search ClinicalTrials.gov for clinical trials.
    """
    from services.clinical_trials_service import get_clinical_trials_service

    try:
        service = get_clinical_trials_service()

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


@router.post("/trials/detail", response_model=CanonicalClinicalTrial)
async def get_trial_detail(
    request: TrialDetailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed information about a specific clinical trial."""
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
# AI Column: Filter (Boolean/Number output)
# ============================================================================

class FilterRequest(BaseModel):
    """Request to filter items using AI (for boolean/number AI columns)"""
    items: List[Dict[str, Any]] = Field(..., description="Items to filter (articles or trials)")
    item_type: str = Field("article", description="Type of items: 'article' or 'trial'")
    criteria: str = Field(..., description="Natural language filter criteria")
    threshold: float = Field(0.5, ge=0.0, le=1.0, description="Minimum score to pass")
    output_type: str = Field("boolean", description="Output type: 'boolean' or 'number'")


class FilterResultItem(BaseModel):
    """Result for a single filtered item"""
    id: str = Field(..., description="Item identifier (pmid or nct_id)")
    passed: bool = Field(..., description="Whether item passed the filter")
    score: float = Field(..., description="Relevance score (0.0-1.0)")
    reasoning: str = Field(..., description="Explanation of the score")


class FilterResponse(BaseModel):
    """Response from filter operation"""
    results: List[FilterResultItem] = Field(..., description="Filter results for each item")
    count: int = Field(..., description="Total items processed")
    passed: int = Field(..., description="Number of items that passed")
    failed: int = Field(..., description="Number of items that failed")


@router.post("/filter", response_model=FilterResponse)
async def filter_items(
    request: FilterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Apply AI filtering to items for boolean/number AI columns.

    For boolean output: Returns passed=true/false based on criteria match
    For number output: Returns score representing the evaluation
    """
    from services.semantic_filter_service import SemanticFilterService

    try:
        filter_service = SemanticFilterService()

        # Adapt items based on type
        if request.item_type == "trial":
            adapted_items = [_adapt_trial_for_filter(item) for item in request.items]
            id_field = "nct_id"
        else:
            adapted_items = [_adapt_article_for_filter(item) for item in request.items]
            id_field = "pmid"

        # Run batch evaluation
        batch_results = await filter_service.evaluate_articles_batch(
            articles=adapted_items,
            filter_criteria=request.criteria,
            threshold=request.threshold,
            max_concurrent=50,
            output_type=request.output_type
        )

        # Convert results
        results = []
        for adapter, is_relevant, score, reasoning in batch_results:
            item_id = getattr(adapter, id_field, "") or getattr(adapter, "id", "")
            results.append(FilterResultItem(
                id=item_id,
                passed=is_relevant,
                score=score,
                reasoning=reasoning
            ))

        passed_count = sum(1 for r in results if r.passed)

        return FilterResponse(
            results=results,
            count=len(results),
            passed=passed_count,
            failed=len(results) - passed_count
        )

    except Exception as e:
        logger.error(f"Filter operation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Filter operation failed: {str(e)}"
        )


# ============================================================================
# AI Column: Extract (Text output)
# ============================================================================

class ExtractRequest(BaseModel):
    """Request to extract text from items (for text AI columns)"""
    items: List[Dict[str, Any]] = Field(..., description="Items to extract from (articles or trials)")
    item_type: str = Field("article", description="Type of items: 'article' or 'trial'")
    prompt: str = Field(..., description="What to extract (e.g., 'What is the study design?')")


class ExtractResultItem(BaseModel):
    """Result for a single extraction"""
    id: str = Field(..., description="Item identifier (pmid or nct_id)")
    text_value: str = Field(..., description="Extracted text answer")
    confidence: float = Field(..., description="Confidence score (0.0-1.0)")
    reasoning: str = Field("", description="Brief explanation")


class ExtractResponse(BaseModel):
    """Response from extract operation"""
    results: List[ExtractResultItem] = Field(..., description="Extraction results for each item")
    count: int = Field(..., description="Total items processed")
    succeeded: int = Field(..., description="Number of successful extractions")
    failed: int = Field(..., description="Number of failed extractions")


@router.post("/extract", response_model=ExtractResponse)
async def extract_from_items(
    request: ExtractRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Extract text information from items for text AI columns.

    Uses the extraction service to pull specific information based on the prompt.
    """
    from services.extraction_service import get_extraction_service

    try:
        extraction_service = get_extraction_service()

        # Determine ID field based on item type
        id_field = "nct_id" if request.item_type == "trial" else "pmid"

        # Build extraction schema for text output
        result_schema = {
            "type": "object",
            "properties": {
                "answer": {"type": "string", "description": "The extracted answer"},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "reasoning": {"type": "string", "description": "Brief explanation"}
            },
            "required": ["answer", "confidence"]
        }

        # Build extraction instructions
        extraction_instructions = f"""
        Based on the provided item data, answer the following question:

        {request.prompt}

        Provide:
        1. A direct answer to the question
        2. A confidence score from 0.0 to 1.0
        3. Brief reasoning for your answer
        """

        # Prepare items for extraction
        extraction_items = []
        for item in request.items:
            item_id = item.get(id_field) or item.get("id", "")
            # Spread item first, then override "id" to ensure correct ID is used
            extraction_items.append({
                **item,
                "id": item_id,
            })

        # Run extraction
        extraction_results = await extraction_service.extract_multiple_items(
            items=extraction_items,
            result_schema=result_schema,
            extraction_instructions=extraction_instructions,
            continue_on_error=True
        )

        # Convert results
        results = []
        succeeded = 0
        failed = 0

        for result in extraction_results:
            item_id = result.item_id or ""

            if result.error:
                failed += 1
                results.append(ExtractResultItem(
                    id=item_id,
                    text_value="[Extraction failed]",
                    confidence=0.0,
                    reasoning=result.error
                ))
            else:
                succeeded += 1
                extraction = result.extraction or {}
                results.append(ExtractResultItem(
                    id=item_id,
                    text_value=extraction.get("answer", ""),
                    confidence=extraction.get("confidence", 0.0),
                    reasoning=extraction.get("reasoning", "")
                ))

        return ExtractResponse(
            results=results,
            count=len(results),
            succeeded=succeeded,
            failed=failed
        )

    except Exception as e:
        logger.error(f"Extract operation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extract operation failed: {str(e)}"
        )


# ============================================================================
# Helper Functions
# ============================================================================

class _ArticleAdapter:
    """Adapts article dict for SemanticFilterService"""
    def __init__(self, article: Dict[str, Any]):
        self.id = article.get("id") or article.get("pmid", "")
        self.pmid = article.get("pmid", "")
        self.title = article.get("title", "")
        self.abstract = article.get("abstract", "")
        self.journal = article.get("journal")
        self.year = article.get("publication_date", "")[:4] if article.get("publication_date") else None
        self.authors = article.get("authors", [])
        self.doi = article.get("doi", "")


class _TrialAdapter:
    """Adapts trial dict for SemanticFilterService"""
    def __init__(self, trial: Dict[str, Any]):
        self.nct_id = trial.get("nct_id", "")
        self.id = self.nct_id
        self.title = trial.get("title") or trial.get("brief_title", "")

        # Build abstract from trial fields
        abstract_parts = []
        if trial.get("brief_summary"):
            abstract_parts.append(trial["brief_summary"])
        if trial.get("conditions"):
            conditions = trial["conditions"]
            if isinstance(conditions, list):
                abstract_parts.append(f"Conditions: {', '.join(conditions)}")
        if trial.get("interventions"):
            interventions = trial["interventions"]
            if isinstance(interventions, list):
                interv_names = [i.get("name", "") if isinstance(i, dict) else str(i) for i in interventions]
                abstract_parts.append(f"Interventions: {', '.join(interv_names)}")
        if trial.get("phase"):
            abstract_parts.append(f"Phase: {trial['phase']}")
        if trial.get("status"):
            abstract_parts.append(f"Status: {trial['status']}")

        self.abstract = "\n".join(abstract_parts)

        # Standard fields
        sponsor = trial.get("lead_sponsor")
        self.journal = sponsor.get("name") if isinstance(sponsor, dict) else None
        self.year = trial.get("start_date", "")[:4] if trial.get("start_date") else None

        # Trial-specific fields for template replacement
        self.conditions = ', '.join(trial.get("conditions", [])) if isinstance(trial.get("conditions"), list) else ""
        self.phase = trial.get("phase", "")
        self.status = trial.get("status", "")
        self.sponsor = sponsor.get("name") if isinstance(sponsor, dict) else ""
        self.brief_summary = trial.get("brief_summary", "")
        self.study_type = trial.get("study_type", "")


def _adapt_article_for_filter(article: Dict[str, Any]) -> _ArticleAdapter:
    return _ArticleAdapter(article)


def _adapt_trial_for_filter(trial: Dict[str, Any]) -> _TrialAdapter:
    return _TrialAdapter(trial)
