"""
Research Stream schemas for Knowledge Horizon

Organized to mirror frontend types/research-stream.ts for easy cross-reference.
Section order:
  1. Enums
  2. Scheduling
  3. Layer 2: Retrieval Config
  4. Layer 3: Presentation Config
  5. Layer 4: Enrichment Config
  6. Pipeline Execution
  7. Research Stream (main type)
  8. Derived Types (views, summaries, queue items)
"""

from pydantic import BaseModel, Field, computed_field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
from schemas.semantic_space import SemanticSpace
from schemas.report import ReportArticle

# ============================================================================
# ENUMS
# ============================================================================

class StreamScope(str, Enum):
    """Scope of a research stream"""
    GLOBAL = "global"
    ORGANIZATION = "organization"
    PERSONAL = "personal"


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
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class RunType(str, Enum):
    """Type of pipeline run"""
    TEST = "test"
    SCHEDULED = "scheduled"
    MANUAL = "manual"



# ============================================================================
# SCHEDULING
# ============================================================================

class ScheduleConfig(BaseModel):
    """Complete scheduling configuration for a research stream."""
    enabled: bool = Field(default=False, description="Whether automated scheduling is enabled")
    frequency: ReportFrequency = Field(default=ReportFrequency.WEEKLY, description="How often to run")
    anchor_day: Optional[str] = Field(None, description="Day to run pipeline: 'monday'-'sunday' for weekly, or '1'-'28' for monthly")
    preferred_time: str = Field(default="08:00", description="Time of day to run pipeline (HH:MM)")
    timezone: str = Field(default="UTC", description="Timezone for all times (e.g., 'America/New_York')")
    send_day: Optional[str] = Field(None, description="Earliest day to send: 'monday'-'sunday' for weekly, or '1'-'28' for monthly")
    send_time: Optional[str] = Field(None, description="Earliest time to send (HH:MM). Report sends when both time gate and approval gate are met.")

    def get_lookback_days(self) -> int:
        """Get lookback days derived from frequency."""
        return {
            ReportFrequency.DAILY: 1,
            ReportFrequency.WEEKLY: 7,
            ReportFrequency.BIWEEKLY: 14,
            ReportFrequency.MONTHLY: 30
        }.get(self.frequency, 7)


# ============================================================================
# LAYER 2: RETRIEVAL CONFIG
# ============================================================================

class SemanticFilter(BaseModel):
    """Semantic filtering configuration"""
    enabled: bool = Field(default=False, description="Whether semantic filtering is enabled")
    criteria: str = Field(default="", description="Text description of what should pass/fail")
    threshold: float = Field(default=0.7, ge=0.0, le=1.0, description="Confidence threshold (0.0 to 1.0)")


class BroadQuery(BaseModel):
    """A broad, general search query designed to capture all relevant literature"""
    query_id: str = Field(description="Unique identifier for this query")
    source_id: int = Field(description="ID of the information source (e.g., 1 for PubMed)")
    search_terms: List[str] = Field(description="Core search terms (e.g., ['asbestos', 'mesothelioma'])")
    query_expression: str = Field(description="Boolean query expression for the specified source")
    rationale: str = Field(description="Why these terms capture all relevant literature")
    covered_topics: List[str] = Field(description="List of topic_ids this query covers")
    estimated_weekly_volume: Optional[int] = Field(None, description="Estimated number of articles per week")
    semantic_filter: SemanticFilter = Field(default_factory=lambda: SemanticFilter(), description="Optional semantic filtering for this broad query")


class BroadSearchStrategy(BaseModel):
    """Alternative retrieval strategy: broad, general searches that capture everything."""
    queries: List[BroadQuery] = Field(description="Usually 1-3 broad queries that together cover all topics")
    strategy_rationale: str = Field(description="Overall explanation of why this broad approach covers the domain")
    coverage_analysis: Dict[str, Any] = Field(default_factory=dict, description="Analysis of how queries cover topics")


class WebSource(BaseModel):
    """A website to monitor for new content (RSS/Atom feed or agent-driven site exploration)"""
    source_id: str = Field(description="Unique identifier for this web source (e.g., 'ws_1', 'ws_2')")
    url: str = Field(description="Website URL to monitor (e.g., 'https://openai.com/blog')")
    source_type: str = Field(default="site", description="Source type: 'feed' (RSS/Atom) or 'site' (agent-driven). Set at config-time validation.")
    directive: str = Field(description="What content to look for (e.g., 'New product announcements and research papers')")
    title: Optional[str] = Field(None, description="Site/feed title from validation")
    site_memo: Optional[str] = Field(None, description="Agent-learned navigation context (site type only)")
    enabled: bool = Field(default=True, description="Whether this source is active")


