"""
Reports API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from database import get_db
from models import User
from schemas.report import Report, ReportWithArticles
from services.report_service import ReportService
from routers.auth import get_current_user


class UpdateArticleNotesRequest(BaseModel):
    notes: Optional[str] = None


class UpdateArticleEnrichmentsRequest(BaseModel):
    ai_enrichments: Dict[str, Any]


router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/recent", response_model=List[Report])
async def get_recent_reports(
    limit: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get recent reports across all streams for the current user"""
    service = ReportService(db)
    return service.get_recent_reports(current_user.user_id, limit)


@router.get("/stream/{stream_id}", response_model=List[Report])
async def get_reports_for_stream(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all reports for a research stream"""
    service = ReportService(db)
    return service.get_reports_for_stream(stream_id, current_user.user_id)


@router.get("/stream/{stream_id}/latest", response_model=Report)
async def get_latest_report_for_stream(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the latest report for a research stream"""
    service = ReportService(db)
    report = service.get_latest_report_for_stream(stream_id, current_user.user_id)

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No reports found for this research stream"
        )

    return report


@router.get("/{report_id}", response_model=ReportWithArticles)
async def get_report_with_articles(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a report with its associated articles"""
    service = ReportService(db)
    report = service.get_report_with_articles(report_id, current_user.user_id)

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )

    return report


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a report"""
    service = ReportService(db)
    deleted = service.delete_report(report_id, current_user.user_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
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
    service = ReportService(db)

    try:
        analytics = service.get_pipeline_analytics(report_id, current_user.user_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )

    if not analytics:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )

    return analytics


@router.patch("/{report_id}/articles/{article_id}/notes")
async def update_article_notes(
    report_id: int,
    article_id: int,
    request: UpdateArticleNotesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update notes for an article within a report"""
    service = ReportService(db)
    result = service.update_article_notes(
        report_id, article_id, current_user.user_id, request.notes
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report or article not found"
        )

    return {"status": "ok", **result}


@router.patch("/{report_id}/articles/{article_id}/enrichments")
async def update_article_enrichments(
    report_id: int,
    article_id: int,
    request: UpdateArticleEnrichmentsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update AI enrichments for an article within a report"""
    service = ReportService(db)
    result = service.update_article_enrichments(
        report_id, article_id, current_user.user_id, request.ai_enrichments
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report or article not found"
        )

    return {"status": "ok", **result}


@router.get("/{report_id}/articles/{article_id}/metadata")
async def get_article_metadata(
    report_id: int,
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get notes and AI enrichments for an article within a report"""
    service = ReportService(db)
    result = service.get_article_metadata(report_id, article_id, current_user.user_id)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report or article not found"
        )

    return result
