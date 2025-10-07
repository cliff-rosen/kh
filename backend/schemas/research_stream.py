"""
Research stream schemas for Knowledge Horizon - Channel-based structure
Domain/Business objects only - no request/response types
"""

from pydantic import BaseModel, Field, computed_field
from typing import List, Optional, Dict, Any
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


class SemanticFilter(BaseModel):
    """Semantic filtering configuration for a channel"""
    enabled: bool = Field(default=False, description="Whether semantic filtering is enabled")
    criteria: Optional[str] = Field(None, description="Semantic filtering criteria/prompt")
    threshold: Optional[float] = Field(None, description="Semantic similarity threshold")


class Channel(BaseModel):
    """A channel within a research stream - specific focus with keywords"""
    name: str = Field(description="Channel name")
    focus: str = Field(description="What this channel monitors")
    type: StreamType = Field(description="Type of intelligence for this channel")
    keywords: List[str] = Field(description="Keywords for this channel")
    semantic_filter: Optional[SemanticFilter] = Field(
        None,
        description="Optional semantic filtering configuration (configured downstream, not during creation)"
    )


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


class ChannelSourceQuery(BaseModel):
    """Query expression for a specific channel and source combination"""
    channel_name: str = Field(description="Which channel this query is for")
    query_expression: str = Field(description="Customized query for this source/channel combination")


class WorkflowSource(BaseModel):
    """A data source with channel-specific queries"""
    source_id: str = Field(description="Reference to authoritative source (e.g., 'pubmed', 'google_scholar')")
    enabled: bool = Field(default=True, description="Whether this source is enabled")
    channel_queries: List[ChannelSourceQuery] = Field(description="Query expressions for each channel")


class WorkflowConfig(BaseModel):
    """Configuration for workflow source retrieval"""
    sources: Optional[List[WorkflowSource]] = Field(None, description="List of data sources with channel queries")
    article_limit_per_week: Optional[int] = Field(None, description="Maximum articles per week")


class ResearchStream(BaseModel):
    """Research stream - channel-based structure"""
    stream_id: int
    user_id: int
    stream_name: str
    purpose: str = Field(description="Why this stream exists, what questions it answers")
    channels: List[Channel] = Field(description="Independent channels with focus, type, and keywords")
    report_frequency: ReportFrequency
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    # Workflow and scoring configuration
    workflow_config: Optional[WorkflowConfig] = Field(None, description="Source retrieval configuration")
    scoring_config: Optional[ScoringConfig] = None

    # Aggregated data (when fetched with counts)
    report_count: Optional[int] = 0
    latest_report_date: Optional[str] = None

    @computed_field
    @property
    def stream_type(self) -> StreamType:
        """Derived from channels: homogeneous = that type, heterogeneous = mixed"""
        if not self.channels:
            return StreamType.MIXED
        channel_types = {ch.type for ch in self.channels}
        return list(channel_types)[0] if len(channel_types) == 1 else StreamType.MIXED

    class Config:
        from_attributes = True