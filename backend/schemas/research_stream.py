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
# Retrieval Configuration - Concept-Based
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


class VolumeStatus(str, Enum):
    """Volume assessment for a concept"""
    TOO_BROAD = "too_broad"      # > 1000 results/week
    APPROPRIATE = "appropriate"   # 10-1000 results/week
    TOO_NARROW = "too_narrow"     # < 10 results/week
    UNKNOWN = "unknown"           # Not yet tested


class RelationshipEdge(BaseModel):
    """A directed edge in the concept's entity relationship graph"""
    from_entity_id: str = Field(description="Source entity_id from entity_pattern")
    to_entity_id: str = Field(description="Target entity_id from entity_pattern")
    relation_type: str = Field(
        description="Type of relationship (e.g., 'causes', 'measures', 'detects', 'treats', 'induces')"
    )


class Concept(BaseModel):
    """
    A searchable entity-relationship pattern that covers one or more topics.

    Based on framework:
    - Single inclusion pattern (entities in relationships)
    - Vocabulary expansion within entities (not across patterns)
    - Volume-driven refinement
    - Minimal exclusions
    """
    concept_id: str = Field(description="Unique identifier for this concept")
    name: str = Field(description="Descriptive name for this concept")

    # Core pattern (entities and their relationships)
    entity_pattern: List[str] = Field(
        description="List of entity_ids that form this pattern (1-3 entities)",
        min_length=1,
        max_length=3,
        default_factory=list
    )

    # RIGOROUS relationship graph (machine-parseable)
    relationship_edges: List[RelationshipEdge] = Field(
        description="Directed edges defining how entities connect in the graph",
        default_factory=list
    )

    # HUMAN-READABLE relationship description
    relationship_description: str = Field(
        default="",
        description="Natural language description of entity relationships for human understanding"
    )

    # DEPRECATED: Kept for backward compatibility during migration
    relationship_pattern: Optional[str] = Field(
        None,
        description="DEPRECATED: Use relationship_edges and relationship_description instead"
    )

    # Coverage (many-to-many with topics)
    covered_topics: List[str] = Field(
        description="List of topic_ids from semantic space this concept covers"
    )

    # Vocabulary expansion (synonyms/variants per entity)
    vocabulary_terms: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Map: entity_id -> list of synonym terms (for OR clauses)"
    )

    # Volume tracking and refinement
    expected_volume: Optional[int] = Field(
        None,
        description="Estimated weekly article count"
    )
    volume_status: VolumeStatus = Field(
        default=VolumeStatus.UNKNOWN,
        description="Assessment of query volume"
    )
    last_volume_check: Optional[datetime] = Field(
        None,
        description="When volume was last checked"
    )

    # Queries per source
    source_queries: Dict[str, SourceQuery] = Field(
        default_factory=dict,
        description="Map: source_id -> SourceQuery configuration"
    )

    # Semantic filtering (per concept)
    semantic_filter: SemanticFilter = Field(
        default_factory=lambda: SemanticFilter(),
        description="Semantic filtering for this concept"
    )

    # Exclusions (use sparingly!)
    exclusions: List[str] = Field(
        default_factory=list,
        description="Terms to exclude (last resort only)"
    )
    exclusion_rationale: Optional[str] = Field(
        None,
        description="Why exclusions are necessary and safe"
    )

    # Metadata
    rationale: str = Field(
        description="Why this concept pattern covers these topics"
    )
    human_edited: bool = Field(
        default=False,
        description="Whether human has modified LLM-generated concept"
    )


class RetrievalConfig(BaseModel):
    """Layer 2: Configuration for content retrieval and filtering"""
    concepts: List[Concept] = Field(
        default_factory=list,
        description="Concepts covering domain (union = complete coverage)"
    )
    article_limit_per_week: Optional[int] = Field(None, description="Maximum articles per week")

    def get_concepts_for_topic(self, topic_id: str) -> List[Concept]:
        """Get all concepts that cover a specific topic"""
        return [c for c in self.concepts if topic_id in c.covered_topics]

    def validate_coverage(self, semantic_space: SemanticSpace) -> Dict[str, Any]:
        """Check if all topics are covered by at least one concept"""
        covered = set()
        for concept in self.concepts:
            covered.update(concept.covered_topics)

        all_topics = {t.topic_id for t in semantic_space.topics}
        uncovered = all_topics - covered

        return {
            "is_complete": len(uncovered) == 0,
            "covered_topics": list(covered),
            "uncovered_topics": list(uncovered),
            "coverage_percentage": len(covered) / len(all_topics) * 100 if all_topics else 100
        }


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
