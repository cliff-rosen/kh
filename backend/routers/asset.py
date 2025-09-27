from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, Response
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

from database import get_db
from models import User, Asset as AssetModel
from exceptions import AssetNotFoundError

from schemas.asset import Asset, AssetRole
from schemas.chat import AssetReference

from services import auth_service
from services.asset_service import AssetService, get_asset_service
from services.asset_summary_service import AssetSummaryService

router = APIRouter(prefix="/assets", tags=["assets"])


# Request models for asset endpoints
class CreateAssetRequest(BaseModel):
    """API request model for creating assets"""
    name: str
    description: Optional[str] = None
    type: str
    subtype: Optional[str] = None
    role: Optional[AssetRole] = None  # Role of asset in workflow
    content: Optional[Any] = None
    asset_metadata: Optional[Dict[str, Any]] = None


# CREATE ASSET
@router.post("/", response_model=Asset)
async def create_asset(
    request: CreateAssetRequest,
    asset_service: AssetService = Depends(get_asset_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """Create a new asset"""
    return asset_service.create_asset(
        user_id=current_user.user_id,
        name=request.name,
        schema_definition={'type': request.type, 'description': request.description or f'{request.name} asset'},
        subtype=request.subtype,
        description=request.description,
        content=request.content,
        asset_metadata=request.asset_metadata
    )

# RETRIEVE ASSETS
@router.get("/{asset_id}", response_model=Asset)
async def get_asset(
    asset_id: str,
    asset_service: AssetService = Depends(get_asset_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """Get an asset by ID"""
    try:
        return asset_service.get_asset(asset_id, current_user.user_id)
    except AssetNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/{asset_id}/details")
async def get_asset_details(
    asset_id: str, 
    asset_service: AssetService = Depends(get_asset_service)
) -> Dict[str, Any]:
    """
    Get detailed information about an asset, including its content.
    For database entity assets, this will fetch the content from the database.
    """
    try:
        # Use AssetService to get the asset with unified schema format
        asset = asset_service.get_asset_with_details(asset_id)
        
        # Return the unified asset format
        return asset.model_dump(mode='json')
    except AssetNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/", response_model=List[Asset])
async def get_user_assets(
    asset_service: AssetService = Depends(get_asset_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """Get all assets for the current user"""
    return asset_service.get_user_assets(
        user_id=current_user.user_id
    )

# UPDATE ASSET
@router.put("/{asset_id}", response_model=Asset)
async def update_asset(
    asset_id: str,
    updates: dict,
    asset_service: AssetService = Depends(get_asset_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """Update an asset"""
    try:
        return asset_service.update_asset(asset_id, current_user.user_id, updates)
    except AssetNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

# ASSET SUMMARIES FOR CHAT CONTEXT
@router.get("/summaries", response_model=List[AssetReference])
async def get_asset_summaries(
    asset_service: AssetService = Depends(get_asset_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """Get lightweight asset summaries for chat context"""
    summary_service = AssetSummaryService()
    
    # Get all user assets
    assets = asset_service.get_user_assets(current_user.user_id)
    
    # Create summaries
    summaries = []
    for asset in assets:
        summaries.append(summary_service.create_asset_summary(asset))
    
    return summaries

# DELETE ASSET
@router.delete("/{asset_id}")
async def delete_asset(
    asset_id: str,
    asset_service: AssetService = Depends(get_asset_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """Delete an asset"""
    try:
        asset_service.delete_asset(asset_id, current_user.user_id)
        return {"message": "Asset deleted successfully"}
    except AssetNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) 