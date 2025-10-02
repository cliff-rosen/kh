"""
Report-related schemas for Knowledge Horizon
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, date


class ReportArticle(BaseModel):
    """Article within a report with association metadata"""
    article_id: int
    title: str
    authors: List[str] = []
    journal: Optional[str] = None
    publication_date: Optional[str] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None
    url: Optional[str] = None
    year: Optional[str] = None
    # Association metadata
    relevance_score: Optional[float] = None
    relevance_rationale: Optional[str] = None
    ranking: Optional[int] = None
    is_starred: Optional[bool] = False
    is_read: Optional[bool] = False
    notes: Optional[str] = None


class Report(BaseModel):
    """Report business object"""
    report_id: int
    user_id: int
    research_stream_id: Optional[int] = None
    report_date: date
    executive_summary: str
    key_highlights: List[str] = []
    thematic_analysis: str
    coverage_stats: Dict[str, Any] = {}
    is_read: bool = False
    read_at: Optional[datetime] = None
    created_at: datetime
    article_count: Optional[int] = None

    class Config:
        from_attributes = True


class ReportWithArticles(Report):
    """Report with full article details"""
    articles: List[ReportArticle] = []