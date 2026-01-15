"""
Research stream schemas for Knowledge Horizon - Category-based structure
Domain/Business objects only - no request/response types
"""

from pydantic import BaseModel, Field, computed_field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
from schemas.semantic_space import SemanticSpace
from schemas.report import ReportArticle


class StreamScope(str, Enum):
    """Scope of a research stream"""
    GLOBAL = "global"  # Platform-level, created by platform admins
    ORGANIZATION = "organization"  # Org-level, visible to subscribed org members
    PERSONAL = "personal"  # User-level, only visible to creator


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


class ExecutionStatus(str, Enum):
    """Status of a pipeline execution"""
    PENDING = "pending"       # Queued, waiting to start
    RUNNING = "running"       # Currently executing
    COMPLETED = "completed"   # Finished successfully, report created
    FAILED = "failed"         # Execution failed, no report


class RunType(str, Enum):
    """Type of pipeline run"""
    TEST = "test"             # Legacy: kept for backward compatibility
    SCHEDULED = "scheduled"   # Automated scheduled run
    MANUAL = "manual"         # Manual run triggered by user


class ScheduleConfig(BaseModel):
    """
    Complete scheduling configuration for a research stream.
    This is the single source of truth for all scheduling settings.
    """
    enabled: bool = Field(default=False, description="Whether automated scheduling is enabled")
    frequency: ReportFrequency = Field(default=ReportFrequency.WEEKLY, description="How often to run")
    anchor_day: Optional[str] = Field(
        default=None,
        description="Day to run on: 'monday'-'sunday' for weekly, or '1'-'31' for monthly"
    )
    preferred_time: str = Field(default="08:00", description="Time of day to run (HH:MM in user's timezone)")
    timezone: str = Field(default="UTC", description="User's timezone (e.g., 'America/New_York')")
    lookback_days: Optional[int] = Field(
        default=None,
        description="Days of articles to fetch. If not set, derived from frequency"
    )

    def get_lookback_days(self) -> int:
        """Get lookback days, defaulting based on frequency if not set"""
        if self.lookback_days is not None:
            return self.lookback_days
        return {
            ReportFrequency.DAILY: 1,
            ReportFrequency.WEEKLY: 7,
            ReportFrequency.BIWEEKLY: 14,
            ReportFrequency.MONTHLY: 30
        }.get(self.frequency, 7)


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


class ConceptEntity(BaseModel):
    """An entity defined during concept generation (Phase 1 analysis)"""
    entity_id: str = Field(description="Unique identifier (e.g., 'c_e1', 'c_e2')")
    name: str = Field(description="Entity name")
    entity_type: str = Field(
        description="Type: methodology, biomarker, disease, treatment, outcome, population, etc."
    )
    canonical_forms: List[str] = Field(description="Search terms for this entity (synonyms, abbreviations)")
    rationale: str = Field(description="Why this entity is needed for topic coverage")
    semantic_space_ref: Optional[str] = Field(
        None,
        description="Reference to semantic space entity_id if this maps to one (optional)"
    )


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
        description="List of entity_ids from phase1_analysis that form this pattern (1-3 entities)",
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

    # Vocabulary expansion (from phase1 entity definitions)
    vocabulary_terms: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Map: entity_id -> list of synonym terms (built from phase1 ConceptEntity.canonical_forms)"
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


class BroadQuery(BaseModel):
    """A broad, general search query designed to capture all relevant literature"""
    query_id: str = Field(description="Unique identifier for this query")
    search_terms: List[str] = Field(description="Core search terms (e.g., ['asbestos', 'mesothelioma'])")
    query_expression: str = Field(description="Boolean query expression usable as-is for PubMed (e.g., '(asbestos OR mesothelioma)')")
    rationale: str = Field(description="Why these terms capture all relevant literature")
    covered_topics: List[str] = Field(description="List of topic_ids this query covers")
    estimated_weekly_volume: Optional[int] = Field(
        None,
        description="Estimated number of articles per week this query retrieves"
    )

    # Optional semantic filtering
    semantic_filter: SemanticFilter = Field(
        default_factory=lambda: SemanticFilter(),
        description="Optional semantic filtering for this broad query"
    )


class BroadSearchStrategy(BaseModel):
    """
    Alternative retrieval strategy: broad, general searches that capture everything.

    Philosophy: Cast a wide net with simple searches, accept some false positives.
    Optimized for weekly literature monitoring where volume is naturally limited.
    """
    queries: List[BroadQuery] = Field(
        description="Usually 1-3 broad queries that together cover all topics"
    )
    strategy_rationale: str = Field(
        description="Overall explanation of why this broad approach covers the domain"
    )
    coverage_analysis: Dict[str, Any] = Field(
        default_factory=dict,
        description="Analysis of how queries cover topics"
    )


