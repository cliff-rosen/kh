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


class Channel(BaseModel):
    """A channel within a research stream - specific focus with keywords"""
    channel_id: Optional[str] = Field(None, description="UUID - stable identifier for this channel (auto-generated if not provided)")
    name: str = Field(description="Channel name")
    focus: str = Field(description="What this channel monitors")
    type: StreamType = Field(description="Type of intelligence for this channel")
    keywords: List[str] = Field(description="Keywords for this channel")
    # Note: semantic_filter is now in workflow_config.channel_configs, not here


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


# ============================================================================
# Channel-Centric Workflow Configuration
# ============================================================================

class SourceQuery(BaseModel):
    """Query expression for a specific source within a channel"""
    query_expression: str = Field(description="Source-specific query expression")
    enabled: bool = Field(default=True, description="Whether this source is active for this channel")


class SemanticFilter(BaseModel):
    """Semantic filtering configuration for a channel"""
    enabled: bool = Field(default=False, description="Whether semantic filtering is enabled")
    criteria: str = Field(description="Text description of what should pass/fail")
    threshold: float = Field(default=0.7, ge=0.0, le=1.0, description="Confidence threshold (0.0 to 1.0)")


class ChannelWorkflowConfig(BaseModel):
    """Complete workflow configuration for a single channel"""
    source_queries: Dict[str, Optional[SourceQuery]] = Field(default_factory=dict, description="Map: source_id -> SourceQuery (null if selected but not configured yet)")
    semantic_filter: SemanticFilter = Field(description="Semantic filtering for this channel")


class WorkflowConfig(BaseModel):
    """Configuration for workflow - organized by channel"""
    channel_configs: Dict[str, ChannelWorkflowConfig] = Field(
        default_factory=dict,
        description="Map: channel_id -> ChannelWorkflowConfig"
    )
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


# ============================================================================
# Executive Summary
# ============================================================================

class ChannelHighlight(BaseModel):
    """Notable finding for a specific channel"""
    channel_name: str = Field(description="Name of the channel")
    highlight: str = Field(description="Key finding or insight from this channel")


class ExecutiveSummary(BaseModel):
    """AI-generated executive summary of test results across all channels"""
    overview: str = Field(description="High-level summary of what was found across all channels")
    key_themes: List[str] = Field(description="Main themes/topics identified across accepted articles")
    channel_highlights: List[ChannelHighlight] = Field(description="Notable findings per channel")
    generated_at: datetime = Field(description="When this summary was generated")