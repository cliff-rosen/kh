"""
Unified Workbench API Router

Single API that handles both:
- Article group management (table view, bulk analysis) 
- Individual article research (deep dive, notes, features)

Delegates to separate services but provides unified API experience.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from models import User, UserCompanyProfile
from database import get_db
from schemas.workbench import (
    ArticleGroup, ArticleGroupDetail, ArticleGroupWithDetails,
    ArticleDetailResponse
)
from schemas.features import FeatureDefinition
from schemas.canonical_types import CanonicalResearchArticle

from services.auth_service import validate_token
from services.extraction_service import ExtractionService, get_extraction_service
from services.article_group_service import ArticleGroupService
from services.article_group_detail_service import ArticleGroupDetailService
from services.feature_preset_service import FeaturePresetService
from services.chat_quick_action_service import ChatQuickActionService

router = APIRouter(prefix="/workbench", tags=["workbench"])


# ================== REQUEST/RESPONSE MODELS ==================

# Article Group Management Requests
class CreateArticleGroupRequest(BaseModel):
    """Request to create a new article group"""
    name: str = Field(..., min_length=1, max_length=255, description="Group name")
    description: Optional[str] = Field(None, description="Group description")
    search_query: Optional[str] = Field(None, description="Search query used")
    search_provider: Optional[str] = Field(None, description="Search provider used")
    search_params: Optional[Dict[str, Any]] = Field(None, description="Search parameters")
    articles: Optional[List[CanonicalResearchArticle]] = Field(None, description="Articles to add to the group")
    feature_definitions: Optional[List[FeatureDefinition]] = Field(None, description="Feature definitions")

class UpdateArticleGroupRequest(BaseModel):
    """Request to update article group metadata and optionally sync full workbench state"""
    # Metadata fields
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Group name")
    description: Optional[str] = Field(None, description="Group description")
    feature_definitions: Optional[List[FeatureDefinition]] = Field(None, description="Feature definitions")
    
    # Full state sync fields (optional - when provided, performs complete workbench state synchronization)
    articles: Optional[List[CanonicalResearchArticle]] = Field(None, description="Articles with feature data (triggers full sync)")
    search_query: Optional[str] = Field(None, description="Search query used")
    search_provider: Optional[str] = Field(None, description="Search provider used")
    search_params: Optional[Dict[str, Any]] = Field(None, description="Search parameters")

class SaveToGroupRequest(BaseModel):
    """Request to save current workbench state to a group"""
    group_name: str = Field(..., min_length=1, max_length=255, description="Group name")
    group_description: Optional[str] = Field(None, description="Group description")
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles with extracted_features")
    feature_definitions: List[FeatureDefinition] = Field(..., description="Feature definitions")
    search_query: Optional[str] = Field(None, description="Search query used")
    search_provider: Optional[str] = Field(None, description="Search provider used")
    search_params: Optional[Dict[str, Any]] = Field(None, description="Search parameters")
    overwrite: bool = Field(False, description="Whether to replace existing data")

class AddArticlesRequest(BaseModel):
    """Request to add articles to an existing group"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles to add")

# Response Models
class ArticleGroupListResponse(BaseModel):
    """Response with list of article groups"""
    groups: List[ArticleGroup] = Field(..., description="List of groups")
    total: int = Field(..., description="Total number of groups")
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Number of items per page")
    total_pages: int = Field(..., description="Total number of pages")

class ArticleGroupDetailResponse(BaseModel):
    """Response wrapper for article group details"""
    group: ArticleGroupWithDetails = Field(..., description="Detailed group information")

class ArticleGroupSaveResponse(BaseModel):
    """Response after saving to a group"""
    success: bool = Field(..., description="Whether save was successful")
    message: str = Field(..., description="Success or error message")
    group_id: str = Field(..., description="ID of the saved group")
    articles_saved: int = Field(..., description="Number of articles saved")

