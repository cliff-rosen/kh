"""
Research stream schemas for Knowledge Horizon - Phase 1 Enhanced
Domain/Business objects only - no request/response types
"""

from pydantic import BaseModel, Field
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


class ScoringConfig(BaseModel):
    """Configuration for content relevance scoring and filtering"""
    relevance_weight: float = Field(
        default=0.6,
        ge=0.0,
        le=1.0,
        description="Weight for relevance score (0-1)"
    )
    evidence_weight: float = Field(
        default=0.4,
        ge=0.0,
        le=1.0,
        description="Weight for evidence quality score (0-1)"
    )
    inclusion_threshold: float = Field(
        default=7.0,
        ge=0.0,
        le=10.0,
        description="Minimum integrated score (1-10 scale) for content inclusion"
    )
    max_items_per_report: Optional[int] = Field(
        default=10,
        ge=1,
        description="Maximum items per report"
    )


class PartialStreamConfig(BaseModel):
    """Partial stream configuration for AI-guided creation (all fields optional)"""
    # Core fields
    stream_name: Optional[str] = None
    description: Optional[str] = None
    stream_type: Optional[str] = None  # Use string to allow flexibility during chat
    focus_areas: Optional[List[str]] = None
    competitors: Optional[List[str]] = None
    report_frequency: Optional[str] = None  # Use string to allow flexibility during chat

    # Phase 1: Purpose and Context
    purpose: Optional[str] = None
    business_goals: Optional[List[str]] = None
    expected_outcomes: Optional[str] = None

    # Phase 1: Search Strategy
    keywords: Optional[List[str]] = None

    # Phase 1: Scoring (as dict for flexibility during chat)
    scoring_config: Optional[dict] = None


class ResearchStream(BaseModel):
    """Research stream response object - Phase 1 Enhanced"""
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

    # Phase 1: Purpose and Business Context (REQUIRED)
    purpose: str  # Required: Why this stream exists
    business_goals: List[str]  # Required: Strategic objectives
    expected_outcomes: str  # Required: What decisions this will drive

    # Phase 1: Search Strategy (REQUIRED)
    keywords: List[str]  # Required: Search terms for literature

    # Phase 1: Scoring Configuration
    scoring_config: Optional[ScoringConfig] = None

    # Aggregated data (when fetched with counts)
    report_count: Optional[int] = 0
    latest_report_date: Optional[str] = None

    class Config:
        from_attributes = True