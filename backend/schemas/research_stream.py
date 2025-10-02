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

    class Config:
        from_attributes = True