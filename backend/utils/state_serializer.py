"""
State Serialization Utilities

This module provides centralized utilities for serializing workflow state
components consistently across different nodes.
"""

from typing import Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel

from schemas.workflow import Mission, Hop, MissionStatus, HopStatus
from schemas.asset import Asset

class SerializedState(BaseModel):
    """Base model for serialized state to ensure consistent structure"""
    messages: list
    mission: dict
    tool_params: Dict[str, Any] = {}
    next_node: str

def serialize_asset(asset: Asset) -> dict:
    """Serialize a single asset to JSON-compatible dict"""
    if not asset:
        return None
    return asset.model_dump(mode='json')

def serialize_assets(assets: Dict[str, Asset]) -> Dict[str, dict]:
    """Serialize a dictionary of assets to JSON-compatible dict"""
    if not assets:
        return {}
    return {
        asset_id: serialize_asset(asset)
        for asset_id, asset in assets.items()
    }

def serialize_asset_list(assets: list[Asset]) -> list[dict]:
    """Serialize a list of assets to JSON-compatible list"""
    if not assets:
        return []
    return [serialize_asset(asset) for asset in assets]

def serialize_hop(hop: Optional[Hop]) -> Optional[dict]:
    """Serialize a hop to JSON-compatible dict"""
    if not hop:
        return None
    
    hop_dict = hop.model_dump(mode='json')
    # Ensure status is serialized as string value
    hop_dict['status'] = hop.status.value if hop.status else None
    return hop_dict

def serialize_mission(mission: Mission) -> dict:
    """Serialize a mission to JSON-compatible dict"""
    if not mission:
        return {}
        
    mission_dict = mission.model_dump(mode='json')
    
    # Serialize mission asset mapping
    mission_dict['mission_asset_map'] = {aid: role.value for aid, role in mission.mission_asset_map.items()}
    
    # Ensure status is serialized as string value
    mission_dict['status'] = mission.status.value if mission.status else None
    
    return mission_dict

def serialize_state_with_datetime(state: BaseModel) -> dict:
    """
    General-purpose state serializer with datetime handling.
    Recursively converts datetime objects to ISO format strings.
    """
    def convert_datetime(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        elif isinstance(obj, dict):
            return {k: convert_datetime(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_datetime(item) for item in obj]
        elif hasattr(obj, 'model_dump'):
            return convert_datetime(obj.model_dump())
        return obj

    state_dict = state.model_dump()
    return convert_datetime(state_dict)

def serialize_state(state: BaseModel) -> dict:
    """Serialize the complete state object"""
    if not state:
        return {}
        
    state_dict = state.model_dump(mode='json')
    
    # Serialize mission if present
    if hasattr(state, 'mission'):
        state_dict['mission'] = serialize_mission(state.mission)
    
    return state_dict

def create_agent_response(
    token: str,
    response_text: str,
    status: str,
    error: Optional[str] = None,
    debug: Optional[str] = None,
    payload: Optional[dict] = None
) -> dict:
    """Create a standardized agent response structure"""
    return {
        "token": token,
        "response_text": response_text,
        "status": status,
        "error": error,
        "debug": debug,
        "payload": payload or {}
    } 