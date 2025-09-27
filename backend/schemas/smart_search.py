"""
Smart Search Schemas

Core domain models for the smart search feature.
These are shared data structures used across multiple services.
API-specific request/response models are defined in the router.
"""

from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from schemas.canonical_types import CanonicalResearchArticle

# Backend step names - single source of truth
BackendStepName = Literal[
    'question_input',
    'question_refinement', 
    'search_query_generation',
    'search_execution',
    'discriminator_generation',
    'filtering'
]

# Search keyword history tracking
ChangeType = Literal['system_generated', 'ai_optimized', 'user_edited']

class SearchKeywordHistoryItem(BaseModel):
    """Single search keyword history entry"""
    query: str = Field(..., description="The search query string")
    count: int = Field(..., description="Number of results returned")
    change_type: ChangeType = Field(..., description="How this query was created")
    refinement_details: Optional[str] = Field(None, description="Details for AI optimization")
    timestamp: str = Field(..., description="ISO timestamp when query was tested")


class SearchPaginationInfo(BaseModel):
    """Pagination information for search results"""
    total_available: int = Field(..., description="Total number of results available")
    returned: int = Field(..., description="Number of results returned in this request")
    offset: int = Field(..., description="Number of results skipped")
    has_more: bool = Field(..., description="Whether there are more results available")


class FilteredArticle(BaseModel):
    """Article with filtering results - core domain model"""
    article: CanonicalResearchArticle
    passed: bool = Field(..., description="Whether article passed the filter")
    confidence: float = Field(..., description="Confidence score 0-1")
    reasoning: str = Field(..., description="Brief explanation of decision")


class FilteringProgress(BaseModel):
    """Progress update for filtering operations"""
    total: int
    processed: int
    accepted: int
    rejected: int
    current_article: Optional[str] = None


class SearchServiceResult(BaseModel):
    """Result from search service methods"""
    articles: List[CanonicalResearchArticle]
    pagination: SearchPaginationInfo
    sources_searched: List[str]


class OptimizedKeywordsResult(BaseModel):
    """Result from generate_optimized_search_keywords service method"""
    initial_keywords: str  # was: initial_query
    initial_count: int
    final_keywords: str    # was: final_query
    final_count: int
    refinement_description: str
    status: str  # 'optimal' | 'refined' | 'manual_needed'


# ============================================================================
# Session Management Schemas
# ============================================================================

class SmartSearchSessionDict(BaseModel):
    """Complete session representation as returned by SmartSearchSession.to_dict()"""
    id: str
    user_id: str
    created_at: Optional[str]
    updated_at: Optional[str]
    original_question: str
    generated_evidence_spec: Optional[str]
    submitted_evidence_spec: Optional[str]
    generated_search_keywords: Optional[str]
    submitted_search_keywords: Optional[str]
    search_metadata: Optional[dict]
    articles_retrieved_count: int
    articles_selected_count: int
    generated_discriminator: Optional[str]
    submitted_discriminator: Optional[str]
    filter_strictness: Optional[str]
    filtering_metadata: Optional[dict]
    filtered_articles: Optional[List[FilteredArticle]]
    status: str
    last_step_completed: Optional[BackendStepName]
    session_duration_seconds: Optional[int]
    total_api_calls: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int


class SessionListResponse(BaseModel):
    """Response for session list endpoints"""
    sessions: List[SmartSearchSessionDict]
    total: int


class SessionResetResponse(BaseModel):
    """Response for session reset endpoint"""
    message: str
    session: SmartSearchSessionDict