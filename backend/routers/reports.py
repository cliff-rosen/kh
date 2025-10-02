"""
Reports API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import User
from schemas.report import Report, ReportWithArticles
from services.report_service import ReportService
from routers.auth import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


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