class WebSourceConfig(BaseModel):
    """Configuration for web source monitoring"""
    sources: List[WebSource] = Field(default_factory=list, description="List of websites to monitor")
    max_articles_per_source: int = Field(default=20, description="Max items to retrieve per source per run")


class RetrievalConfig(BaseModel):
    """Layer 2: Configuration for content retrieval and filtering"""
    broad_search: Optional[BroadSearchStrategy] = Field(None, description="Broad search retrieval strategy")
    web_sources: Optional[WebSourceConfig] = Field(None, description="Web source monitoring (RSS feeds and HTML scraping)")
    article_limit_per_week: Optional[int] = Field(None, description="Maximum articles per week")


# ============================================================================
# LAYER 3: PRESENTATION CONFIG
# ============================================================================

class Category(BaseModel):
    """A category within a research stream"""
    id: str = Field(description="Unique identifier for this category")
    name: str = Field(description="Display name for the category")
    topics: List[str] = Field(description="List of topic_ids from semantic space covered by this category")
    specific_inclusions: List[str] = Field(default_factory=list, description="Category-specific inclusion criteria")


class CategorizationPrompt(BaseModel):
    """Custom prompt for article categorization"""
    system_prompt: str = Field(description="System prompt defining the LLM's role for categorization")
    user_prompt_template: str = Field(description="User prompt template with slugs: {title}, {abstract}, {journal}, {publication_date}, {categories_json}")


class PresentationConfig(BaseModel):
    """Layer 3: Configuration for organizing and presenting results"""
    categories: List[Category] = Field(description="How to organize results in reports")
    categorization_prompt: Optional[CategorizationPrompt] = Field(None, description="Custom prompt for article categorization (None = use defaults)")


# ============================================================================
# LAYER 4: ENRICHMENT CONFIG
# ============================================================================

class PromptTemplate(BaseModel):
    """A customizable prompt template with slug support"""
    system_prompt: str = Field(description="System prompt defining the LLM's role and guidelines")
    user_prompt_template: str = Field(description="User prompt template with slugs like {stream.purpose}, {articles.formatted}")


class EnrichmentConfig(BaseModel):
    """
    Layer 4: Configuration for content enrichment (custom prompts).

    Slugs available for article_summary:
    - {stream.name}, {stream.purpose}
    - {article.title}, {article.authors}, {article.journal}, {article.publication_date}, {article.abstract}

    Slugs available for category_summary:
    - {stream.name}, {stream.purpose}
    - {category.name}, {category.description}, {category.topics}
    - {articles.count}, {articles.formatted}, {articles.summaries}

    Slugs available for executive_summary:
    - {stream.name}, {stream.purpose}
    - {articles.count}, {articles.formatted}
    - {categories.count}, {categories.summaries}
    """
    prompts: Dict[str, PromptTemplate] = Field(default_factory=dict, description="Custom prompts keyed by type: 'article_summary', 'category_summary', 'executive_summary'")


# ============================================================================
# ARTICLE ANALYSIS CONFIG (Stance Analysis)
# ============================================================================

class ArticleAnalysisConfig(BaseModel):
    """
    Configuration for article-level analysis features.

    Contains:
    - stance_analysis_prompt: Custom prompt for stance/position analysis

    Note: chat_instructions are now stored in the chat_config table (admin only).

    Slugs available for stance_analysis:
    - {stream.name}, {stream.purpose}
    - {article.title}, {article.authors}, {article.journal}, {article.publication_date}, {article.abstract}
    """
    stance_analysis_prompt: Optional[PromptTemplate] = Field(
        None,
        description="Custom prompt for stance analysis (None = use defaults)"
    )


# ============================================================================
# MODEL CONFIGURATION (LLM Selection)
# ============================================================================

from schemas.llm import (
    ModelConfig,
    StageConfig,
    ReasoningEffort,
    PipelineLLMConfig,
    DEFAULT_MODEL_CONFIG,
    DEFAULT_STAGE_CONFIG,
    DEFAULT_PIPELINE_CONFIG,
    get_stage_config,
)


# ============================================================================
# PIPELINE EXECUTION
# ============================================================================

class PipelineExecution(BaseModel):
    """Pipeline execution record - tracks each run attempt."""
    id: str = Field(description="UUID primary key")
    stream_id: int
    status: ExecutionStatus = Field(default=ExecutionStatus.PENDING)
    run_type: RunType = Field(default=RunType.MANUAL)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    report_id: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    enrichment_config: Optional[EnrichmentConfig] = Field(None, description="Snapshot of custom prompts at execution time")
    llm_config: Optional[PipelineLLMConfig] = Field(None, description="Snapshot of LLM configuration at execution time")

    class Config:
        from_attributes = True


