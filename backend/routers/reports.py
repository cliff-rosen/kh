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


class EmailPreviewResponse(BaseModel):
    """Response containing email HTML preview"""
    html: str
    report_name: str


class UpdateSuccessResponse(BaseModel):
    """Response for successful update operations"""
    status: str
    notes: Optional[str] = None
    ai_enrichments: Optional[Dict[str, Any]] = None


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
        report_data = report_service.get_report_with_articles(report_id, current_user.user_id)
        report_name = report_data.report.report_name if report_data else ''

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
        report_data = report_service.get_report_with_articles(report_id, current_user.user_id)
        report_name = report_data.report.report_name if report_data else ''

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
        report_data = report_service.get_report_with_articles(report_id, current_user.user_id)
        report_name = report_data.report.report_name if report_data else ''

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
    Send report email to specified recipients.
    Generates the email HTML on-the-fly if not already stored.
    """
    logger.info(f"send_report_email - user_id={current_user.user_id}, report_id={report_id}, recipients={request.recipients}")

    try:
        report_service = ReportService(db)

        # Try to get stored email HTML, otherwise generate it
        html = report_service.get_report_email_html(report_id, current_user.user_id)

        if not html:
            # Generate on the fly
            html = report_service.generate_report_email_html(report_id, current_user.user_id)

        if not html:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Could not generate email for this report."
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
            report_name=report.report.report_name,
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
