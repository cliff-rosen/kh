"""
Mission Transformation Service

This module provides utilities for converting missions between the representations
actually used in the application. Focuses on core transformations only.

Core transformations:
1. Mission schema ↔ Database models (for persistence)
2. MissionLite → Mission schema (for LLM proposals)
3. Simple mission sanitization (for chat contexts)
4. Status enum mapping

Usage:
    transformer = MissionTransformer(asset_service)
    
    # Core database operations
    mission_model = transformer.schema_to_model(mission_schema, user_id)
    mission_schema = await transformer.model_to_schema(mission_model)
    
    # LLM proposal handling
    mission = transformer.lite_to_schema(mission_lite)
    
    # Simple chat sanitization
    sanitized_dict = transformer.sanitize_for_chat(mission)
"""

from typing import Dict, Any, Optional, List, Union
from datetime import datetime
import logging

from models import Mission as MissionModel, MissionStatus as ModelMissionStatus

# Create logger for this module
logger = logging.getLogger(__name__)
from schemas.workflow import (
    Mission, 
    MissionStatus as SchemaMissionStatus, 
    Hop,
    SanitizedAsset,
    SanitizedHop,
    SanitizedMission
)
from schemas.lite_models import MissionLite, create_mission_from_lite
from schemas.asset import Asset, AssetRole
from services.asset_service import AssetService
from services.asset_mapping_service import AssetMappingService


class MissionTransformationError(Exception):
    """Raised when mission transformation fails"""
    pass