class RetrievalConfig(BaseModel):
    """Layer 2: Configuration for content retrieval and filtering"""
    concepts: Optional[List[Concept]] = Field(
        None,
        description="Concept-based retrieval (mutually exclusive with broad_search)"
    )
    broad_search: Optional[BroadSearchStrategy] = Field(
        None,
        description="Broad search retrieval (mutually exclusive with concepts)"
    )
    article_limit_per_week: Optional[int] = Field(
        None,
        description="Maximum articles per week (FUTURE FEATURE - not yet implemented in pipeline)"
    )

    def get_concepts_for_topic(self, topic_id: str) -> List[Concept]:
        """Get all concepts that cover a specific topic"""
        if not self.concepts:
            return []
        return [c for c in self.concepts if topic_id in c.covered_topics]

    def validate_coverage(self, semantic_space: SemanticSpace) -> Dict[str, Any]:
        """Check if all topics are covered by at least one concept"""
        covered = set()
        if self.concepts:
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


# ============================================================================
# Enrichment Configuration - Custom Prompts
# ============================================================================

class PromptTemplate(BaseModel):
    """A customizable prompt template with slug support"""
    system_prompt: str = Field(description="System prompt defining the LLM's role and guidelines")
    user_prompt_template: str = Field(
        description="User prompt template with slugs like {stream.purpose}, {articles.formatted}"
    )


class EnrichmentConfig(BaseModel):
    """
    Layer 4: Configuration for content enrichment (custom prompts).

    Slugs available for article_summary:
    - {stream.name} - Name of the research stream
    - {stream.purpose} - Purpose/description of the stream
    - {article.title} - Article title
    - {article.authors} - Article authors
    - {article.journal} - Journal name
    - {article.year} - Publication year
    - {article.abstract} - Article abstract

    Slugs available for category_summary:
    - {stream.name} - Name of the research stream
    - {stream.purpose} - Purpose/description of the stream
    - {category.name} - Name of the current category
    - {category.description} - Description of the category
    - {category.topics} - List of topics in this category
    - {articles.count} - Number of articles in this category
    - {articles.formatted} - Formatted list of articles in this category
    - {articles.summaries} - AI-generated summaries for articles in this category

    Slugs available for executive_summary:
    - {stream.name} - Name of the research stream
    - {stream.purpose} - Purpose/description of the stream
    - {articles.count} - Total number of articles
    - {articles.formatted} - Formatted list of articles (title, authors, journal, year, abstract)
    - {categories.count} - Number of categories
    - {categories.summaries} - Formatted category summaries
    """
    prompts: Dict[str, PromptTemplate] = Field(
        default_factory=dict,
        description="Custom prompts keyed by type: 'article_summary', 'category_summary', 'executive_summary'"
    )


