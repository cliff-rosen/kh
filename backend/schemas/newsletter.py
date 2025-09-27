from pydantic import BaseModel
from datetime import date
from typing import Optional, List, Dict, Any
from enum import Enum

class TimePeriodType(str, Enum):
    """Types of time periods for summaries"""
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    CUSTOM = "custom"

class Newsletter(BaseModel):
    id: Optional[int] = None
    source_name: str
    issue_identifier: Optional[str] = None
    email_date: date
    subject_line: Optional[str] = None
    raw_content: Optional[str] = None
    cleaned_content: Optional[str] = None
    extraction: Optional[dict] = None
    processed_status: Optional[str] = None

class NewsletterExtractionRange(BaseModel):
    min_id: int
    max_id: int

class NewsletterSummary(BaseModel):
    """Schema for newsletter summaries"""
    id: Optional[int] = None
    period_type: TimePeriodType
    start_date: date
    end_date: date
    summary: Dict[str, Any]  # The actual summary content
    source_count: int  # Number of newsletters summarized
    source_ids: List[int]  # IDs of newsletters included in summary
    created_at: Optional[date] = None
    updated_at: Optional[date] = None
    metadata: Optional[Dict[str, Any]] = None  # Additional metadata about the summary 