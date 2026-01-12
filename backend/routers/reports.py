"""
Reports API endpoints
"""

import logging
from dataclasses import asdict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from database import get_db
from models import User
from schemas.report import Report, ReportWithArticles
from services.report_service import ReportService
from services.email_service import EmailService
from services.user_tracking_service import track_endpoint
from routers.auth import get_current_user

logger = logging.getLogger(__name__)


# --- Request/Response Schemas ---

class UpdateArticleNotesRequest(BaseModel):
    notes: Optional[str] = None


class UpdateArticleEnrichmentsRequest(BaseModel):
    ai_enrichments: Dict[str, Any]


class ArticleMetadataResponse(BaseModel):
    """Response for article metadata (notes and enrichments)"""
    notes: Optional[str] = None
    ai_enrichments: Optional[Dict[str, Any]] = None


class SendReportEmailRequest(BaseModel):
    """Request to send report email"""
    recipients: List[str]


class StoreReportEmailRequest(BaseModel):
    """Request to store report email HTML"""
    html: str


class SendReportEmailResponse(BaseModel):
    """Response from sending report email"""
    success: List[str]
    failed: List[str]


class ApprovalRequestRequest(BaseModel):
    """Request to send approval request to an admin"""
    admin_user_id: int


# --- Curation Request/Response Schemas ---

class UpdateReportContentRequest(BaseModel):
    """Request to update report content (title, summaries)"""
    title: Optional[str] = None
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
    """Request to update an article within the report"""
    ranking: Optional[int] = None
    category: Optional[str] = None
    ai_summary: Optional[str] = None
    curation_notes: Optional[str] = None


class ApproveReportRequest(BaseModel):
    """Request to approve a report"""
    notes: Optional[str] = None


class RejectReportRequest(BaseModel):
    """Request to reject a report"""
    reason: str


class EmailPreviewResponse(BaseModel):
    """Response containing email HTML preview"""
    html: str
    report_name: str


class UpdateSuccessResponse(BaseModel):
    """Response for successful update operations"""
    status: str
    notes: Optional[str] = None
    ai_enrichments: Optional[Dict[str, Any]] = None


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
    curator_added: bool = False  # True = curator override, False = pipeline included
    wip_article_id: Optional[int] = None  # For reset curation on curator-added articles


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
    pipeline_included: int  # Articles pipeline decided to include
    pipeline_filtered: int  # Articles pipeline filtered out
    pipeline_duplicates: int  # Duplicate articles detected
    current_included: int  # Current visible articles in report
    curator_added: int  # Articles curator manually added
    curator_removed: int  # Articles curator manually removed


class CurationViewResponse(BaseModel):
    """Response for get_curation_view endpoint"""
    report: CurationReportData
    included_articles: List[CurationIncludedArticle]
    filtered_articles: List[CurationFilteredArticle]
    duplicate_articles: List[CurationFilteredArticle] = []  # Empty - duplicates not actionable
    curated_articles: List[CurationFilteredArticle]
    categories: List[CurationCategory]
    stream_name: Optional[str] = None
    stats: CurationStats
    # Execution info for retrieval config display
    execution_id: Optional[str] = None
    retrieval_config: Optional[Dict[str, Any]] = None
    # Date range for the run
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class ResetCurationResponse(BaseModel):
    """Response for reset_curation endpoint"""
    wip_article_id: int
    reset: bool
    was_curator_included: Optional[bool] = None
    was_curator_excluded: Optional[bool] = None
    pipeline_decision: Optional[bool] = None
    now_in_report: Optional[bool] = None
    message: Optional[str] = None


class ExcludeArticleResponse(BaseModel):
    """Response for exclude_article endpoint"""
    article_id: int
    excluded: bool
    wip_article_updated: bool


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
    curation_notes: Optional[str] = None


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


