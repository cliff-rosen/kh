"""
Reports API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from database import get_db
from models import User, WipArticle, Report as ReportModel
from schemas.report import Report, ReportWithArticles
from services.report_service import ReportService
from routers.auth import get_current_user

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
    # Verify report exists and belongs to user
    report = db.query(ReportModel).filter(
        ReportModel.report_id == report_id,
        ReportModel.user_id == current_user.user_id
    ).first()

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )

    # Get execution ID from report
    if not report.pipeline_execution_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This report does not have pipeline execution data (legacy report)"
        )

    # Get all wip_articles for this execution
    wip_articles = db.query(WipArticle).filter(
        WipArticle.pipeline_execution_id == report.pipeline_execution_id
    ).all()

    # Calculate analytics
    total_retrieved = len(wip_articles)
    duplicates = sum(1 for a in wip_articles if a.is_duplicate)
    filtered_out = sum(1 for a in wip_articles if a.passed_semantic_filter == False)
    passed_filter = sum(1 for a in wip_articles if a.passed_semantic_filter == True)
    included_in_report = sum(1 for a in wip_articles if a.included_in_report)

    # Group by retrieval group
    groups = {}
    for article in wip_articles:
        if article.retrieval_group_id not in groups:
            groups[article.retrieval_group_id] = {
                'group_id': article.retrieval_group_id,
                'total': 0,
                'duplicates': 0,
                'filtered_out': 0,
                'passed_filter': 0,
                'included': 0
            }
        groups[article.retrieval_group_id]['total'] += 1
        if article.is_duplicate:
            groups[article.retrieval_group_id]['duplicates'] += 1
        if article.passed_semantic_filter == False:
            groups[article.retrieval_group_id]['filtered_out'] += 1
        if article.passed_semantic_filter == True:
            groups[article.retrieval_group_id]['passed_filter'] += 1
        if article.included_in_report:
            groups[article.retrieval_group_id]['included'] += 1

    # Get filter rejection reasons
    rejection_reasons = {}
    for article in wip_articles:
        if article.filter_rejection_reason:
            reason = article.filter_rejection_reason[:100]  # Truncate for grouping
            rejection_reasons[reason] = rejection_reasons.get(reason, 0) + 1

    # Categorization stats
    category_counts = {}
    for article in wip_articles:
        if article.presentation_categories:
            for cat_id in article.presentation_categories:
                category_counts[cat_id] = category_counts.get(cat_id, 0) + 1

    # Serialize wip_articles for client
    wip_articles_data = []
    for article in wip_articles:
        wip_articles_data.append({
            'id': article.id,
            'title': article.title,
            'retrieval_group_id': article.retrieval_group_id,
            'is_duplicate': article.is_duplicate,
            'duplicate_of_id': article.duplicate_of_id,
            'passed_semantic_filter': article.passed_semantic_filter,
            'filter_rejection_reason': article.filter_rejection_reason,
            'included_in_report': article.included_in_report,
            'presentation_categories': article.presentation_categories,
            'authors': article.authors,
            'journal': article.journal,
            'year': article.year,
            'pmid': article.pmid,
            'doi': article.doi,
            'abstract': article.abstract
        })

    return {
        'report_id': report_id,
        'run_type': report.run_type.value if report.run_type else None,
        'report_date': report.report_date.isoformat(),
        'pipeline_metrics': report.pipeline_metrics,
        'summary': {
            'total_retrieved': total_retrieved,
            'duplicates': duplicates,
            'filtered_out': filtered_out,
            'passed_filter': passed_filter,
            'included_in_report': included_in_report
        },
        'by_group': list(groups.values()),
        'rejection_reasons': rejection_reasons,
        'category_counts': category_counts,
        'wip_articles': wip_articles_data
    }
