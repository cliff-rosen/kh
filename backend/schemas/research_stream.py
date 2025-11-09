"""
Research stream schemas for Knowledge Horizon - Category-based structure
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
    """A category within a research stream - structured topic organization for presentation"""
    id: str = Field(description="Unique identifier for this category (e.g., 'medical_health')")
    name: str = Field(description="Display name for the category")
    topics: List[str] = Field(description="List of topic_ids from semantic space covered by this category")
    specific_inclusions: List[str] = Field(default_factory=list, description="Category-specific inclusion criteria")


# ============================================================================
# Retrieval Configuration - Group-Based
# ============================================================================

class SourceQuery(BaseModel):
    """Query expression for a specific source"""
    query_expression: str = Field(description="Source-specific query expression")
    enabled: bool = Field(default=True, description="Whether this source is active")


class SemanticFilter(BaseModel):
    """Semantic filtering configuration"""
    enabled: bool = Field(default=False, description="Whether semantic filtering is enabled")
    criteria: str = Field(default="", description="Text description of what should pass/fail")
    threshold: float = Field(default=0.7, ge=0.0, le=1.0, description="Confidence threshold (0.0 to 1.0)")


class GenerationMetadata(BaseModel):
    """Metadata about how a configuration element was generated"""
    generated_at: datetime = Field(description="When this was generated")
    generated_by: str = Field(description="Who/what generated this (e.g., 'llm:gpt-4', 'user:manual')")
    reasoning: str = Field(default="", description="Explanation of why this was generated")
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="Confidence score (0-1)")
    inputs_considered: List[str] = Field(default_factory=list, description="topic_ids, entity_ids considered")
    human_edited: bool = Field(default=False, description="Has a human edited this")


class RetrievalGroup(BaseModel):
    """A grouping of topics for retrieval optimization"""
    group_id: str = Field(description="Unique identifier for this retrieval group")
    name: str = Field(description="Display name for the group")
    covered_topics: List[str] = Field(description="List of topic_ids from semantic space covered by this group")
    rationale: str = Field(description="Why these topics are grouped together for retrieval")

    # Retrieval configuration embedded directly
    source_queries: Dict[str, Optional[SourceQuery]] = Field(
        default_factory=dict,
        description="Map: source_id -> SourceQuery configuration"
    )
    semantic_filter: SemanticFilter = Field(
        default_factory=lambda: SemanticFilter(),
        description="Semantic filtering for this group"
    )

    # Metadata for auditability
    metadata: Optional[GenerationMetadata] = Field(None, description="Generation metadata")


class RetrievalConfig(BaseModel):
    """Layer 2: Configuration for content retrieval and filtering"""
    retrieval_groups: List[RetrievalGroup] = Field(
        default_factory=list,
        description="Retrieval groups organizing topics for efficient search"
    )
    article_limit_per_week: Optional[int] = Field(None, description="Maximum articles per week")


class PresentationConfig(BaseModel):
    """Layer 3: Configuration for organizing and presenting results"""
    categories: List[Category] = Field(description="How to organize results in reports")


class ResearchStream(BaseModel):
    """Research stream with clean three-layer architecture"""
    # === CORE IDENTITY ===
    stream_id: int
    user_id: int
    stream_name: str
    purpose: str = Field(description="High-level why this stream exists")

    # === THREE-LAYER ARCHITECTURE ===

    # Layer 1: SEMANTIC SPACE - What information matters (source-agnostic ground truth)
    semantic_space: SemanticSpace = Field(description="Layer 1: Semantic space definition (ground truth)")

    # Layer 2: RETRIEVAL CONFIG - How to find & filter content
    retrieval_config: RetrievalConfig = Field(description="Layer 2: Content retrieval and filtering configuration")

    # Layer 3: PRESENTATION CONFIG - How to organize results for users
    presentation_config: PresentationConfig = Field(description="Layer 3: Result organization and presentation")

    # === METADATA ===
    report_frequency: ReportFrequency
    is_active: bool = True
    created_at: datetime = Field(description="ISO 8601 datetime")
    updated_at: datetime = Field(description="ISO 8601 datetime")

    # === AGGREGATED DATA ===
    report_count: Optional[int] = Field(0, description="Number of reports generated")
    latest_report_date: Optional[str] = Field(None, description="ISO 8601 date string of latest report")

    class Config:
        from_attributes = True


# ============================================================================
# Executive Summary
# ============================================================================
