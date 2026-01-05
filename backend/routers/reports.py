"""
Reports API endpoints
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from database import get_db
from models import User
from schemas.report import Report, ReportWithArticles
from services.report_service import ReportService
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
        reports = service.get_recent_reports(current_user.user_id, limit)

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
        reports = service.get_reports_for_stream(stream_id, current_user.user_id)

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
        report = service.get_latest_report_for_stream(stream_id, current_user.user_id)

        if not report:
            logger.warning(f"get_latest_report_for_stream - no reports found - user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No reports found for this research stream"
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
        service = ReportService(db)
        report = service.get_report_with_articles(report_id, current_user.user_id)

        if not report:
            logger.warning(f"get_report_with_articles - not found - user_id={current_user.user_id}, report_id={report_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        logger.info(f"get_report_with_articles complete - user_id={current_user.user_id}, report_id={report_id}")
        return report

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


@router.get("/{report_id}/pipeline-analytics", response_model=Dict[str, Any])
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
        return analytics

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
        return UpdateSuccessResponse(status="ok", **result)

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
        return UpdateSuccessResponse(status="ok", **result)

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
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_article_metadata failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get article metadata: {str(e)}"
        )
