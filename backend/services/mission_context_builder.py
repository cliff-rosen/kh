"""
Mission Context Builder Service

This module provides simple context preparation for missions.
Focuses only on what's actually needed - preparing chat contexts.

Usage:
    builder = MissionContextBuilder(asset_service)
    chat_context = await builder.prepare_chat_context(mission, user_id, db)
"""

from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from fastapi import Depends

from database import get_db

from schemas.workflow import Mission, ChatContextPayload, SanitizedMission
from schemas.chat import AssetReference
from schemas.asset import Asset

from services.asset_service import AssetService
from services.asset_summary_service import AssetSummaryService
from services.mission_transformer import MissionTransformer


class MissionContextBuilder:
    """Simple mission context preparation for chat"""
    
    def __init__(self, asset_service: Optional[AssetService] = None) -> None:
        self.asset_service = asset_service
        self.mission_transformer = MissionTransformer(asset_service)
        self.asset_summary_service = AssetSummaryService() if asset_service else None
    
    async def prepare_chat_context(
        self, 
        mission: Optional[Mission], 
        user_id: int, 
        db: Session,
        additional_payload: Optional[Dict[str, Any]] = None
    ) -> ChatContextPayload:
        """
        Prepare simple chat context with sanitized mission and asset summaries.
        
        Args:
            mission: The mission to include in context
            user_id: User ID for asset fetching
            db: Database session
            additional_payload: Any additional payload data
            
        Returns:
            Chat context payload with guaranteed mission and asset_summaries fields
        """
        # Start with base payload
        payload: ChatContextPayload = {
            "mission": None,
            "asset_summaries": {}
        }
        
        # Add sanitized mission if available
        if mission:
            try:
                sanitized_mission: SanitizedMission = self.mission_transformer.sanitize_for_chat(mission)
                payload["mission"] = sanitized_mission
            except Exception as e:
                print(f"Failed to sanitize mission for chat: {e}")
                payload["mission"] = None
        
        # Add asset summaries
        if self.asset_service and self.asset_summary_service:
            try:
                asset_summaries: Dict[str, AssetReference] = await self._get_asset_summaries(user_id)
                payload["asset_summaries"] = asset_summaries
            except Exception as e:
                print(f"Failed to get asset summaries: {e}")
                payload["asset_summaries"] = {}
        
        # Add additional payload if provided (may include extra fields beyond core payload)
        if additional_payload:
            payload.update(additional_payload)
        
        return payload
    
    async def _get_asset_summaries(self, user_id: int) -> Dict[str, AssetReference]:
        """Get asset summaries for context enrichment"""
        try:
            assets: List[Asset] = self.asset_service.get_user_assets(user_id)
            asset_summaries: Dict[str, AssetReference] = {}
            
            for asset in assets:
                asset_reference: AssetReference = self.asset_summary_service.create_asset_summary(asset)
                asset_summaries[asset.id] = asset_reference
            
            return asset_summaries
        except Exception as e:
            print(f"Failed to create asset summaries: {e}")
            return {}


async def get_mission_context_builder_service(db: Session = Depends(get_db)) -> MissionContextBuilder:
    """Dependency injection for MissionContextBuilder service"""
    asset_service = AssetService(db)
    return MissionContextBuilder(asset_service) 