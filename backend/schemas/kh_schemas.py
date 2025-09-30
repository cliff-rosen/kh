"""
Pydantic schemas for Knowledge Horizon
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from enum import Enum


# Enums (matching database enums)
class ReportFrequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"


class SourceType(str, Enum):
    JOURNAL = "journal"
    NEWS = "news"
    REGULATORY = "regulatory"
    CLINICAL = "clinical"
    PATENT = "patent"
    COMPANY = "company"
    PREPRINT = "preprint"
    CONFERENCE = "conference"


class FeedbackType(str, Enum):
    THUMBS_UP = "thumbs_up"
    THUMBS_DOWN = "thumbs_down"
    IRRELEVANT = "irrelevant"
    IMPORTANT = "important"


# ============================================================================
# ONBOARDING SCHEMAS
# ============================================================================

class OnboardingMessage(BaseModel):
    """Message in onboarding conversation"""
    role: str = Field(..., description="Message role (user/assistant)")
    content: str = Field(..., description="Message content")
    timestamp: Optional[datetime] = None


class OnboardingExtraction(BaseModel):
    """Extracted information from onboarding conversation"""
    full_name: str = Field(..., description="User's full name")
    job_title: str = Field(..., description="User's job title")
    company_name: str = Field(..., description="Company name")
    priorities: Optional[List[str]] = Field(default=[], description="User's stated priorities")
    additional_context: Optional[Dict[str, Any]] = Field(default={}, description="Additional extracted context")


class OnboardingSessionCreate(BaseModel):
    """Create a new onboarding session"""
    user_id: int
    conversation_history: List[OnboardingMessage] = []


class OnboardingSessionResponse(BaseModel):
    """Onboarding session response"""
    session_id: int
    user_id: int
    conversation_history: List[Dict[str, Any]]
    extracted_data: Dict[str, Any]
    completed_steps: List[str]
    is_complete: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# COMPANY PROFILE SCHEMAS
# ============================================================================

class CompanyProfileCreate(BaseModel):
    """Create a company profile"""
    user_id: int
    company_name: str
    job_title: str
    therapeutic_areas: List[str] = []
    pipeline_products: List[Dict[str, Any]] = []
    competitors: List[str] = []
    company_metadata: Dict[str, Any] = {}


class CompanyProfileUpdate(BaseModel):
    """Update a company profile"""
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    therapeutic_areas: Optional[List[str]] = None
    pipeline_products: Optional[List[Dict[str, Any]]] = None
    competitors: Optional[List[str]] = None
    company_metadata: Optional[Dict[str, Any]] = None


class CompanyProfileResponse(BaseModel):
    """Company profile response"""
    profile_id: int
    user_id: int
    company_name: str
    job_title: str
    therapeutic_areas: List[str]
    pipeline_products: List[Dict[str, Any]]
    competitors: List[str]
    company_metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CompanyResearchData(BaseModel):
    """Data from company research"""
    company_website: Optional[str] = None
    company_description: Optional[str] = None
    therapeutic_areas: List[str] = []
    pipeline_products: List[Dict[str, Any]] = []
    recent_news: List[Dict[str, Any]] = []
    competitors: List[str] = []
    key_personnel: List[Dict[str, str]] = []
    financial_info: Optional[Dict[str, Any]] = None


# ============================================================================
# CURATION MANDATE SCHEMAS
# ============================================================================

class CurationMandateCreate(BaseModel):
    """Create a curation mandate"""
    user_id: int
    profile_id: Optional[int] = None
    primary_focus: List[str] = []
    secondary_interests: List[str] = []
    competitors_to_track: List[str] = []
    regulatory_focus: List[str] = []
    scientific_domains: List[str] = []
    exclusions: List[str] = []


class CurationMandateUpdate(BaseModel):
    """Update a curation mandate"""
    primary_focus: Optional[List[str]] = None
    secondary_interests: Optional[List[str]] = None
    competitors_to_track: Optional[List[str]] = None
    regulatory_focus: Optional[List[str]] = None
    scientific_domains: Optional[List[str]] = None
    exclusions: Optional[List[str]] = None
    is_active: Optional[bool] = None


class CurationMandateResponse(BaseModel):
    """Curation mandate response"""
    mandate_id: int
    user_id: int
    profile_id: Optional[int]
    primary_focus: List[str]
    secondary_interests: List[str]
    competitors_to_track: List[str]
    regulatory_focus: List[str]
    scientific_domains: List[str]
    exclusions: List[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MandateGenerationRequest(BaseModel):
    """Request to generate a mandate from profile"""
    profile: CompanyProfileResponse
    research_data: Optional[CompanyResearchData] = None
    user_preferences: Optional[Dict[str, Any]] = None


# ============================================================================
# INFORMATION SOURCE SCHEMAS
# ============================================================================

class InformationSourceCreate(BaseModel):
    """Create an information source"""
    mandate_id: int
    source_type: SourceType
    source_name: str
    source_url: Optional[str] = None
    retrieval_config: Dict[str, Any] = {}
    search_queries: List[str] = []
    update_frequency: str = "daily"


class InformationSourceUpdate(BaseModel):
    """Update an information source"""
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    retrieval_config: Optional[Dict[str, Any]] = None
    search_queries: Optional[List[str]] = None
    update_frequency: Optional[str] = None
    is_active: Optional[bool] = None


class InformationSourceResponse(BaseModel):
    """Information source response"""
    source_id: int
    mandate_id: int
    source_type: SourceType
    source_name: str
    source_url: Optional[str]
    retrieval_config: Dict[str, Any]
    search_queries: List[str]
    update_frequency: str
    is_active: bool
    last_fetched: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class SourceRecommendation(BaseModel):
    """Recommended source for a mandate"""
    source_type: SourceType
    source_name: str
    source_url: Optional[str]
    relevance_score: float
    rationale: str
    suggested_queries: List[str]


# ============================================================================
# REPORT SCHEMAS
# ============================================================================

class ReportCreate(BaseModel):
    """Create a report"""
    user_id: int
    mandate_id: Optional[int] = None
    report_date: date
    executive_summary: str
    key_highlights: List[str] = []
    thematic_analysis: str
    coverage_stats: Dict[str, Any] = {}


class ReportResponse(BaseModel):
    """Report response"""
    report_id: int
    user_id: int
    mandate_id: Optional[int]
    report_date: date
    executive_summary: str
    key_highlights: List[str]
    thematic_analysis: str
    coverage_stats: Dict[str, Any]
    is_read: bool
    read_at: Optional[datetime]
    created_at: datetime
    article_count: Optional[int] = None

    class Config:
        from_attributes = True


class ReportListResponse(BaseModel):
    """List of reports"""
    reports: List[ReportResponse]
    total: int
    page: int = 1
    per_page: int = 20


# ============================================================================
# ARTICLE SCHEMAS
# ============================================================================

class ArticleCreate(BaseModel):
    """Create a standalone article"""
    source_id: Optional[int] = None
    title: str
    url: Optional[str] = None
    authors: List[str] = []
    publication_date: Optional[date] = None
    summary: Optional[str] = None
    ai_summary: Optional[str] = None
    source_type: Optional[SourceType] = None
    metadata: Dict[str, Any] = {}
    theme_tags: List[str] = []


class ArticleResponse(BaseModel):
    """Standalone article response"""
    article_id: int
    source_id: Optional[int]
    title: str
    url: Optional[str]
    authors: List[str]
    publication_date: Optional[date]
    summary: Optional[str]
    ai_summary: Optional[str]
    full_text: Optional[str]
    source_type: Optional[SourceType]
    metadata: Dict[str, Any]
    theme_tags: List[str]
    first_seen: datetime
    last_updated: datetime
    fetch_count: int

    class Config:
        from_attributes = True


class ArticleUpdate(BaseModel):
    """Update an article"""
    title: Optional[str] = None
    summary: Optional[str] = None
    ai_summary: Optional[str] = None
    full_text: Optional[str] = None
    theme_tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


# ============================================================================
# REPORT-ARTICLE ASSOCIATION SCHEMAS
# ============================================================================

class ReportArticleAssociationCreate(BaseModel):
    """Create a report-article association"""
    report_id: int
    article_id: int
    relevance_score: Optional[float] = None
    relevance_rationale: Optional[str] = None
    ranking: Optional[int] = None


class ReportArticleAssociationResponse(BaseModel):
    """Report-article association response"""
    report_id: int
    article_id: int
    relevance_score: Optional[float]
    relevance_rationale: Optional[str]
    ranking: Optional[int]
    user_feedback: Optional[FeedbackType]
    is_starred: bool
    is_read: bool
    notes: Optional[str]
    added_at: datetime
    read_at: Optional[datetime]

    class Config:
        from_attributes = True


class ReportArticleWithAssociation(BaseModel):
    """Article with its report-specific metadata"""
    # Article data
    article_id: int
    title: str
    url: Optional[str]
    authors: List[str]
    publication_date: Optional[date]
    summary: Optional[str]
    ai_summary: Optional[str]
    source_type: Optional[SourceType]
    theme_tags: List[str]

    # Report-specific data
    relevance_score: Optional[float]
    relevance_rationale: Optional[str]
    ranking: Optional[int]
    user_feedback: Optional[FeedbackType]
    is_starred: bool
    is_read: bool
    notes: Optional[str]
    added_at: datetime

    class Config:
        from_attributes = True


class ArticleFeedback(BaseModel):
    """Article feedback request"""
    article_id: int
    feedback_type: FeedbackType
    notes: Optional[str] = None


class ArticleRelevanceScore(BaseModel):
    """Article relevance scoring result"""
    article_id: Optional[int] = None
    title: str
    relevance_score: float
    relevance_rationale: str
    theme_tags: List[str]
    should_include: bool


class ArticleSearchFilters(BaseModel):
    """Filters for searching articles"""
    source_types: Optional[List[SourceType]] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    theme_tags: Optional[List[str]] = None
    search_query: Optional[str] = None


# ============================================================================
# SCHEDULE SCHEMAS
# ============================================================================

class ReportScheduleCreate(BaseModel):
    """Create a report schedule"""
    user_id: int
    frequency: ReportFrequency
    day_of_week: Optional[int] = Field(None, ge=0, le=6, description="0-6 for Monday-Sunday")
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    time_of_day: str = Field("08:00", regex="^([01]?[0-9]|2[0-3]):[0-5][0-9]$", description="HH:MM format")
    timezone: str = "UTC"

    @validator('day_of_week')
    def validate_day_of_week(cls, v, values):
        if values.get('frequency') == ReportFrequency.WEEKLY and v is None:
            raise ValueError('day_of_week required for weekly frequency')
        return v

    @validator('day_of_month')
    def validate_day_of_month(cls, v, values):
        if values.get('frequency') == ReportFrequency.MONTHLY and v is None:
            raise ValueError('day_of_month required for monthly frequency')
        return v


class ReportScheduleUpdate(BaseModel):
    """Update a report schedule"""
    frequency: Optional[ReportFrequency] = None
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    time_of_day: Optional[str] = Field(None, regex="^([01]?[0-9]|2[0-3]):[0-5][0-9]$")
    timezone: Optional[str] = None
    is_active: Optional[bool] = None
    is_paused: Optional[bool] = None


class ReportScheduleResponse(BaseModel):
    """Report schedule response"""
    schedule_id: int
    user_id: int
    frequency: ReportFrequency
    day_of_week: Optional[int]
    day_of_month: Optional[int]
    time_of_day: str
    timezone: str
    is_active: bool
    is_paused: bool
    next_run_at: Optional[datetime]
    last_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# FEEDBACK SCHEMAS
# ============================================================================

class UserFeedbackCreate(BaseModel):
    """Create user feedback"""
    user_id: int
    report_id: Optional[int] = None
    article_id: Optional[int] = None
    feedback_type: FeedbackType
    feedback_value: Optional[str] = None
    notes: Optional[str] = None

    @validator('report_id')
    def validate_feedback_target(cls, v, values):
        article_id = values.get('article_id')
        if (v is None and article_id is None) or (v is not None and article_id is not None):
            raise ValueError('Feedback must target either a report or an article, not both or neither')
        return v


class UserFeedbackResponse(BaseModel):
    """User feedback response"""
    feedback_id: int
    user_id: int
    report_id: Optional[int]
    article_id: Optional[int]
    feedback_type: FeedbackType
    feedback_value: Optional[str]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class FeedbackSummary(BaseModel):
    """Summary of user feedback"""
    total_feedback: int
    positive_count: int
    negative_count: int
    irrelevant_count: int
    important_count: int
    common_themes: List[str]
    suggestions: List[str]


# ============================================================================
# PIPELINE SCHEMAS
# ============================================================================

class PipelineConfig(BaseModel):
    """Configuration for report generation pipeline"""
    user_id: int
    mandate_id: int
    max_articles: int = 30
    relevance_threshold: float = 0.7
    include_sources: List[SourceType] = []
    exclude_sources: List[SourceType] = []
    date_range_days: int = 7


class PipelineResult(BaseModel):
    """Result from pipeline execution"""
    success: bool
    report_id: Optional[int] = None
    articles_retrieved: int
    articles_included: int
    execution_time: float
    errors: List[str] = []


# ============================================================================
# REPORT GENERATION SCHEMAS
# ============================================================================

class ReportGenerationRequest(BaseModel):
    """Request to generate a report"""
    user_id: int
    test_mode: bool = False
    date_range_days: int = 7
    max_articles: int = 30


class TestReportRequest(BaseModel):
    """Request to generate a test report"""
    mandate: CurationMandateResponse
    sources: List[InformationSourceResponse]
    date_range_days: int = 7
    max_articles: int = 15


class ReportSynthesis(BaseModel):
    """Synthesized report content"""
    executive_summary: str
    key_highlights: List[str]
    thematic_analysis: str
    themes_identified: List[Dict[str, Any]]
    coverage_summary: str