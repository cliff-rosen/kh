"""
Research stream schemas for Knowledge Horizon - Channel-based structure
Domain/Business objects only - no request/response types
"""

from pydantic import BaseModel, Field, computed_field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
from schemas.semantic_space import SemanticSpace


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


class Category(BaseModel):
    """A category within a research stream - structured topic organization"""
    id: str = Field(description="Unique identifier for this category (e.g., 'medical_health')")
    name: str = Field(description="Display name for the category")
    topics: List[str] = Field(description="List of topics covered by this category")
    specific_inclusions: List[str] = Field(default_factory=list, description="Category-specific inclusion criteria")


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


class CategoryWorkflowConfig(BaseModel):
    """Complete workflow configuration for a single category"""
    source_queries: Dict[str, Optional[SourceQuery]] = Field(default_factory=dict, description="Map: source_id -> SourceQuery (null if selected but not configured yet)")
    semantic_filter: SemanticFilter = Field(description="Semantic filtering for this category")


class WorkflowConfig(BaseModel):
    """Configuration for workflow - organized by category"""
    category_configs: Dict[str, CategoryWorkflowConfig] = Field(
        default_factory=dict,
        description="Map: category_id -> CategoryWorkflowConfig"
    )
    article_limit_per_week: Optional[int] = Field(None, description="Maximum articles per week")


class ResearchStream(BaseModel):
    """Research stream - scope-based structure with categories"""
    stream_id: int
    user_id: int
    stream_name: str
    purpose: str = Field(description="Why this stream exists, what questions it answers")

    # === LAYER 1: SEMANTIC SPACE ===
    # The canonical, source-agnostic representation of what information matters
    semantic_space: Optional[SemanticSpace] = Field(
        None,
        description="Layer 1: Semantic space definition (ground truth)"
    )

    # Legacy scope definition (to be deprecated in favor of semantic_space)
    audience: List[str] = Field(default_factory=list, description="Who uses this stream")
    intended_guidance: List[str] = Field(default_factory=list, description="What decisions this informs")
    global_inclusion: List[str] = Field(default_factory=list, description="Stream-wide inclusion criteria")
    global_exclusion: List[str] = Field(default_factory=list, description="Stream-wide exclusion criteria")

    # === LAYER 3: PRESENTATION TAXONOMY ===
    # Categories for presenting results (derived from semantic space)
    categories: List[Category] = Field(description="Structured topic categories")

    report_frequency: ReportFrequency
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    # === LAYER 2: RETRIEVAL TAXONOMY ===
    # Workflow configuration (derived from semantic space)
    workflow_config: Optional[WorkflowConfig] = Field(None, description="Source retrieval configuration")
    scoring_config: Optional[ScoringConfig] = None

    # Aggregated data (when fetched with counts)
    report_count: Optional[int] = 0
    latest_report_date: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================================
# Executive Summary
# ============================================================================

class CategoryHighlight(BaseModel):
    """Notable finding for a specific category"""
    category_name: str = Field(description="Name of the category")
    highlight: str = Field(description="Key finding or insight from this category")


class ExecutiveSummary(BaseModel):
    """AI-generated executive summary of test results across all categories"""
    overview: str = Field(description="High-level summary of what was found across all categories")
    key_themes: List[str] = Field(description="Main themes/topics identified across accepted articles")
    category_highlights: List[CategoryHighlight] = Field(description="Notable findings per category")
    generated_at: datetime = Field(description="When this summary was generated")