router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/recent", response_model=List[Report])
async def get_recent_reports(
    limit: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get recent reports across all streams for the current user"""
    logger.info(f"get_recent_reports - user_id={current_user.user_id}, limit={limit}")

    try:
        service = ReportService(db)
        results = service.get_recent_reports(current_user.user_id, limit)

        # Convert model + article_count to schema
        reports = [
            Report.model_validate(r.report, from_attributes=True).model_copy(
                update={'article_count': r.article_count}
            )
            for r in results
        ]

        logger.info(f"get_recent_reports complete - user_id={current_user.user_id}, count={len(reports)}")
        return reports

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_recent_reports failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get recent reports: {str(e)}"
        )


@router.get("/stream/{stream_id}", response_model=List[Report])
async def get_reports_for_stream(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all reports for a research stream"""
    logger.info(f"get_reports_for_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        service = ReportService(db)
        results = service.get_reports_for_stream(stream_id, current_user.user_id)

        # Convert model + article_count to schema
        reports = [
            Report.model_validate(r.report, from_attributes=True).model_copy(
                update={'article_count': r.article_count}
            )
            for r in results
        ]

        logger.info(f"get_reports_for_stream complete - user_id={current_user.user_id}, stream_id={stream_id}, count={len(reports)}")
        return reports

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_reports_for_stream failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get reports: {str(e)}"
        )


@router.get("/stream/{stream_id}/latest", response_model=Report)
async def get_latest_report_for_stream(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the latest report for a research stream"""
    logger.info(f"get_latest_report_for_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        service = ReportService(db)
        result = service.get_latest_report_for_stream(stream_id, current_user.user_id)

        if not result:
            logger.warning(f"get_latest_report_for_stream - no reports found - user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No reports found for this research stream"
            )

        # Convert model + article_count to schema
        report = Report.model_validate(result.report, from_attributes=True).model_copy(
            update={'article_count': result.article_count}
        )

        logger.info(f"get_latest_report_for_stream complete - user_id={current_user.user_id}, stream_id={stream_id}, report_id={report.report_id}")
        return report

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_latest_report_for_stream failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get latest report: {str(e)}"
        )


@router.get("/{report_id}", response_model=ReportWithArticles)
@track_endpoint("view_report")
async def get_report_with_articles(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a report with its associated articles"""
    logger.info(f"get_report_with_articles - user_id={current_user.user_id}, report_id={report_id}")

    try:
        from schemas.report import ReportArticle as ReportArticleSchema

        service = ReportService(db)
        result = service.get_report_with_articles(report_id, current_user.user_id)

        if not result:
            logger.warning(f"get_report_with_articles - not found - user_id={current_user.user_id}, report_id={report_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Build retrieval_params from the linked PipelineExecution
        retrieval_params = {}
        if result.report.execution:
            exec = result.report.execution
            retrieval_params = {
                'start_date': exec.start_date,
                'end_date': exec.end_date,
                'retrieval_config': exec.retrieval_config,
                'presentation_config': exec.presentation_config,
            }

        # Convert model to schema
        report_schema = Report.model_validate(result.report, from_attributes=True).model_copy(
            update={
                'article_count': result.article_count,
                'retrieval_params': retrieval_params,
            }
        )

        # Convert articles with association metadata
        articles = [
            ReportArticleSchema(
                article_id=info.article.article_id,
                title=info.article.title,
                authors=info.article.authors or [],
                journal=info.article.journal,
                publication_date=info.article.publication_date.isoformat() if info.article.publication_date else None,
                pmid=info.article.pmid,
                doi=info.article.doi,
                abstract=info.article.abstract,
                url=info.article.url,
                year=str(info.article.year) if info.article.year else None,
                relevance_score=info.association.relevance_score,
                relevance_rationale=info.association.relevance_rationale,
                ranking=info.association.ranking,
                is_starred=info.association.is_starred,
                is_read=info.association.is_read,
                notes=info.association.notes,
                presentation_categories=info.association.presentation_categories or [],
                ai_enrichments=info.association.ai_enrichments,
            )
            for info in result.articles
        ]

        # Build response with articles
        response = ReportWithArticles(
            **report_schema.model_dump(),
            articles=articles
        )

        logger.info(f"get_report_with_articles complete - user_id={current_user.user_id}, report_id={report_id}")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_report_with_articles failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get report: {str(e)}"
        )


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a report"""
    logger.info(f"delete_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        deleted = service.delete_report(report_id, current_user.user_id)

        if not deleted:
            logger.warning(f"delete_report - not found - user_id={current_user.user_id}, report_id={report_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        logger.info(f"delete_report complete - user_id={current_user.user_id}, report_id={report_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_report failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete report: {str(e)}"
        )


@router.get("/{report_id}/pipeline-analytics", response_model=PipelineAnalyticsResponse)
async def get_pipeline_analytics(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get pipeline execution analytics for a test report.
    Returns detailed analytics including wip_articles data for debugging and analysis.
    """
    logger.info(f"get_pipeline_analytics - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        analytics = service.get_pipeline_analytics(report_id, current_user.user_id)

        if not analytics:
            logger.warning(f"get_pipeline_analytics - not found - user_id={current_user.user_id}, report_id={report_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        logger.info(f"get_pipeline_analytics complete - user_id={current_user.user_id}, report_id={report_id}")
        # Convert dataclass to response schema
        return PipelineAnalyticsResponse(**asdict(analytics))

    except ValueError as e:
        logger.warning(f"get_pipeline_analytics - validation error - user_id={current_user.user_id}, report_id={report_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_pipeline_analytics failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get pipeline analytics: {str(e)}"
        )


@router.patch("/{report_id}/articles/{article_id}/notes", response_model=UpdateSuccessResponse)
async def update_article_notes(
    report_id: int,
    article_id: int,
    request: UpdateArticleNotesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update notes for an article within a report"""
    logger.info(f"update_article_notes - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        service = ReportService(db)
        result = service.update_article_notes(
            report_id, article_id, current_user.user_id, request.notes
        )

        if not result:
            logger.warning(f"update_article_notes - not found - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report or article not found"
            )

        logger.info(f"update_article_notes complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return UpdateSuccessResponse(status="ok", **asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_article_notes failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update article notes: {str(e)}"
        )


@router.patch("/{report_id}/articles/{article_id}/enrichments", response_model=UpdateSuccessResponse)
async def update_article_enrichments(
    report_id: int,
    article_id: int,
    request: UpdateArticleEnrichmentsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update AI enrichments for an article within a report"""
    logger.info(f"update_article_enrichments - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        service = ReportService(db)
        result = service.update_article_enrichments(
            report_id, article_id, current_user.user_id, request.ai_enrichments
        )

        if not result:
            logger.warning(f"update_article_enrichments - not found - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report or article not found"
            )

        logger.info(f"update_article_enrichments complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return UpdateSuccessResponse(status="ok", **asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_article_enrichments failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update article enrichments: {str(e)}"
        )


@router.get("/{report_id}/articles/{article_id}/metadata", response_model=ArticleMetadataResponse)
async def get_article_metadata(
    report_id: int,
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get notes and AI enrichments for an article within a report"""
    logger.info(f"get_article_metadata - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        service = ReportService(db)
        result = service.get_article_metadata(report_id, article_id, current_user.user_id)

        if not result:
            logger.warning(f"get_article_metadata - not found - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report or article not found"
            )

        logger.info(f"get_article_metadata complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return ArticleMetadataResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_article_metadata failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get article metadata: {str(e)}"
        )


@router.post("/{report_id}/email/generate", response_model=EmailPreviewResponse)
async def generate_report_email(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate email HTML for a report (does not store).
    Use POST /email/store to save the HTML after reviewing.
    """
    logger.info(f"generate_report_email - user_id={current_user.user_id}, report_id={report_id}")

    try:
        report_service = ReportService(db)

        # Generate email HTML (no storage)
        html = report_service.generate_report_email_html(report_id, current_user.user_id)

        if not html:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Get report name for response
        report = report_service.get_report_with_articles(report_id, current_user.user_id)
        report_name = report['report_name'] if report else ''

        logger.info(f"generate_report_email complete - user_id={current_user.user_id}, report_id={report_id}")
        return EmailPreviewResponse(html=html, report_name=report_name)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"generate_report_email failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate email: {str(e)}"
        )


@router.post("/{report_id}/email/store", response_model=EmailPreviewResponse)
async def store_report_email(
    report_id: int,
    request: StoreReportEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Store email HTML for a report.
    """
    logger.info(f"store_report_email - user_id={current_user.user_id}, report_id={report_id}")

    try:
        report_service = ReportService(db)

        # Store the email HTML
        success = report_service.store_report_email_html(report_id, current_user.user_id, request.html)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Get report name for response
        report = report_service.get_report_with_articles(report_id, current_user.user_id)
        report_name = report['report_name'] if report else ''

        logger.info(f"store_report_email complete - user_id={current_user.user_id}, report_id={report_id}")
        return EmailPreviewResponse(html=request.html, report_name=report_name)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"store_report_email failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store email: {str(e)}"
        )


@router.get("/{report_id}/email", response_model=EmailPreviewResponse)
async def get_report_email(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get stored email HTML for a report.
    Returns 404 if email hasn't been generated yet.
    """
    logger.info(f"get_report_email - user_id={current_user.user_id}, report_id={report_id}")

    try:
        report_service = ReportService(db)

        # Get stored email HTML
        html = report_service.get_report_email_html(report_id, current_user.user_id)

        if not html:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Email not generated yet. Use POST /email/generate first."
            )

        # Get report name for response
        report = report_service.get_report_with_articles(report_id, current_user.user_id)
        report_name = report['report_name'] if report else ''

        logger.info(f"get_report_email complete - user_id={current_user.user_id}, report_id={report_id}")
        return EmailPreviewResponse(html=html, report_name=report_name)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_report_email failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get email: {str(e)}"
        )


@router.post("/{report_id}/email/send", response_model=SendReportEmailResponse)
async def send_report_email(
    report_id: int,
    request: SendReportEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Send stored report email to specified recipients.
    Email must be generated first using POST /email/generate.
    """
    logger.info(f"send_report_email - user_id={current_user.user_id}, report_id={report_id}, recipients={request.recipients}")

    try:
        report_service = ReportService(db)

        # Get stored email HTML
        html = report_service.get_report_email_html(report_id, current_user.user_id)

        if not html:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Email not generated yet. Use POST /email/generate first."
            )

        # Get report name
        report = report_service.get_report_with_articles(report_id, current_user.user_id)
        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Send emails
        email_service = EmailService()
        results = await email_service.send_bulk_report_emails(
            recipients=request.recipients,
            report_name=report['report_name'],
            html_content=html
        )

        logger.info(f"send_report_email complete - user_id={current_user.user_id}, report_id={report_id}, success={len(results['success'])}, failed={len(results['failed'])}")
        return SendReportEmailResponse(**results)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"send_report_email failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send report email: {str(e)}"
        )


@router.post("/{report_id}/request-approval")
async def send_approval_request(
    report_id: int,
    request: ApprovalRequestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Send an approval request email to an admin.
    Includes a link to the report curation page and basic report metadata.
    """
    logger.info(f"send_approval_request - user_id={current_user.user_id}, report_id={report_id}, admin_id={request.admin_user_id}")

    try:
        report_service = ReportService(db)

        # Get report details
        report = report_service.get_report(report_id, current_user.user_id)
        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

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
        if not (admin.is_platform_admin or admin.is_org_admin):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is not an admin"
            )

        # Get article count
        article_count = report_service.association_service.count_visible(report_id)

        # Get stream name
        stream_name = None
        if report.research_stream:
            stream_name = report.research_stream.name

        # Send email
        email_service = EmailService()
        await email_service.send_approval_request_email(
            recipient_email=admin.email,
            recipient_name=admin.full_name or admin.email,
            report_id=report_id,
            report_name=report.report_name,
            stream_name=stream_name,
            article_count=article_count,
            requester_name=current_user.full_name or current_user.email
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


# =============================================================================
# CURATION ENDPOINTS
# =============================================================================

@router.get("/{report_id}/curation", response_model=CurationViewResponse)
async def get_curation_view(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get full curation view data for a report.

    Returns:
    - report: Report content with originals for comparison
    - included_articles: Articles currently in the report
    - filtered_articles: Articles pipeline rejected (available for inclusion)
    - duplicate_articles: Articles marked as duplicates
    - curated_articles: Articles with curator overrides
    - categories: Stream's presentation categories
    """
    logger.info(f"get_curation_view - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        data = service.get_curation_view(report_id, current_user.user_id)

        # Convert Report model to CurationReportData
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
                curation_notes=item.association.curation_notes,
                curated_by=item.association.curated_by,
                curated_at=item.association.curated_at.isoformat() if item.association.curated_at else None,
                curator_added=item.association.curator_added or False,
                wip_article_id=item.wip_article_id,
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

        # Convert categories
        categories = [
            CurationCategory(
                id=cat.get('id', ''),
                name=cat.get('name', ''),
                color=cat.get('color'),
                description=cat.get('description'),
            )
            for cat in data.categories
        ]

        # Convert stats dataclass
        stats = CurationStats(
            pipeline_included=data.stats.pipeline_included,
            pipeline_filtered=data.stats.pipeline_filtered,
            pipeline_duplicates=data.stats.pipeline_duplicates,
            current_included=data.stats.current_included,
            curator_added=data.stats.curator_added,
            curator_removed=data.stats.curator_removed,
        )

        response = CurationViewResponse(
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

        logger.info(f"get_curation_view complete - user_id={current_user.user_id}, report_id={report_id}")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_curation_view failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get curation view: {str(e)}"
        )


@router.patch("/{report_id}/content", response_model=UpdateReportContentResponse)
async def update_report_content(
    report_id: int,
    request: UpdateReportContentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update report content (title, summaries) for curation.
    """
    logger.info(f"update_report_content - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        result = service.update_report_content(
            report_id=report_id,
            user_id=current_user.user_id,
            title=request.title,
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
    Reset curation for an article, restoring it to the pipeline's original decision.

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
            ai_summary=request.ai_summary,
            curation_notes=request.curation_notes
        )
        logger.info(f"update_article_in_report complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return UpdateArticleResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_article_in_report failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update article: {str(e)}"
        )


@router.post("/{report_id}/approve", response_model=ApproveReportResponse)
async def approve_report(
    report_id: int,
    request: ApproveReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Approve a report for publication.
    """
    logger.info(f"approve_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = ReportService(db)
        result = service.approve_report(
            report_id=report_id,
            user_id=current_user.user_id,
            notes=request.notes
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