class MissionTransformer:
    """Simplified mission transformation service"""
    
    def __init__(self, asset_service: Optional[AssetService] = None, asset_mapping_service: Optional[AssetMappingService] = None) -> None:
        self.asset_service = asset_service
        self.asset_mapping_service = asset_mapping_service
        # Status mappings between models and schemas
        self._model_to_schema_status_map = {
            ModelMissionStatus.AWAITING_APPROVAL: SchemaMissionStatus.AWAITING_APPROVAL,
            ModelMissionStatus.IN_PROGRESS: SchemaMissionStatus.IN_PROGRESS,
            ModelMissionStatus.COMPLETED: SchemaMissionStatus.COMPLETED,
            ModelMissionStatus.FAILED: SchemaMissionStatus.FAILED,
            ModelMissionStatus.CANCELLED: SchemaMissionStatus.CANCELLED,
        }
        
        self._schema_to_model_status_map = {
            SchemaMissionStatus.AWAITING_APPROVAL: ModelMissionStatus.AWAITING_APPROVAL,
            SchemaMissionStatus.IN_PROGRESS: ModelMissionStatus.IN_PROGRESS,
            SchemaMissionStatus.COMPLETED: ModelMissionStatus.COMPLETED,
            SchemaMissionStatus.FAILED: ModelMissionStatus.FAILED,
            SchemaMissionStatus.CANCELLED: ModelMissionStatus.CANCELLED,
        }
    
    def schema_to_model(self, mission: Mission, user_id: int) -> MissionModel:
        """Convert Mission schema to MissionModel for database persistence"""
        try:
            return MissionModel(
                id=mission.id,
                user_id=user_id,
                name=mission.name,
                description=mission.description,
                goal=mission.goal,
                status=self._map_schema_status_to_model(mission.status),
                success_criteria=mission.success_criteria,
                current_hop_id=mission.current_hop_id,
                mission_metadata=mission.mission_metadata,
                created_at=mission.created_at,
                updated_at=mission.updated_at
            )
        except Exception as e:
            raise MissionTransformationError(f"Failed to convert schema to model: {str(e)}")
    
    async def model_to_schema(self, mission_model: MissionModel, load_assets: bool = True, load_hops: bool = True) -> Mission:
        """Convert MissionModel to Mission schema with optional asset and hop loading"""
        try:
            logger.debug(
                "Converting mission model to schema",
                extra={
                    "mission_id": mission_model.id,
                    "load_assets": load_assets,
                    "load_hops": load_hops,
                    "current_hop_id": mission_model.current_hop_id
                }
            )
            
            current_hop = None
            hops = []
            
            if load_hops and self.asset_service:
                # Load hops if requested
                from services.hop_service import HopService
                hop_service = HopService(self.asset_service.db)
                
                # Load all hops for the mission
                hops = await hop_service.get_hops_by_mission(mission_model.id, mission_model.user_id)
                
                # Load current hop if specified
                if mission_model.current_hop_id:
                    current_hop = await hop_service.get_hop(mission_model.current_hop_id, mission_model.user_id)
                    logger.debug(
                        "Loaded current hop with tool steps",
                        extra={
                            "mission_id": mission_model.id,
                            "current_hop_id": mission_model.current_hop_id,
                            "tool_steps_count": len(current_hop.tool_steps) if current_hop else 0
                        }
                    )
            
            # Get mission asset mapping
            mission_asset_map = {}
            assets = []
            if self.asset_mapping_service and self.asset_service:
                mission_asset_map = self.asset_mapping_service.get_mission_assets(mission_model.id)
                
                # Load full Asset objects for frontend compatibility
                for asset_id in mission_asset_map.keys():
                    asset = self.asset_service.get_asset(asset_id, mission_model.user_id)
                    if asset:
                        assets.append(asset)
            
            return Mission(
                id=mission_model.id,
                name=mission_model.name,
                description=mission_model.description,
                goal=mission_model.goal,
                status=self._map_model_status_to_schema(mission_model.status),
                success_criteria=mission_model.success_criteria or [],
                current_hop_id=mission_model.current_hop_id,
                current_hop=current_hop,
                hops=hops,
                mission_metadata=mission_model.mission_metadata or {},
                mission_asset_map=mission_asset_map,
                assets=assets,
                created_at=mission_model.created_at,
                updated_at=mission_model.updated_at
            )
        except Exception as e:
            raise MissionTransformationError(f"Failed to convert model to schema: {str(e)}")
    
    def lite_to_schema(self, mission_lite: MissionLite) -> Mission:
        """Convert MissionLite to Mission schema (used for LLM proposals)"""
        try:
            return create_mission_from_lite(mission_lite)
        except Exception as e:
            raise MissionTransformationError(f"Failed to convert lite to schema: {str(e)}")
    
    def sanitize_for_chat(self, mission: Optional[Mission]) -> Union[SanitizedMission, Dict[str, Any]]:
        """Create simple sanitized dict for chat contexts (removes large content values)"""
        if not mission:
            return {}
        
        try:
            # Simple asset sanitization - just metadata, no content
            def sanitize_asset(asset: Asset) -> SanitizedAsset:
                return {
                    "id": asset.id,
                    "name": asset.name,
                    "description": asset.description,
                    "type": asset.schema_definition.type,
                    "subtype": asset.subtype,
                    "status": asset.status.value,
                    "role": asset.role.value,
                    "scope_type": asset.scope_type.value,
                    "token_count": asset.asset_metadata.get('token_count', 0) if asset.asset_metadata else 0
                }
            
            # Mission state now handled through asset mapping service
            # TODO: Load assets by ID from mission_asset_map if needed for chat context
            sanitized_mission_state = {}
            
            # Simple hop sanitization
            current_hop = None
            if mission.current_hop:
                current_hop = {
                    "id": mission.current_hop.id,
                    "name": mission.current_hop.name,
                    "description": mission.current_hop.description,
                    "status": mission.current_hop.status.value,
                    "sequence_order": mission.current_hop.sequence_order
                }
            
            hops = []
            for hop in mission.hops:
                hops.append({
                    "id": hop.id,
                    "name": hop.name,
                    "description": hop.description,
                    "status": hop.status.value,
                    "sequence_order": hop.sequence_order
                })
            
            return {
                "id": mission.id,
                "name": mission.name,
                "description": mission.description,
                "goal": mission.goal,
                "success_criteria": mission.success_criteria,
                "status": mission.status.value,
                "current_hop_id": mission.current_hop_id,
                "current_hop": current_hop,
                "hops": hops,
                "mission_asset_map": {aid: role.value for aid, role in mission.mission_asset_map.items()},
                "mission_metadata": mission.mission_metadata,
                "created_at": mission.created_at.isoformat(),
                "updated_at": mission.updated_at.isoformat()
            }
        except Exception as e:
            raise MissionTransformationError(f"Failed to sanitize mission: {str(e)}")
    
    def sanitize_asset(self, asset: Asset) -> SanitizedAsset:
        """Sanitize an asset for chat context by removing large content values"""
        return {
            "id": asset.id,
            "name": asset.name,
            "description": asset.description,
            "type": asset.schema_definition.type,
            "subtype": asset.subtype,
            "status": asset.status.value,
            "role": asset.role.value,
            "scope_type": asset.scope_type.value,
            "token_count": asset.asset_metadata.get('token_count', 0) if asset.asset_metadata else 0
        }
    
    def sanitize_hop(self, hop: Hop) -> SanitizedHop:
        """Sanitize a hop for chat context by removing large content values"""
        return {
            "id": hop.id,
            "name": hop.name,
            "description": hop.description,
            "status": hop.status.value,
            "sequence_order": hop.sequence_order
        }
    
    def _map_schema_status_to_model(self, schema_status: SchemaMissionStatus) -> ModelMissionStatus:
        """Map schema status to model status"""
        return self._schema_to_model_status_map.get(schema_status, ModelMissionStatus.AWAITING_APPROVAL)
    
    def _map_model_status_to_schema(self, model_status: ModelMissionStatus) -> SchemaMissionStatus:
        """Map model status to schema status"""
        return self._model_to_schema_status_map.get(model_status, SchemaMissionStatus.AWAITING_APPROVAL) 