class ArticleGroupDeleteResponse(BaseModel):
    """Response after deleting a group"""
    success: bool = Field(..., description="Whether deletion was successful")
    message: str = Field(..., description="Success or error message")
    deleted_group_id: str = Field(..., description="ID of the deleted group")
    deleted_articles_count: int = Field(..., description="Number of articles that were deleted")

# ================== WORKBENCH ANALYSIS MODELS ==================

# New Unified Extraction Models
class ExtractRequest(BaseModel):
    """Unified request to extract multiple features"""
    articles: List[Dict[str, str]]  # [{id, title, abstract}]
    features: List[FeatureDefinition]

class ExtractResponse(BaseModel):
    """Unified response with extracted feature data"""
    results: Dict[str, Dict[str, str]]  # article_id -> feature_name -> value
    metadata: Optional[Dict[str, Any]] = None

class FeaturePreset(BaseModel):
    """Pre-configured feature set"""
    id: str
    name: str
    description: str
    category: Optional[str] = None
    features: List[FeatureDefinition]

class FeaturePresetsResponse(BaseModel):
    """Response with available feature presets"""
    presets: List[FeaturePreset]

class CreateFeaturePresetRequest(BaseModel):
    """Request to create a new feature preset"""
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    features: List[FeatureDefinition]

class UpdateFeaturePresetRequest(BaseModel):
    """Request to update a feature preset"""
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    features: List[FeatureDefinition]

# Chat Quick Action Models
class QuickActionResponse(BaseModel):
    """Single chat quick action response"""
    id: str
    name: str
    prompt: str
    description: Optional[str] = None
    scope: str
    user_id: Optional[int] = None
    position: int

class QuickActionsResponse(BaseModel):
    """Response with available quick actions"""
    actions: List[QuickActionResponse]

class CreateQuickActionRequest(BaseModel):
    """Request to create a new quick action"""
    name: str
    prompt: str
    description: Optional[str] = None
    position: Optional[int] = None

class UpdateQuickActionRequest(BaseModel):
    """Request to update a quick action"""
    name: Optional[str] = None
    prompt: Optional[str] = None
    description: Optional[str] = None
    position: Optional[int] = None

# Company Profile Models
class CompanyProfileResponse(BaseModel):
    """Company profile response"""
    id: str
    user_id: int
    company_name: str
    company_description: Optional[str] = None
    business_focus: str
    research_interests: Optional[str] = None
    therapeutic_areas: Optional[str] = None
    key_compounds: Optional[str] = None
    pathways_of_interest: Optional[str] = None
    competitive_landscape: Optional[str] = None
    research_agent_role: str
    analysis_focus: Optional[str] = None

class UpdateCompanyProfileRequest(BaseModel):
    """Request to update company profile"""
    company_name: Optional[str] = None
    company_description: Optional[str] = None
    business_focus: Optional[str] = None
    research_interests: Optional[str] = None
    therapeutic_areas: Optional[str] = None
    key_compounds: Optional[str] = None
    pathways_of_interest: Optional[str] = None
    competitive_landscape: Optional[str] = None
    research_agent_role: Optional[str] = None
    analysis_focus: Optional[str] = None

class UpdateNotesRequest(BaseModel):
    """Request to update article notes"""
    notes: str

class UpdateMetadataRequest(BaseModel):
    """Request to update article metadata"""
    metadata: Dict[str, Any]

class ExtractFeatureRequest(BaseModel):
    """Request to extract a single feature using AI"""
    feature_name: str
    feature_type: str
    extraction_prompt: str

class BatchExtractFeaturesRequest(BaseModel):
    """Request to extract features for multiple articles"""
    article_ids: List[str]
    feature_name: str
    feature_type: str
    extraction_prompt: str

class BatchUpdateMetadataRequest(BaseModel):
    """Request to update metadata for multiple articles"""
    metadata_updates: Dict[str, Dict[str, Any]]  # article_id -> metadata

# ================== GROUP MANAGEMENT ENDPOINTS ==================

