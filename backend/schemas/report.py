"""
Report-related schemas for Knowledge Horizon
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, date


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