class PipelineExecution(BaseModel):
    """
    Pipeline execution record - tracks each run attempt.
    This is the single source of truth for execution state.
    """
    id: str = Field(description="UUID primary key")
    stream_id: int
    status: ExecutionStatus = Field(default=ExecutionStatus.PENDING)
    run_type: RunType = Field(default=RunType.MANUAL)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    report_id: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class ResearchStream(BaseModel):
    """Research stream with clean three-layer architecture"""
    # === CORE IDENTITY ===
    stream_id: int
    scope: StreamScope = Field(default=StreamScope.PERSONAL, description="Stream visibility scope")
    org_id: Optional[int] = Field(None, description="Organization ID (NULL for global streams)")
    user_id: Optional[int] = Field(None, description="Owner user ID (only for personal streams)")
    created_by: Optional[int] = Field(None, description="User who created this stream")
    stream_name: str
    purpose: str = Field(description="High-level why this stream exists")

    # === THREE-LAYER ARCHITECTURE ===

    # Layer 1: SEMANTIC SPACE - What information matters (source-agnostic ground truth)
    semantic_space: SemanticSpace = Field(description="Layer 1: Semantic space definition (ground truth)")

    # Layer 2: RETRIEVAL CONFIG - How to find & filter content
    retrieval_config: RetrievalConfig = Field(description="Layer 2: Content retrieval and filtering configuration")

    # Layer 3: PRESENTATION CONFIG - How to organize results for users
    presentation_config: PresentationConfig = Field(description="Layer 3: Result organization and presentation")

    # Layer 4: ENRICHMENT CONFIG - Custom prompts for content generation (optional)
    enrichment_config: Optional[EnrichmentConfig] = Field(
        None,
        description="Layer 4: Custom prompts for summaries (None = use defaults)"
    )

    # === CHAT CONFIGURATION ===
    chat_instructions: Optional[str] = Field(
        None,
        description="Stream-specific instructions for the chat assistant (e.g., classification rules, domain expertise)"
    )

    # === METADATA ===
    is_active: bool = True
    created_at: datetime = Field(description="ISO 8601 datetime")
    updated_at: datetime = Field(description="ISO 8601 datetime")

    # === SCHEDULING ===
    schedule_config: Optional[ScheduleConfig] = Field(None, description="Scheduling configuration (frequency, timing, etc.)")
    next_scheduled_run: Optional[datetime] = Field(None, description="Pre-calculated next run time")
    last_execution_id: Optional[str] = Field(None, description="UUID of most recent pipeline execution")
    last_execution: Optional[PipelineExecution] = Field(None, description="Denormalized last execution (when included)")


    # === AGGREGATED DATA ===
    report_count: Optional[int] = Field(0, description="Number of reports generated")
    latest_report_date: Optional[str] = Field(None, description="ISO 8601 date string of latest report")

    class Config:
        from_attributes = True


# ============================================================================
# WIP Article (Pipeline Work-in-Progress)
# ============================================================================

class WipArticle(BaseModel):
    """Work-in-progress article during pipeline execution"""
    id: int
    title: str
    authors: List[str] = []
    journal: Optional[str] = None
    year: Optional[str] = None
    pmid: Optional[str] = None
    abstract: Optional[str] = None
    is_duplicate: bool = False
    duplicate_of_id: Optional[int] = None
    passed_semantic_filter: Optional[bool] = None
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None
    included_in_report: bool = False
    # Curation override fields (audit trail)
    curator_included: bool = False
    curator_excluded: bool = False  # On WipArticle - records curator decision
    curation_notes: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================================
# Operations Domain Objects (Execution Queue & Scheduler)
# ============================================================================

class ExecutionQueueItem(BaseModel):
    """
    Pipeline execution with associated report info.
    Domain object representing an item in the execution queue.
    """
    execution_id: str
    stream_id: int
    stream_name: str
    execution_status: ExecutionStatus
    run_type: RunType
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    # Report info (only for completed executions)
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    approval_status: Optional[str] = None
    article_count: Optional[int] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    # Curation info (for approval queue)
    filtered_out_count: Optional[int] = None
    has_curation_edits: Optional[bool] = None
    last_curated_by: Optional[str] = None

    class Config:
        from_attributes = True


class StreamOption(BaseModel):
    """Stream info for filter dropdowns"""
    stream_id: int
    stream_name: str


class CategoryCount(BaseModel):
    """Category with article count"""
    id: str
    name: str
    article_count: int


class ExecutionDetail(BaseModel):
    """
    Full execution details for review.
    Domain object representing everything needed to review an execution.
    """
    # Execution info
    execution_id: str
    stream_id: int
    stream_name: str
    execution_status: ExecutionStatus
    run_type: RunType
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    wip_articles: List[WipArticle] = []
    # Retrieval configuration (from execution record)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    retrieval_config: Optional[Dict[str, Any]] = None
    # Report info
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    approval_status: Optional[str] = None
    article_count: int = 0
    executive_summary: Optional[str] = None
    category_summaries: Optional[Dict[str, str]] = None
    categories: List[CategoryCount] = []
    articles: List["ReportArticle"] = []  # Forward ref to schemas.report
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    class Config:
        from_attributes = True


class LastExecution(BaseModel):
    """Last execution summary for scheduler display"""
    id: str
    stream_id: int
    status: ExecutionStatus
    run_type: RunType
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    report_id: Optional[int] = None
    report_approval_status: Optional[str] = None
    article_count: Optional[int] = None

    class Config:
        from_attributes = True


class ScheduledStreamSummary(BaseModel):
    """Stream with schedule config and last execution for scheduler view"""
    stream_id: int
    stream_name: str
    schedule_config: ScheduleConfig
    next_scheduled_run: Optional[datetime] = None
    last_execution: Optional[LastExecution] = None

    class Config:
        from_attributes = True


# ============================================================================
# Executive Summary
# ============================================================================