@router.get("/groups", response_model=ArticleGroupListResponse)
async def get_user_groups(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get paginated list of user's workbench groups."""
    group_service = ArticleGroupService(db)
    return group_service.get_user_groups(current_user.user_id, page, limit, search)


@router.post("/groups", response_model=ArticleGroup)
async def create_group(
    request: CreateArticleGroupRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Create a new workbench group."""
    group_service = ArticleGroupService(db)
    return group_service.create_group(current_user.user_id, request)


@router.get("/groups/{group_id}", response_model=ArticleGroupDetailResponse)
async def get_group_details(
    group_id: str,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific group with pagination."""
    group_service = ArticleGroupService(db)
    result = group_service.get_group_details(current_user.user_id, group_id, page, page_size)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found or access denied"
        )
    
    return ArticleGroupDetailResponse(group=result)


@router.put("/groups/{group_id}", response_model=ArticleGroup)
async def update_group(
    group_id: str,
    request: UpdateArticleGroupRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Update group metadata."""
    group_service = ArticleGroupService(db)
    result = group_service.update_group(current_user.user_id, group_id, request)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found or access denied"
        )
    
    return result


@router.delete("/groups/{group_id}", response_model=ArticleGroupDeleteResponse)
async def delete_group(
    group_id: str,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Delete a group and all its articles."""
    group_service = ArticleGroupService(db)
    result = group_service.delete_group(current_user.user_id, group_id)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found or access denied"
        )
    
    return result


@router.post("/groups/{group_id}/articles", response_model=ArticleGroupSaveResponse)
async def add_articles_to_group(
    group_id: str,
    request: AddArticlesRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Add articles to an existing group."""
    group_service = ArticleGroupService(db)
    result = group_service.add_articles_to_group(current_user.user_id, group_id, request)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found or access denied"
        )
    
    return result



# ================== ANALYSIS ENDPOINTS ==================

# New Unified Extraction Endpoints
@router.post("/extract", response_model=ExtractResponse)
async def extract_unified(
    request: ExtractRequest,
    current_user: User = Depends(validate_token),
    extraction_service: ExtractionService = Depends(get_extraction_service),
    db: Session = Depends(get_db)
):
    """Unified endpoint to extract multiple columns from articles in a single LLM call."""
    try:
        # Use ArticleGroupDetailService since it understands article structure
        detail_service = ArticleGroupDetailService(db, extraction_service)
        
        # Pass FeatureDefinition objects directly
        results = await detail_service.extract_features(
            request.articles, 
            request.features  # Pass FeatureDefinition objects directly
        )
        
        return ExtractResponse(
            results=results,
            metadata={"total_articles": len(request.articles), "total_features": len(request.features)}
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Feature extraction failed: {str(e)}"
        )


@router.get("/feature-presets", response_model=FeaturePresetsResponse)
async def get_feature_presets(
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get available feature presets for extraction (global + user's own)."""
    preset_service = FeaturePresetService(db)
    
    # Get all presets available to this user (global + their own)
    preset_dicts = preset_service.get_available_presets(user_id=current_user.user_id)
    
    # Convert to FeaturePreset response format
    presets = []
    for preset_dict in preset_dicts:
        # Convert features to FeatureDefinition objects
        features = [
            FeatureDefinition(
                id=f['id'],
                name=f['name'],
                description=f['description'],
                type=f['type'],
                options=f.get('options')
            )
            for f in preset_dict['features']
        ]
        
        preset = FeaturePreset(
            id=preset_dict['id'],
            name=preset_dict['name'],
            description=preset_dict['description'],
            category=preset_dict['category'],
            features=features
        )
        presets.append(preset)
    
    return FeaturePresetsResponse(presets=presets)


@router.post("/feature-presets", response_model=FeaturePreset)
async def create_feature_preset(
    request: CreateFeaturePresetRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Create a new user feature preset."""
    preset_service = FeaturePresetService(db)
    
    # Create the preset
    preset_dict = preset_service.create_preset(
        user_id=current_user.user_id,
        name=request.name,
        description=request.description,
        category=request.category,
        features=request.features
    )
    
    # Convert back to response format
    features = [
        FeatureDefinition(
            id=f['id'],
            name=f['name'],
            description=f['description'],
            type=f['type'],
            options=f.get('options')
        )
        for f in preset_dict['features']
    ]
    
    return FeaturePreset(
        id=preset_dict['id'],
        name=preset_dict['name'],
        description=preset_dict['description'],
        category=preset_dict['category'],
        features=features
    )


@router.put("/feature-presets/{preset_id}", response_model=FeaturePreset)
async def update_feature_preset(
    preset_id: str,
    request: UpdateFeaturePresetRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Update a user's feature preset."""
    preset_service = FeaturePresetService(db)
    
    # Update the preset
    preset_dict = preset_service.update_preset(
        preset_id=preset_id,
        user_id=current_user.user_id,
        name=request.name,
        description=request.description,
        category=request.category,
        features=request.features
    )
    
    if not preset_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preset not found or access denied"
        )
    
    # Convert back to response format
    features = [
        FeatureDefinition(
            id=f['id'],
            name=f['name'],
            description=f['description'],
            type=f['type'],
            options=f.get('options')
        )
        for f in preset_dict['features']
    ]
    
    return FeaturePreset(
        id=preset_dict['id'],
        name=preset_dict['name'],
        description=preset_dict['description'],
        category=preset_dict['category'],
        features=features
    )


@router.delete("/feature-presets/{preset_id}")
async def delete_feature_preset(
    preset_id: str,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Delete a user's feature preset."""
    preset_service = FeaturePresetService(db)
    
    success = preset_service.delete_preset(preset_id, current_user.user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preset not found or access denied"
        )
    
    return {"success": True, "message": "Preset deleted successfully"}


@router.post("/feature-presets/{preset_id}/duplicate", response_model=FeaturePreset)
async def duplicate_feature_preset(
    preset_id: str,
    name: Optional[str] = None,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Duplicate a preset (global or user's own) as a new user preset."""
    preset_service = FeaturePresetService(db)
    
    # Duplicate the preset
    preset_dict = preset_service.duplicate_preset(
        preset_id=preset_id,
        user_id=current_user.user_id,
        new_name=name
    )
    
    if not preset_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preset not found or access denied"
        )
    
    # Convert back to response format
    features = [
        FeatureDefinition(
            id=f['id'],
            name=f['name'],
            description=f['description'],
            type=f['type'],
            options=f.get('options')
        )
        for f in preset_dict['features']
    ]
    
    return FeaturePreset(
        id=preset_dict['id'],
        name=preset_dict['name'],
        description=preset_dict['description'],
        category=preset_dict['category'],
        features=features
    )


# ================== CHAT QUICK ACTION ENDPOINTS ==================

@router.get("/quick-actions", response_model=QuickActionsResponse)
async def get_quick_actions(
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get available chat quick actions for user (global + user's own)."""
    action_service = ChatQuickActionService(db)
    
    # Get all actions available to this user (global + their own)
    action_dicts = action_service.get_available_actions(user_id=current_user.user_id)
    
    # Convert to QuickActionResponse format
    actions = [
        QuickActionResponse(
            id=action_dict['id'],
            name=action_dict['name'],
            prompt=action_dict['prompt'],
            description=action_dict['description'],
            scope=action_dict['scope'],
            user_id=action_dict['user_id'],
            position=action_dict['position']
        )
        for action_dict in action_dicts
    ]
    
    return QuickActionsResponse(actions=actions)


@router.post("/quick-actions", response_model=QuickActionResponse)
async def create_quick_action(
    request: CreateQuickActionRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Create a new user quick action."""
    action_service = ChatQuickActionService(db)
    
    # Create the action
    action_dict = action_service.create_action(
        user_id=current_user.user_id,
        name=request.name,
        prompt=request.prompt,
        description=request.description,
        position=request.position
    )
    
    return QuickActionResponse(
        id=action_dict['id'],
        name=action_dict['name'],
        prompt=action_dict['prompt'],
        description=action_dict['description'],
        scope=action_dict['scope'],
        user_id=action_dict['user_id'],
        position=action_dict['position']
    )


@router.put("/quick-actions/{action_id}", response_model=QuickActionResponse)
async def update_quick_action(
    action_id: str,
    request: UpdateQuickActionRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Update a user's quick action."""
    action_service = ChatQuickActionService(db)
    
    # Update the action
    action_dict = action_service.update_action(
        action_id=action_id,
        user_id=current_user.user_id,
        name=request.name,
        prompt=request.prompt,
        description=request.description,
        position=request.position
    )
    
    if not action_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quick action not found or access denied"
        )
    
    return QuickActionResponse(
        id=action_dict['id'],
        name=action_dict['name'],
        prompt=action_dict['prompt'],
        description=action_dict['description'],
        scope=action_dict['scope'],
        user_id=action_dict['user_id'],
        position=action_dict['position']
    )


@router.delete("/quick-actions/{action_id}")
async def delete_quick_action(
    action_id: str,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Delete a user's quick action."""
    action_service = ChatQuickActionService(db)
    
    success = action_service.delete_action(action_id, current_user.user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quick action not found or access denied"
        )
    
    return {"success": True, "message": "Quick action deleted successfully"}


@router.post("/quick-actions/{action_id}/duplicate", response_model=QuickActionResponse)
async def duplicate_quick_action(
    action_id: str,
    name: Optional[str] = None,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Duplicate a quick action (global or user's own) as a new user action."""
    action_service = ChatQuickActionService(db)
    
    # Duplicate the action
    action_dict = action_service.duplicate_action(
        action_id=action_id,
        user_id=current_user.user_id,
        new_name=name
    )
    
    if not action_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quick action not found or access denied"
        )
    
    return QuickActionResponse(
        id=action_dict['id'],
        name=action_dict['name'],
        prompt=action_dict['prompt'],
        description=action_dict['description'],
        scope=action_dict['scope'],
        user_id=action_dict['user_id'],
        position=action_dict['position']
    )


# ================== COMPANY PROFILE ENDPOINTS ==================

@router.get("/company-profile", response_model=CompanyProfileResponse)
async def get_company_profile(
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get user's company profile."""
    profile = db.query(UserCompanyProfile).filter(
        UserCompanyProfile.user_id == current_user.user_id
    ).first()
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company profile not found"
        )
    
    return CompanyProfileResponse(
        id=str(profile.id),
        user_id=profile.user_id,
        company_name=profile.company_name,
        company_description=profile.company_description,
        business_focus=profile.business_focus,
        research_interests=profile.research_interests,
        therapeutic_areas=profile.therapeutic_areas,
        key_compounds=profile.key_compounds,
        pathways_of_interest=profile.pathways_of_interest,
        competitive_landscape=profile.competitive_landscape,
        research_agent_role=profile.research_agent_role,
        analysis_focus=profile.analysis_focus
    )


@router.put("/company-profile", response_model=CompanyProfileResponse)
async def update_company_profile(
    request: UpdateCompanyProfileRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Update user's company profile."""
    profile = db.query(UserCompanyProfile).filter(
        UserCompanyProfile.user_id == current_user.user_id
    ).first()
    
    if not profile:
        # Create new profile if it doesn't exist
        profile = UserCompanyProfile(user_id=current_user.user_id)
        db.add(profile)
    
    # Update fields if provided
    update_data = request.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)
    
    db.commit()
    db.refresh(profile)
    
    return CompanyProfileResponse(
        id=str(profile.id),
        user_id=profile.user_id,
        company_name=profile.company_name,
        company_description=profile.company_description,
        business_focus=profile.business_focus,
        research_interests=profile.research_interests,
        therapeutic_areas=profile.therapeutic_areas,
        key_compounds=profile.key_compounds,
        pathways_of_interest=profile.pathways_of_interest,
        competitive_landscape=profile.competitive_landscape,
        research_agent_role=profile.research_agent_role,
        analysis_focus=profile.analysis_focus
    )


# ================== INDIVIDUAL ARTICLE RESEARCH ENDPOINTS ==================

@router.get("/groups/{group_id}/articles/{article_id}", response_model=ArticleDetailResponse)
async def get_article_group_detail(
    group_id: str,
    article_id: str,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get complete article detail data for an article in a group."""
    detail_service = ArticleGroupDetailService(db)
    result = detail_service.get_article_detail(current_user.user_id, group_id, article_id)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found in group or access denied"
        )
    
    return result


@router.put("/groups/{group_id}/articles/{article_id}/notes")
async def update_article_notes(
    group_id: str,
    article_id: str,
    request: UpdateNotesRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Update research notes for an article."""
    detail_service = ArticleGroupDetailService(db)
    success = detail_service.update_notes(current_user.user_id, group_id, article_id, request.notes)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found in group or access denied"
        )
    
    return {"success": True, "message": "Notes updated"}


@router.put("/groups/{group_id}/articles/{article_id}/metadata")
async def update_article_metadata(
    group_id: str,
    article_id: str,
    request: UpdateMetadataRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Update workbench metadata for an article."""
    detail_service = ArticleGroupDetailService(db)
    success = detail_service.update_metadata(current_user.user_id, group_id, article_id, request.metadata)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found in group or access denied"
        )
    
    return {"success": True, "message": "Metadata updated"}


# Single feature extraction removed - use batch extraction instead


# ================== BATCH OPERATIONS ==================

# Batch feature extraction removed - use unified extract endpoint instead


@router.put("/groups/{group_id}/batch/metadata")
async def batch_update_metadata(
    group_id: str,
    request: BatchUpdateMetadataRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Update metadata for multiple articles in a group."""
    detail_service = ArticleGroupDetailService(db)
    
    results = detail_service.batch_update_metadata(
        current_user.user_id,
        group_id,
        request.metadata_updates
    )
    
    if not results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found or access denied"
        )
    
    # Count successes and failures
    successful = sum(1 for v in results.values() if v)
    failed = len(results) - successful
    
    return {
        "results": results,
        "summary": {
            "total_requested": len(request.metadata_updates),
            "successful": successful,
            "failed": failed
        }
    }


# ================== CANONICAL STUDY REPRESENTATION (UNIFIED API) ==================

from schemas.canonical_study import CanonicalStudyRequest, CanonicalStudyResponse

@router.get("/groups/{group_id}/articles/{article_id}/canonical-study", response_model=CanonicalStudyResponse)
async def get_canonical_study_representation(
    group_id: str,
    article_id: str,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get the complete canonical study representation (archetype + ER graph)."""
    service = ArticleGroupDetailService(db)
    representation = service.get_canonical_study(
        current_user.user_id, 
        group_id, 
        article_id
    )
    
    if not representation:
        return CanonicalStudyResponse()
    
    return CanonicalStudyResponse(**representation)


@router.put("/groups/{group_id}/articles/{article_id}/canonical-study")
async def save_canonical_study_representation(
    group_id: str,
    article_id: str,
    request: CanonicalStudyRequest,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Save the complete canonical study representation (archetype + ER graph)."""
    service = ArticleGroupDetailService(db)
    success = service.save_canonical_study(
        current_user.user_id,
        group_id,
        article_id,
        archetype_text=request.archetype_text,
        study_type=request.study_type,
        pattern_id=request.pattern_id,
        entity_analysis=request.entity_analysis,
        update_entity_analysis=request.update_entity_analysis
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save canonical study representation"
        )
    
    from datetime import datetime
    return {"success": True, "last_updated": datetime.utcnow().isoformat()}


