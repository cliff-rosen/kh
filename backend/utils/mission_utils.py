"""
Mission Utilities

DEPRECATED: This module is being replaced by centralized mission transformation services.
Use the following services instead:
- MissionTransformer for mission format conversions
- MissionContextBuilder for context preparation

This module provides utilities for mission processing, sanitization, and 
chat context preparation.
"""

from typing import Dict, Any, Optional, List, Union

from schemas.workflow import Mission, Hop, SanitizedMission, SanitizedAsset, SanitizedHop, ChatContextPayload
from schemas.asset import Asset
from schemas.chat import AssetReference

from services.asset_service import AssetService
from services.mission_transformer import MissionTransformer
from services.mission_context_builder import MissionContextBuilder

# Initialize centralized services
_mission_transformer = None
_mission_context_builder = None

def get_mission_transformer(asset_service: Optional[AssetService] = None) -> MissionTransformer:
    """Get or create mission transformer instance"""
    global _mission_transformer
    if _mission_transformer is None:
        _mission_transformer = MissionTransformer(asset_service)
    return _mission_transformer

def get_mission_context_builder(asset_service: Optional[AssetService] = None) -> MissionContextBuilder:
    """Get or create mission context builder instance"""
    global _mission_context_builder
    if _mission_context_builder is None:
        _mission_context_builder = MissionContextBuilder(asset_service)
    return _mission_context_builder

# DEPRECATED FUNCTIONS - Use centralized services instead
def sanitize_asset_for_chat(asset: Asset) -> SanitizedAsset:
    """
    DEPRECATED: Use MissionTransformer.sanitize_asset instead
    
    Sanitize an asset for chat context by removing large content values.
    """
    transformer = get_mission_transformer()
    return transformer.sanitize_asset(asset)

def sanitize_hop_for_chat(hop: Hop) -> SanitizedHop:
    """
    DEPRECATED: Use MissionTransformer.sanitize_hop instead
    
    Sanitize a hop for chat context by removing asset content values.
    """
    transformer = get_mission_transformer()
    return transformer.sanitize_hop(hop)

def sanitize_mission_for_chat(mission: Optional[Mission]) -> Union[SanitizedMission, Dict[str, Any]]:
    """
    DEPRECATED: Use MissionTransformer.sanitize_for_chat instead
    
    Sanitize a mission for chat context by removing large asset content values.
    """
    if not mission:
        return {}
    
    transformer = get_mission_transformer()
    return transformer.sanitize_for_chat(mission)

async def enrich_chat_context_with_assets(
    chat_payload: Dict[str, Any], 
    user_id: int, 
    db: Any
) -> ChatContextPayload:
    """
    DEPRECATED: Use MissionContextBuilder.prepare_chat_context instead
    
    Enrich chat context with asset summaries fetched from the backend.
    """
    # For backward compatibility, extract mission from payload
    mission = chat_payload.get('mission')
    if isinstance(mission, dict):
        # Convert dict back to Mission object if needed
        # This is a simplified version - full conversion would require more work
        mission = None
    
    asset_service = AssetService(db)
    context_builder = get_mission_context_builder(asset_service)
    
    # Use the new centralized approach
    return await context_builder.prepare_chat_context(mission, user_id, db, chat_payload)

async def prepare_chat_context(
    mission: Optional[Mission], 
    user_id: int, 
    db: Any,
    additional_payload: Optional[Dict[str, Any]] = None
) -> ChatContextPayload:
    """
    DEPRECATED: Use MissionContextBuilder.prepare_chat_context instead
    
    Prepare complete chat context with sanitized mission and asset summaries.
    """
    asset_service = AssetService(db)
    context_builder = get_mission_context_builder(asset_service)
    
    # Use the new centralized approach
    return await context_builder.prepare_chat_context(mission, user_id, db, additional_payload) 