"""
Enhanced Research Stream Schemas - Phase 1 Implementation

Based on analysis of Palatin mandate documents, this module defines
enhanced schemas for research stream configuration that capture:
- Business purpose and goals
- Search keywords and strategy
- Scoring/relevance configuration

This represents Phase 1 of the enhancement roadmap.
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum


# ============================================================================
# Enums (same as existing)
# ============================================================================

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


# ============================================================================
# Phase 1: New Configuration Objects
# ============================================================================

class ScoringConfig(BaseModel):
    """
    Configuration for content relevance scoring and filtering.

    Based on Palatin Mandate 1 scoring system:
    - Relevance score (1-10) weighted at 60%
    - Evidence quality score (1-10) weighted at 40%
    - Integrated threshold for inclusion
    """
    relevance_weight: float = Field(
        default=0.6,
        ge=0.0,
        le=1.0,
        description="Weight for relevance score (0-1, default 0.6 = 60%)"
    )
    evidence_weight: float = Field(
        default=0.4,
        ge=0.0,
        le=1.0,
        description="Weight for evidence quality score (0-1, default 0.4 = 40%)"
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
        description="Maximum items per report unless exceptional relevance"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "relevance_weight": 0.6,
                "evidence_weight": 0.4,
                "inclusion_threshold": 7.0,
                "max_items_per_report": 10
            }
        }


# ============================================================================
# Phase 1: Enhanced Research Stream Schema
# ============================================================================

class EnhancedResearchStreamCreate(BaseModel):
    """
    Enhanced research stream creation request with Phase 1 additions.
    All Phase 1 fields are optional for backwards compatibility.
    """
    # ===== Existing Core Fields =====
    stream_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    stream_type: StreamType
    focus_areas: List[str] = Field(default_factory=list)
    competitors: List[str] = Field(default_factory=list)
    report_frequency: ReportFrequency

    # ===== Phase 1: Purpose and Business Context =====
    purpose: Optional[str] = Field(
        default=None,
        description="Why this stream exists - what decisions it will inform"
    )
    business_goals: Optional[List[str]] = Field(
        default=None,
        description="Strategic objectives this stream supports"
    )
    expected_outcomes: Optional[str] = Field(
        default=None,
        description="What outcomes/decisions this intelligence will drive"
    )

    # ===== Phase 1: Search Strategy Basics =====
    keywords: Optional[List[str]] = Field(
        default=None,
        description="Explicit search keywords to use when querying literature databases (e.g., 'melanocortin', 'MCR4', 'obesity')"
    )

    # ===== Phase 1: Scoring Configuration =====
    scoring_config: Optional[ScoringConfig] = Field(
        default=None,
        description="Configuration for relevance scoring and content filtering"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "stream_name": "Palatin Melanocortin Research Intelligence",
                "description": "Weekly scientific literature monitoring for melanocortin pathway research",
                "stream_type": "scientific",
                "focus_areas": [
                    "Obesity",
                    "Dry Eye Disease",
                    "Sexual Dysfunction",
                    "Ocular Disease"
                ],
                "competitors": [
                    "Rhythm Pharmaceuticals",
                    "Novo Nordisk"
                ],
                "report_frequency": "weekly",
                "purpose": "Monitor scientific literature on melanocortin pathways to identify opportunities and risks for Palatin's drug development programs",
                "business_goals": [
                    "Inform design of ongoing MCR4 obesity studies",
                    "Track competitive landscape in melanocortin space",
                    "Identify new indications for melanocortin therapies"
                ],
                "expected_outcomes": "Enable informed decisions on study design, competitive positioning, and pipeline prioritization",
                "keywords": [
                    "melanocortin",
                    "MCR1",
                    "MCR4",
                    "bremelanotide",
                    "PL7737",
                    "obesity",
                    "dry eye disease",
                    "female sexual dysfunction",
                    "glaucoma",
                    "retinal disease"
                ],
                "scoring_config": {
                    "relevance_weight": 0.6,
                    "evidence_weight": 0.4,
                    "inclusion_threshold": 7.0,
                    "max_items_per_report": 10
                }
            }
        }


class EnhancedResearchStreamUpdate(BaseModel):
    """Update request for enhanced research stream - all fields optional"""
    stream_name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    stream_type: Optional[StreamType] = None
    focus_areas: Optional[List[str]] = None
    competitors: Optional[List[str]] = None
    report_frequency: Optional[ReportFrequency] = None
    is_active: Optional[bool] = None

    # Phase 1 additions
    purpose: Optional[str] = None
    business_goals: Optional[List[str]] = None
    expected_outcomes: Optional[str] = None
    keywords: Optional[List[str]] = None
    scoring_config: Optional[ScoringConfig] = None


class EnhancedResearchStream(BaseModel):
    """
    Complete enhanced research stream response object.
    Includes all Phase 1 enhancements.
    """
    # Core fields
    stream_id: int
    user_id: int
    stream_name: str
    description: Optional[str] = None
    stream_type: StreamType
    focus_areas: List[str] = Field(default_factory=list)
    competitors: List[str] = Field(default_factory=list)
    report_frequency: ReportFrequency
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    # Phase 1: Purpose and Business Context
    purpose: Optional[str] = None
    business_goals: Optional[List[str]] = None
    expected_outcomes: Optional[str] = None

    # Phase 1: Search Strategy
    keywords: Optional[List[str]] = None

    # Phase 1: Scoring Configuration
    scoring_config: Optional[ScoringConfig] = None

    # Optional: Aggregated data (when fetched with counts)
    report_count: Optional[int] = 0
    latest_report_date: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================================
# Partial Config for AI-Guided Chat (Phase 1 Enhanced)
# ============================================================================

class PartialStreamConfigEnhanced(BaseModel):
    """
    Partial stream configuration for AI-guided creation.
    All fields optional - supports incremental collection during chat.
    Enhanced with Phase 1 fields.
    """
    # Core fields (existing)
    stream_name: Optional[str] = None
    description: Optional[str] = None
    stream_type: Optional[str] = None
    focus_areas: Optional[List[str]] = None
    competitors: Optional[List[str]] = None
    report_frequency: Optional[str] = None

    # Phase 1: Purpose and Context
    purpose: Optional[str] = None
    business_goals: Optional[List[str]] = None
    expected_outcomes: Optional[str] = None

    # Phase 1: Search Strategy
    keywords: Optional[List[str]] = None

    # Phase 1: Scoring (as dict for flexibility during chat)
    scoring_config: Optional[dict] = None

    class Config:
        json_schema_extra = {
            "example": {
                "stream_name": "Palatin Melanocortin Research Intelligence",
                "description": "Weekly scientific literature monitoring for melanocortin pathway research",
                "stream_type": "scientific",
                "focus_areas": [
                    "Obesity",
                    "Dry Eye Disease",
                    "Sexual Dysfunction",
                    "Ocular Disease"
                ],
                "competitors": [
                    "Rhythm Pharmaceuticals",
                    "Novo Nordisk"
                ],
                "report_frequency": "weekly",
                "purpose": "Monitor scientific literature on melanocortin pathways to identify opportunities and risks for Palatin's drug development programs",
                "business_goals": [
                    "Inform design of ongoing MCR4 obesity studies",
                    "Track competitive landscape in melanocortin space",
                    "Identify new indications for melanocortin therapies"
                ],
                "expected_outcomes": "Enable informed decisions on study design, competitive positioning, and pipeline prioritization",
                "keywords": [
                    "melanocortin",
                    "MCR1",
                    "MCR4",
                    "bremelanotide",
                    "PL7737",
                    "obesity",
                    "dry eye disease",
                    "female sexual dysfunction",
                    "glaucoma",
                    "retinal disease"
                ],
                "scoring_config": {
                    "relevance_weight": 0.6,
                    "evidence_weight": 0.4,
                    "inclusion_threshold": 7.0,
                    "max_items_per_report": 10
                }
            }
        }
