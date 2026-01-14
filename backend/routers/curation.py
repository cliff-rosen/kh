"""
Curation router - Human review and approval workflow for pipeline outputs

This router handles:
- Viewing pipeline output for curation (getCurationView)
- Including/excluding articles
- Editing report content (title, summaries)
- Approval workflow (approve, reject)
- Curation history/audit trail

All endpoints are under /api/operations/reports/{report_id}/...
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dataclasses import asdict
import logging

from database import get_db
from models import User, UserRole
from services import auth_service
from services.report_service import ReportService
from services.wip_article_service import WipArticleService
from services.email_service import EmailService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/operations/reports", tags=["curation"])


def get_current_user(
    current_user: User = Depends(auth_service.validate_token)
) -> User:
    """Dependency to get the current authenticated user."""
    return current_user


# ==================== Request/Response Models ====================

class UpdateReportContentRequest(BaseModel):
    """Request to update report content (name, summaries)"""
    report_name: Optional[str] = None
    executive_summary: Optional[str] = None
    category_summaries: Optional[Dict[str, str]] = None


class ExcludeArticleRequest(BaseModel):
    """Request to exclude an article from the report"""
    notes: Optional[str] = None


class IncludeArticleRequest(BaseModel):
    """Request to include a filtered article in the report"""
    wip_article_id: int
    category: Optional[str] = None
    notes: Optional[str] = None


class UpdateArticleRequest(BaseModel):
    """Request to update an article within the report (ranking, category, AI summary)"""
    ranking: Optional[int] = None
    category: Optional[str] = None
    ai_summary: Optional[str] = None


class ApproveReportRequest(BaseModel):
    """Request to approve a report"""
    notes: Optional[str] = None


class RejectReportRequest(BaseModel):
    """Request to reject a report"""
    reason: str


class ApprovalRequestRequest(BaseModel):
    """Request to send approval request to an admin"""
    admin_user_id: int


class UpdateWipArticleNotesRequest(BaseModel):
    """Request to update curation notes on a WipArticle"""
    curation_notes: str


# --- Curation View Response Schemas ---

class CurationReportData(BaseModel):
    """Report content data for curation view"""
    report_id: int
    report_name: str
    original_report_name: Optional[str] = None
    report_date: Optional[str] = None
    approval_status: Optional[str] = None
    executive_summary: str = ""
    original_executive_summary: str = ""
    category_summaries: Dict[str, str] = {}
    original_category_summaries: Dict[str, str] = {}
    has_curation_edits: bool = False
    last_curated_by: Optional[int] = None
    last_curated_at: Optional[str] = None


class CurationIncludedArticle(BaseModel):
    """Included article data (from Article + ReportArticleAssociation)"""
    article_id: int
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: str
    authors: Optional[List[str]] = None
    journal: Optional[str] = None
    year: Optional[int] = None
    abstract: Optional[str] = None
    url: Optional[str] = None
    # Association data
    ranking: Optional[int] = None
    original_ranking: Optional[int] = None
    presentation_categories: List[str] = []
    original_presentation_categories: List[str] = []
    ai_summary: Optional[str] = None
    original_ai_summary: Optional[str] = None
    relevance_score: Optional[float] = None
    curation_notes: Optional[str] = None
    curated_by: Optional[int] = None
    curated_at: Optional[str] = None
    # Source indicator
    curator_added: bool = False
    wip_article_id: Optional[int] = None
    # Filter data (from WipArticle)
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None


class CurationFilteredArticle(BaseModel):
    """Filtered/duplicate/curated article data (from WipArticle)"""
    wip_article_id: int
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: str
    authors: Optional[List[str]] = None
    journal: Optional[str] = None
    year: Optional[int] = None
    abstract: Optional[str] = None
    url: Optional[str] = None
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None
    passed_semantic_filter: Optional[bool] = None
    is_duplicate: bool = False
    duplicate_of_pmid: Optional[str] = None
    included_in_report: bool = False
    curator_included: bool = False
    curator_excluded: bool = False
    curation_notes: Optional[str] = None
    presentation_categories: List[str] = []


class CurationCategory(BaseModel):
    """Category definition from stream config"""
    id: str
    name: str
    color: Optional[str] = None
    description: Optional[str] = None


class CurationStats(BaseModel):
    """Pipeline and curation statistics"""
    pipeline_included: int
    pipeline_filtered: int
    pipeline_duplicates: int
    current_included: int
    curator_added: int
    curator_removed: int


class CurationViewResponse(BaseModel):
    """Response for get_curation_view endpoint"""
    report: CurationReportData
    included_articles: List[CurationIncludedArticle]
    filtered_articles: List[CurationFilteredArticle]
    duplicate_articles: List[CurationFilteredArticle] = []
    curated_articles: List[CurationFilteredArticle]
    categories: List[CurationCategory]
    stream_name: Optional[str] = None
    stats: CurationStats
    execution_id: Optional[str] = None
    retrieval_config: Optional[Dict[str, Any]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CurationEventResponse(BaseModel):
    """A single curation event for the history view"""
    id: int
    event_type: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    notes: Optional[str] = None
    article_id: Optional[int] = None
    article_title: Optional[str] = None
    curator_name: str
    created_at: str


class CurationHistoryResponse(BaseModel):
    """Response containing curation history for a report"""
    events: List[CurationEventResponse]
    total_count: int


class ResetCurationResponse(BaseModel):
    """Response for reset_curation endpoint"""
    wip_article_id: int
    reset: bool
    was_curator_included: Optional[bool] = None
    was_curator_excluded: Optional[bool] = None
    pipeline_decision: Optional[bool] = None
    now_in_report: Optional[bool] = None
    message: Optional[str] = None


class UpdateWipArticleNotesResponse(BaseModel):
    """Response for update_wip_article_notes endpoint"""
    wip_article_id: int
    curation_notes: str


class ExcludeArticleResponse(BaseModel):
    """Response for exclude_article endpoint"""
    article_id: int
    excluded: bool
    wip_article_updated: bool
    was_curator_added: bool = False


class IncludeArticleResponse(BaseModel):
    """Response for include_article endpoint"""
    article_id: int
    wip_article_id: int
    included: bool
    ranking: int
    category: Optional[str] = None


class UpdateReportContentResponse(BaseModel):
    """Response for update_report_content endpoint"""
    report_name: str
    executive_summary: str = ""
    category_summaries: Dict[str, str] = {}
    has_curation_edits: bool


class UpdateArticleResponse(BaseModel):
    """Response for update_article_in_report endpoint"""
    article_id: int
    ranking: Optional[int] = None
    presentation_categories: List[str] = []
    ai_summary: Optional[str] = None


class ApproveReportResponse(BaseModel):
    """Response for approve_report endpoint"""
    report_id: int
    approval_status: str
    approved_by: int
    approved_at: str


class RejectReportResponse(BaseModel):
    """Response for reject_report endpoint"""
    report_id: int
    approval_status: str
    rejection_reason: str
    rejected_by: int
    rejected_at: str


# --- Pipeline Analytics Response Schemas ---

class WipArticleAnalyticsResponse(BaseModel):
    """WipArticle data for pipeline analytics response"""
    id: int
    title: str
    retrieval_group_id: str
    is_duplicate: bool
    duplicate_of_id: Optional[int] = None
    passed_semantic_filter: Optional[bool] = None
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None
    included_in_report: bool
    presentation_categories: List[str] = []
    authors: List[str] = []
    journal: Optional[str] = None
    year: Optional[int] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None


class GroupAnalyticsResponse(BaseModel):
    """Analytics for a single retrieval group"""
    group_id: str
    total: int
    duplicates: int
    filtered_out: int
    passed_filter: int
    included: int


class PipelineAnalyticsSummaryResponse(BaseModel):
    """Summary counts for pipeline analytics"""
    total_retrieved: int
    duplicates: int
    filtered_out: int
    passed_filter: int
    included_in_report: int


class PipelineAnalyticsResponse(BaseModel):
    """Complete pipeline analytics response"""
    report_id: int
    run_type: Optional[str] = None
    report_date: str
    pipeline_metrics: Optional[Dict[str, Any]] = None
    summary: PipelineAnalyticsSummaryResponse
    by_group: List[GroupAnalyticsResponse]
    filter_reasons: Dict[str, int]
    category_counts: Dict[str, int]
    wip_articles: List[WipArticleAnalyticsResponse]


# ==================== Curation View Endpoints ====================

@router.get("/{report_id}/curation", response_model=CurationViewResponse)
async def get_curation_view(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get full curation view for a report.

    Returns all data needed for the curation interface:
    - report: Report content with originals for comparison
    - included_articles: Articles currently in the report
    - filtered_articles: Articles pipeline rejected (available for inclusion)
    - duplicate_articles: Articles marked as duplicates
    - curated_articles: Articles with curator overrides
    - categories: Stream's presentation categories
    - stats: Pipeline and curation statistics
    """
    logger.info(f"get_curation_view - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        data = service.get_curation_view(report_id, current_user.user_id)

        # Build report data - enrichments are stored in JSON fields
        enrichments = data.report.enrichments or {}
        original_enrichments = data.report.original_enrichments or {}

        report_data = CurationReportData(
            report_id=data.report.report_id,
            report_name=data.report.report_name,
            original_report_name=data.report.original_report_name,
            report_date=data.report.report_date.isoformat() if data.report.report_date else None,
            approval_status=data.report.approval_status.value if data.report.approval_status else None,
            executive_summary=enrichments.get('executive_summary', ''),
            original_executive_summary=original_enrichments.get('executive_summary', ''),
            category_summaries=enrichments.get('category_summaries', {}),
            original_category_summaries=original_enrichments.get('category_summaries', {}),
            has_curation_edits=data.report.has_curation_edits or False,
            last_curated_by=data.report.last_curated_by,
            last_curated_at=data.report.last_curated_at.isoformat() if data.report.last_curated_at else None,
        )

        # Convert IncludedArticleData to CurationIncludedArticle
        included_articles = [
            CurationIncludedArticle(
                article_id=item.article.article_id,
                pmid=item.article.pmid,
                doi=item.article.doi,
                title=item.article.title,
                authors=item.article.authors,
                journal=item.article.journal,
                year=item.article.year,
                abstract=item.article.abstract,
                url=item.article.url,
                ranking=item.association.ranking,
                original_ranking=item.association.original_ranking,
                presentation_categories=item.association.presentation_categories or [],
                original_presentation_categories=item.association.original_presentation_categories or [],
                ai_summary=item.association.ai_summary,
                original_ai_summary=item.association.original_ai_summary,
                relevance_score=item.association.relevance_score,
                curation_notes=item.curation_notes,
                curated_by=item.association.curated_by,
                curated_at=item.association.curated_at.isoformat() if item.association.curated_at else None,
                curator_added=item.association.curator_added or False,
                wip_article_id=item.wip_article_id,
                filter_score=item.filter_score,
                filter_score_reason=item.filter_score_reason,
            )
            for item in data.included_articles
        ]

        # Convert WipArticle models to CurationFilteredArticle
        def wip_to_filtered(wip) -> CurationFilteredArticle:
            return CurationFilteredArticle(
                wip_article_id=wip.id,
                pmid=wip.pmid,
                doi=wip.doi,
                title=wip.title,
                authors=wip.authors,
                journal=wip.journal,
                year=wip.year,
                abstract=wip.abstract,
                url=wip.url,
                filter_score=wip.filter_score,
                filter_score_reason=wip.filter_score_reason,
                passed_semantic_filter=wip.passed_semantic_filter,
                is_duplicate=wip.is_duplicate or False,
                duplicate_of_pmid=wip.duplicate_of_pmid,
                included_in_report=wip.included_in_report or False,
                curator_included=wip.curator_included or False,
                curator_excluded=wip.curator_excluded or False,
                curation_notes=wip.curation_notes,
                presentation_categories=wip.presentation_categories or [],
            )

        filtered_articles = [wip_to_filtered(wip) for wip in data.filtered_articles]
        curated_articles = [wip_to_filtered(wip) for wip in data.curated_articles]

        # Build categories
        categories = [
            CurationCategory(id=cat["id"], name=cat["name"])
            for cat in data.categories
        ]

        # Build stats
        stats = CurationStats(
            pipeline_included=data.stats.pipeline_included,
            pipeline_filtered=data.stats.pipeline_filtered,
            pipeline_duplicates=data.stats.pipeline_duplicates,
            current_included=data.stats.current_included,
            curator_added=data.stats.curator_added,
            curator_removed=data.stats.curator_removed,
        )

        logger.info(f"get_curation_view complete - user_id={current_user.user_id}, report_id={report_id}")
        return CurationViewResponse(
            report=report_data,
            included_articles=included_articles,
            filtered_articles=filtered_articles,
            duplicate_articles=[],
            curated_articles=curated_articles,
            categories=categories,
            stream_name=data.stream.stream_name if data.stream else None,
            stats=stats,
            execution_id=str(data.execution.id) if data.execution else None,
            retrieval_config=data.execution.retrieval_config if data.execution else None,
            start_date=data.execution.start_date if data.execution else None,
            end_date=data.execution.end_date if data.execution else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_curation_view failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get curation view: {str(e)}"
        )


@router.get("/{report_id}/curation/history", response_model=CurationHistoryResponse)
async def get_curation_history(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get curation history (audit trail) for a report.
    Returns all curation events in reverse chronological order.
    """
    logger.info(f"get_curation_history - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        data = service.get_curation_history(report_id, current_user.user_id)

        # Convert dataclass to response schema
        event_responses = [
            CurationEventResponse(**asdict(event))
            for event in data.events
        ]

        logger.info(f"get_curation_history complete - user_id={current_user.user_id}, report_id={report_id}, events={len(event_responses)}")
        return CurationHistoryResponse(
            events=event_responses,
            total_count=data.total_count,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_curation_history failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get curation history: {str(e)}"
        )


@router.get("/{report_id}/pipeline-analytics", response_model=PipelineAnalyticsResponse)
async def get_pipeline_analytics(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get pipeline analytics for a report - detailed breakdown of filtering decisions."""
    logger.info(f"get_pipeline_analytics - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        result = service.get_pipeline_analytics(report_id, current_user.user_id)

        logger.info(f"get_pipeline_analytics complete - user_id={current_user.user_id}, report_id={report_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_pipeline_analytics failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get pipeline analytics: {str(e)}"
        )


# ==================== Article Management Endpoints ====================

@router.post("/{report_id}/articles/{article_id}/exclude", response_model=ExcludeArticleResponse)
async def exclude_article(
    report_id: int,
    article_id: int,
    request: ExcludeArticleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Curator excludes an article from the report.

    - Deletes ReportArticleAssociation
    - Updates WipArticle: included_in_report=False, curator_excluded=True
    """
    logger.info(f"exclude_article - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        service = ReportService(db)
        result = service.exclude_article(
            report_id=report_id,
            article_id=article_id,
            user_id=current_user.user_id,
            notes=request.notes
        )
        logger.info(f"exclude_article complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return ExcludeArticleResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"exclude_article failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to exclude article: {str(e)}"
        )


@router.post("/{report_id}/articles/include", response_model=IncludeArticleResponse)
async def include_article(
    report_id: int,
    request: IncludeArticleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Curator includes a filtered article into the report.

    - Creates/finds Article record
    - Creates ReportArticleAssociation
    - Updates WipArticle: included_in_report=True, curator_included=True
    """
    logger.info(f"include_article - user_id={current_user.user_id}, report_id={report_id}, wip_article_id={request.wip_article_id}")

    try:
        service = ReportService(db)
        result = service.include_article(
            report_id=report_id,
            wip_article_id=request.wip_article_id,
            user_id=current_user.user_id,
            category=request.category,
            notes=request.notes
        )
        logger.info(f"include_article complete - user_id={current_user.user_id}, report_id={report_id}, article_id={result.article_id}")
        return IncludeArticleResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"include_article failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to include article: {str(e)}"
        )


@router.post("/{report_id}/articles/{wip_article_id}/reset-curation", response_model=ResetCurationResponse)
async def reset_curation(
    report_id: int,
    wip_article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Reset a curator's include/exclude decision back to pipeline's original decision.

    This is the "undo" operation for curator include/exclude actions.
    - Clears both curator_included and curator_excluded flags
    - Restores included_in_report based on pipeline's original decision
    """
    logger.info(f"reset_curation - user_id={current_user.user_id}, report_id={report_id}, wip_article_id={wip_article_id}")

    try:
        service = ReportService(db)
        result = service.reset_curation(
            report_id=report_id,
            wip_article_id=wip_article_id,
            user_id=current_user.user_id
        )
        logger.info(f"reset_curation complete - user_id={current_user.user_id}, report_id={report_id}")
        return ResetCurationResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reset_curation failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset curation: {str(e)}"
        )


@router.patch("/{report_id}/wip-articles/{wip_article_id}/notes", response_model=UpdateWipArticleNotesResponse)
async def update_wip_article_notes(
    report_id: int,
    wip_article_id: int,
    request: UpdateWipArticleNotesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update curation notes on a WipArticle.

    Curation notes document the curator's reasoning for including/excluding an article.
    This is the single source of truth for curation notes - works for both included
    and filtered articles.

    The report_id is used to verify user has access to this report's curation.
    """
    logger.info(f"update_wip_article_notes - user_id={current_user.user_id}, report_id={report_id}, wip_article_id={wip_article_id}")

    try:
        # Verify user has access to this report
        report_service = ReportService(db)
        result = report_service.get_report_with_access(report_id, current_user.user_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found or access denied"
            )

        # Update the WipArticle curation notes
        wip_service = WipArticleService(db)
        article = wip_service.update_curation_notes(
            wip_article_id=wip_article_id,
            curation_notes=request.curation_notes,
            user_id=current_user.user_id
        )

        logger.info(f"update_wip_article_notes complete - user_id={current_user.user_id}, wip_article_id={wip_article_id}")
        return UpdateWipArticleNotesResponse(
            wip_article_id=article.id,
            curation_notes=article.curation_notes or ""
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_wip_article_notes failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update curation notes: {str(e)}"
        )


@router.patch("/{report_id}/articles/{article_id}", response_model=UpdateArticleResponse)
async def update_article_in_report(
    report_id: int,
    article_id: int,
    request: UpdateArticleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Edit an article within the report (ranking, category, AI summary).
    """
    logger.info(f"update_article_in_report - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        service = ReportService(db)
        result = service.update_article_in_report(
            report_id=report_id,
            article_id=article_id,
            user_id=current_user.user_id,
            ranking=request.ranking,
            category=request.category,
            ai_summary=request.ai_summary
        )
        logger.info(f"update_article_in_report complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return UpdateArticleResponse(
            article_id=result.article_id,
            ranking=result.ranking,
            presentation_categories=result.presentation_categories,
            ai_summary=result.ai_summary,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_article_in_report failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update article: {str(e)}"
        )


# ==================== Report Content Endpoints ====================

@router.patch("/{report_id}/content", response_model=UpdateReportContentResponse)
async def update_report_content(
    report_id: int,
    request: UpdateReportContentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update report content (title, executive summary, category summaries)."""
    logger.info(f"update_report_content - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        result = service.update_report_content(
            report_id=report_id,
            user_id=current_user.user_id,
            report_name=request.report_name,
            executive_summary=request.executive_summary,
            category_summaries=request.category_summaries
        )
        logger.info(f"update_report_content complete - user_id={current_user.user_id}, report_id={report_id}")
        return UpdateReportContentResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_report_content failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update report content: {str(e)}"
        )


# ==================== Approval Workflow Endpoints ====================

@router.post("/{report_id}/request-approval")
async def send_approval_request(
    report_id: int,
    request: ApprovalRequestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Send an approval request email to an admin.
    """
    logger.info(f"send_approval_request - user_id={current_user.user_id}, report_id={report_id}, admin_id={request.admin_user_id}")

    try:
        service = ReportService(db)
        result = service.get_report_with_access(report_id, current_user.user_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found or access denied"
            )
        report, user, stream = result

        # Get admin user
        admin = db.query(User).filter(
            User.user_id == request.admin_user_id,
            User.is_active == True
        ).first()

        if not admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin user not found"
            )

        # Verify admin has appropriate role
        if admin.role not in (UserRole.PLATFORM_ADMIN, UserRole.ORG_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not an admin"
            )

        # Send the email
        email_service = EmailService()
        await email_service.send_approval_request_email(
            recipient_email=admin.email,
            recipient_name=admin.full_name or admin.email,
            report_id=report.report_id,
            report_name=report.report_name,
            stream_name=stream.stream_name if stream else "Unknown",
            requester_name=user.full_name or user.email,
        )

        logger.info(f"send_approval_request complete - user_id={current_user.user_id}, report_id={report_id}, admin_id={request.admin_user_id}")
        return {"success": True, "message": f"Approval request sent to {admin.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"send_approval_request failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send approval request: {str(e)}"
        )


@router.post("/{report_id}/approve", response_model=ApproveReportResponse)
async def approve_report(
    report_id: int,
    request: Optional[ApproveReportRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Approve a report for distribution.
    Only admins can approve reports.
    """
    logger.info(f"approve_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        result = service.approve_report(
            report_id=report_id,
            user_id=current_user.user_id,
            notes=request.notes if request else None
        )
        logger.info(f"approve_report complete - user_id={current_user.user_id}, report_id={report_id}")
        return ApproveReportResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"approve_report failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve report: {str(e)}"
        )


@router.post("/{report_id}/reject", response_model=RejectReportResponse)
async def reject_report(
    report_id: int,
    request: RejectReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Reject a report with a reason.
    Only admins can reject reports.
    """
    logger.info(f"reject_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        result = service.reject_report(
            report_id=report_id,
            user_id=current_user.user_id,
            reason=request.reason
        )
        logger.info(f"reject_report complete - user_id={current_user.user_id}, report_id={report_id}")
        return RejectReportResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reject_report failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject report: {str(e)}"
        )
