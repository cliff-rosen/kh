"""
Workbench Core Schemas

Core business object schemas for the workbench functionality
These must align exactly with the frontend types in workbench.ts
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

from schemas.canonical_types import CanonicalResearchArticle
from schemas.features import FeatureDefinition


# ================== FEATURE METADATA AND DATA STRUCTURES ==================

# FeatureDefinition is now imported from shared schemas.features module



# Note: Feature data is stored directly in ArticleGroupDetail.feature_data
# No separate column data structure needed

# ================== ARTICLE GROUP STRUCTURES ==================

class ArticleGroupDetail(BaseModel):
    """Individual article item within a group context - junction model"""
    id: str = Field(..., description="Unique detail record ID")
    article_id: str = Field(..., description="Article ID")
    group_id: str = Field(..., description="Group ID")
    article: CanonicalResearchArticle = Field(..., description="The article data")
    feature_data: Dict[str, Any] = Field(default_factory=dict, description="Extracted feature data keyed by feature.id")
    notes: Optional[str] = Field('', description="Article-specific notes")
    position: Optional[int] = Field(None, description="Position in the group")
    added_at: str = Field(..., description="When article was added to group")


class PaginationInfo(BaseModel):
    """Pagination metadata"""
    current_page: int = Field(..., description="Current page number")
    total_pages: int = Field(..., description="Total number of pages")
    total_results: int = Field(..., description="Total number of results")
    page_size: int = Field(..., description="Number of items per page")

class ArticleGroupWithDetails(BaseModel):
    """Complete article group with embedded articles - full group context"""
    id: str = Field(..., description="Group ID")
    name: str = Field(..., description="Group name")
    description: Optional[str] = Field(None, description="Group description")
    article_count: int = Field(..., description="Number of articles in group")
    feature_definitions: List[FeatureDefinition] = Field(..., description="Feature definitions")
    search_context: Optional[Dict[str, Any]] = Field(None, description="Search context")
    created_at: str = Field(..., description="Creation timestamp")
    updated_at: str = Field(..., description="Last update timestamp")
    articles: List[ArticleGroupDetail] = Field(..., description="Articles with feature data")
    pagination: Optional[PaginationInfo] = Field(None, description="Pagination metadata")


class ArticleGroup(BaseModel):
    """Base article group info - lightweight group metadata"""
    id: str = Field(..., description="Group ID")
    user_id: int = Field(..., description="Owner user ID")
    name: str = Field(..., description="Group name")
    description: Optional[str] = Field(None, description="Group description")
    search_query: Optional[str] = Field(None, description="Search query used")
    search_provider: Optional[str] = Field(None, description="Search provider used")
    search_params: Optional[Dict[str, Any]] = Field(None, description="Search parameters")
    feature_definitions: List[FeatureDefinition] = Field(default_factory=list, description="Feature definitions")
    article_count: int = Field(..., description="Number of articles in group")
    created_at: str = Field(..., description="Creation timestamp")
    updated_at: str = Field(..., description="Last update timestamp")


# ================== ARTICLE DETAIL RESPONSE ==================

class ArticleDetailResponse(BaseModel):
    """Response for getting a single article's full details within a group"""
    article: CanonicalResearchArticle = Field(..., description="The article data")
    notes: str = Field('', description="Article-specific notes")
    feature_data: Dict[str, Any] = Field(default_factory=dict, description="Extracted feature data")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Article metadata")
    position: Optional[int] = Field(None, description="Position in the group")
    group_id: str = Field(..., description="Group this article belongs to")
    group_name: str = Field(..., description="Name of the group")
    created_at: str = Field(..., description="When article was added to group")
    updated_at: Optional[str] = Field(None, description="Last update timestamp")

# ================== ADDITIONAL BACKEND TYPES ==================
# Note: These types exist only in the frontend:
# - WorkbenchState (frontend UI state)
# - ArticleGroupSummary (frontend display type)
# - ArticlePreview (frontend display type)
# - ExtractedFeature (individual article features)
# - AnalysisPreset (analysis presets)