class WipArticle(BaseModel):
    """Work-in-progress article during pipeline execution"""
    id: int
    title: str
    authors: List[str] = []
    journal: Optional[str] = None
    # Honest date fields
    pub_year: Optional[int] = None
    pub_month: Optional[int] = None
    pub_day: Optional[int] = None
    pmid: Optional[str] = None
    abstract: Optional[str] = None
    is_duplicate: bool = False
    duplicate_of_id: Optional[int] = None
    passed_semantic_filter: Optional[bool] = None
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None
    included_in_report: bool = False
    curator_included: bool = False
    curator_excluded: bool = False
    curation_notes: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================================
# RESEARCH STREAM (Main Type)
# ============================================================================

class ResearchStream(BaseModel):
    """
    Research stream configuration.

    Organized into sections that mirror the frontend TypeScript type
    for easy cross-reference between backend and frontend code.
    """
    # === CORE IDENTITY ===
    stream_id: int
    stream_name: str
    purpose: str = Field(description="High-level why this stream exists")

    # === SCOPE & OWNERSHIP ===
    scope: StreamScope = Field(default=StreamScope.PERSONAL, description="Stream visibility scope")
    org_id: Optional[int] = Field(None, description="Organization ID (NULL for global streams)")
    user_id: Optional[int] = Field(None, description="Owner user ID (only for personal streams)")
    created_by: Optional[int] = Field(None, description="User who created this stream")

    # === FOUR-LAYER ARCHITECTURE ===
    # Layer 1: SEMANTIC SPACE (imported from schemas.semantic_space)
    semantic_space: SemanticSpace = Field(description="Layer 1: Semantic space definition")
    # Layer 2: RETRIEVAL CONFIG
    retrieval_config: RetrievalConfig = Field(description="Layer 2: Content retrieval and filtering")
    # Layer 3: PRESENTATION CONFIG
    presentation_config: PresentationConfig = Field(description="Layer 3: Result organization")
    # Layer 4: ENRICHMENT CONFIG
    enrichment_config: Optional[EnrichmentConfig] = Field(None, description="Layer 4: Custom prompts for summaries")

    # === ARTICLE ANALYSIS ===
    article_analysis_config: Optional[ArticleAnalysisConfig] = Field(None, description="Article analysis config: stance analysis prompt")

    # === CONTROL PANEL ===
    llm_config: Optional[PipelineLLMConfig] = Field(None, description="LLM configuration for pipeline stages")

    # === SCHEDULING ===
    schedule_config: Optional[ScheduleConfig] = Field(None, description="Scheduling configuration")
    next_scheduled_run: Optional[datetime] = Field(None, description="Pre-calculated next run time")
    last_execution_id: Optional[str] = Field(None, description="UUID of most recent pipeline execution")
    last_execution: Optional[PipelineExecution] = Field(None, description="Denormalized last execution")

    # === METADATA ===
    is_active: bool = True
    created_at: datetime = Field(description="ISO 8601 datetime")
    updated_at: datetime = Field(description="ISO 8601 datetime")

    # === AGGREGATED DATA ===
    report_count: Optional[int] = Field(0, description="Number of reports generated")
    latest_report_date: Optional[str] = Field(None, description="ISO 8601 date string of latest report")

    class Config:
        from_attributes = True


# ============================================================================
# DERIVED TYPES (Views, Summaries, Queue Items)
# ============================================================================

class StreamOption(BaseModel):
    """Stream info for filter dropdowns"""
    stream_id: int
    stream_name: str


class CategoryCount(BaseModel):
    """Category with article count"""
    id: str
    name: str
    article_count: int


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


class ExecutionQueueItem(BaseModel):
    """Pipeline execution with associated report info."""
    execution_id: str
    stream_id: int
    stream_name: str
    execution_status: ExecutionStatus
    run_type: RunType
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    approval_status: Optional[str] = None
    article_count: Optional[int] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    filtered_out_count: Optional[int] = None
    has_curation_edits: Optional[bool] = None
    last_curated_by: Optional[str] = None

    class Config:
        from_attributes = True


class ExecutionDetail(BaseModel):
    """Full execution details for review."""
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
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    retrieval_config: Optional[Dict[str, Any]] = None
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    approval_status: Optional[str] = None
    article_count: int = 0
    executive_summary: Optional[str] = None
    category_summaries: Optional[Dict[str, str]] = None
    categories: List[CategoryCount] = []
    articles: List["ReportArticle"] = []
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

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
