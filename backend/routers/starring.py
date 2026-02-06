"""
Starring API endpoints - Per-user article starring

Provides endpoints for users to star articles and retrieve their starred articles.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from models import User
from services.starring_service import StarringService, get_starring_service, StarredArticle
from services.report_service import ReportService, get_report_service
from routers.auth import get_current_user

logger = logging.getLogger(__name__)


# --- Response Schemas ---

class ToggleStarResponse(BaseModel):
    """Response from toggling star status"""
    is_starred: bool


class StarredArticleIdsResponse(BaseModel):
    """Response containing list of starred article IDs"""
    starred_article_ids: List[int]


class StarredArticleResponse(BaseModel):
    """Response containing a starred article with metadata"""
    article_id: int
    report_id: int
    report_name: str
    stream_id: int
    stream_name: str
    title: str
    authors: List[str]
    journal: Optional[str] = None
    pub_year: Optional[int] = None
    pub_month: Optional[int] = None
    pub_day: Optional[int] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None
    starred_at: datetime


class StarredArticlesResponse(BaseModel):
    """Response containing list of starred articles"""
    articles: List[StarredArticleResponse]


class StarredCountResponse(BaseModel):
    """Response containing count of starred articles"""
    count: int


router = APIRouter(prefix="/api/stars", tags=["starring"])


def _starred_article_to_response(sa: StarredArticle) -> StarredArticleResponse:
    """Convert StarredArticle dataclass to Pydantic response model"""
    return StarredArticleResponse(
        article_id=sa.article_id,
        report_id=sa.report_id,
        report_name=sa.report_name,
        stream_id=sa.stream_id,
        stream_name=sa.stream_name,
        title=sa.title,
        authors=sa.authors,
        journal=sa.journal,
        pub_year=sa.pub_year,
        pub_month=sa.pub_month,
        pub_day=sa.pub_day,
        pmid=sa.pmid,
        doi=sa.doi,
        abstract=sa.abstract,
        starred_at=sa.starred_at
    )


@router.post("/reports/{report_id}/articles/{article_id}/toggle", response_model=ToggleStarResponse)
async def toggle_star(
    report_id: int,
    article_id: int,
    starring_service: StarringService = Depends(get_starring_service),
    report_service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Toggle the star status of an article for the current user.

    Returns the new star status (true if starred, false if unstarred).
    """
    logger.info(f"toggle_star - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        # Verify user has access to the report
        await report_service.get_report_with_access(report_id, current_user.user_id)

        # Toggle the star
        is_starred = await starring_service.toggle_star(
            user_id=current_user.user_id,
            report_id=report_id,
            article_id=article_id
        )

        logger.info(f"toggle_star complete - is_starred={is_starred}")
        return ToggleStarResponse(is_starred=is_starred)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"toggle_star failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to toggle star: {str(e)}")


@router.get("/reports/{report_id}", response_model=StarredArticleIdsResponse)
async def get_starred_for_report(
    report_id: int,
    starring_service: StarringService = Depends(get_starring_service),
    report_service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of starred article IDs for the current user in a specific report.
    """
    logger.info(f"get_starred_for_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        # Verify user has access to the report
        await report_service.get_report_with_access(report_id, current_user.user_id)

        # Get starred article IDs
        starred_ids = await starring_service.get_starred_for_report(
            user_id=current_user.user_id,
            report_id=report_id
        )

        logger.info(f"get_starred_for_report complete - count={len(starred_ids)}")
        return StarredArticleIdsResponse(starred_article_ids=starred_ids)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_starred_for_report failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get starred articles: {str(e)}")


@router.get("/streams/{stream_id}", response_model=StarredArticlesResponse)
async def get_starred_for_stream(
    stream_id: int,
    starring_service: StarringService = Depends(get_starring_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get all starred articles for the current user in a specific research stream.

    Returns full article metadata including report and stream context.
    """
    logger.info(f"get_starred_for_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Get starred articles for stream
        starred = await starring_service.get_starred_for_stream(
            user_id=current_user.user_id,
            stream_id=stream_id
        )

        articles = [_starred_article_to_response(sa) for sa in starred]

        logger.info(f"get_starred_for_stream complete - count={len(articles)}")
        return StarredArticlesResponse(articles=articles)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_starred_for_stream failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get starred articles: {str(e)}")


@router.get("/streams/{stream_id}/count", response_model=StarredCountResponse)
async def get_starred_count_for_stream(
    stream_id: int,
    starring_service: StarringService = Depends(get_starring_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get count of starred articles for the current user in a specific research stream.
    """
    logger.info(f"get_starred_count_for_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        count = await starring_service.get_starred_count_for_stream(
            user_id=current_user.user_id,
            stream_id=stream_id
        )

        logger.info(f"get_starred_count_for_stream complete - count={count}")
        return StarredCountResponse(count=count)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_starred_count_for_stream failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get starred count: {str(e)}")


@router.get("", response_model=StarredArticlesResponse)
async def get_all_starred(
    limit: Optional[int] = None,
    starring_service: StarringService = Depends(get_starring_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get all starred articles for the current user across all streams.

    Optional limit parameter for dashboard views (e.g., limit=5 for recent starred).
    """
    logger.info(f"get_all_starred - user_id={current_user.user_id}, limit={limit}")

    try:
        starred = await starring_service.get_all_starred(
            user_id=current_user.user_id,
            limit=limit
        )

        articles = [_starred_article_to_response(sa) for sa in starred]

        logger.info(f"get_all_starred complete - count={len(articles)}")
        return StarredArticlesResponse(articles=articles)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_all_starred failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get starred articles: {str(e)}")
