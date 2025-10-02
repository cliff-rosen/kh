"""
Research stream schemas for Knowledge Horizon
"""

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from enum import Enum


class StreamType(str, Enum):
    COMPETITIVE = "competitive"
    REGULATORY = "regulatory"
    CLINICAL = "clinical"
    MARKET = "market"
    SCIENTIFIC = "scientific"
    MIXED = "mixed"


class ReportFrequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"


class PartialStreamConfig(BaseModel):
    """Partial stream configuration for AI-guided creation (all fields optional)"""
    stream_name: Optional[str] = None
    description: Optional[str] = None
    stream_type: Optional[str] = None  # Use string to allow flexibility during chat
    focus_areas: Optional[List[str]] = None
    competitors: Optional[List[str]] = None
    report_frequency: Optional[str] = None  # Use string to allow flexibility during chat


class ResearchStream(BaseModel):
    """Research stream business object"""
    stream_id: int
    user_id: int
    stream_name: str
    description: Optional[str] = None
    stream_type: StreamType
    focus_areas: List[str] = []
    competitors: List[str] = []
    report_frequency: ReportFrequency
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    report_count: Optional[int] = 0  # Report count when fetched with counts
    latest_report_date: Optional[str] = None  # Latest report creation date

    class Config:
        from_attributes = True