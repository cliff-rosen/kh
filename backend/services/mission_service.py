from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
from uuid import uuid4
from fastapi import Depends

from database import get_db
from models import Mission as MissionModel, MissionStatus

from schemas.workflow import Mission, MissionStatus as SchemaMissionStatus
from exceptions import MissionNotFoundError

from services.asset_service import AssetService
from services.hop_service import HopService
from services.asset_mapping_service import AssetMappingService
from services.mission_transformer import MissionTransformer, MissionTransformationError


class MissionService:
    def __init__(self, db: Session):
        self.db = db
        self.asset_service = AssetService(db)
        self.hop_service = HopService(db)
        self.asset_mapping_service = AssetMappingService(db)
        self.mission_transformer = MissionTransformer(self.asset_service, self.asset_mapping_service)
    
    async def get_mission(self, mission_id: str, user_id: int, load_hops: bool = True) -> Mission:
        """Get a mission by ID - throws MissionNotFoundError if not found"""
        mission_model = self.db.query(MissionModel).filter(
            MissionModel.id == mission_id,
            MissionModel.user_id == user_id
        ).first()
        
        if not mission_model:
            raise MissionNotFoundError(mission_id)
        
        return await self.mission_transformer.model_to_schema(mission_model, load_assets=True, load_hops=load_hops)
    
    async def update_mission(self, mission_id: str, user_id: int, mission: Mission) -> None:
        """Update an existing mission - throws MissionNotFoundError if not found"""
        try:
            mission_model = self.db.query(MissionModel).filter(
                MissionModel.id == mission_id,
                MissionModel.user_id == user_id
            ).first()
            
            if not mission_model:
                raise MissionNotFoundError(mission_id)
            
            # Use transformer to get updated model data
            updated_model = self.mission_transformer.schema_to_model(mission, user_id)
            
            # Update fields
            mission_model.name = updated_model.name
            mission_model.description = updated_model.description
            mission_model.goal = updated_model.goal
            mission_model.status = updated_model.status
            mission_model.success_criteria = updated_model.success_criteria
            mission_model.mission_metadata = updated_model.mission_metadata
            mission_model.updated_at = datetime.utcnow()
            
            self.db.commit()
            
        except MissionTransformationError as e:
            self.db.rollback()
            raise Exception(f"Failed to update mission: {str(e)}")
        except Exception as e:
            self.db.rollback()
            raise Exception(f"Failed to update mission: {str(e)}")
    
    async def update_mission_status(
        self, 
        mission_id: str, 
        user_id: int, 
        status: SchemaMissionStatus
    ) -> None:
        """Update mission status - throws MissionNotFoundError if not found"""
        try:
            mission_model = self.db.query(MissionModel).filter(
                MissionModel.id == mission_id,
                MissionModel.user_id == user_id
            ).first()
            
            if not mission_model:
                raise MissionNotFoundError(mission_id)
            
            mission_model.status = self.mission_transformer._map_schema_status_to_model(status)
            mission_model.updated_at = datetime.utcnow()
            
            self.db.commit()
            
        except Exception as e:
            self.db.rollback()
            raise Exception(f"Failed to update mission status: {str(e)}")
    
    async def delete_mission(self, mission_id: str, user_id: int) -> None:
        """Delete a mission - throws MissionNotFoundError if not found"""
        mission_model = self.db.query(MissionModel).filter(
            MissionModel.id == mission_id,
            MissionModel.user_id == user_id
        ).first()
        
        if not mission_model:
            raise MissionNotFoundError(mission_id)
        
        self.db.delete(mission_model)
        self.db.commit()
    
    async def get_user_missions(self, user_id: int) -> List[Mission]:
        """Get all missions for a user"""
        mission_models = self.db.query(MissionModel).filter(
            MissionModel.user_id == user_id
        ).order_by(MissionModel.updated_at.desc()).all()
        
        missions = []
        for model in mission_models:
            try:
                mission = await self.mission_transformer.model_to_schema(model)
                missions.append(mission)
            except MissionTransformationError as e:
                print(f"Failed to transform mission {model.id}: {e}")
                continue
        
        return missions
    
    async def get_mission_with_hops(self, mission_id: str, user_id: int) -> Dict[str, Any]:
        """Get a mission with its hops and tool steps - throws MissionNotFoundError if not found"""
        try:
            mission_model = self.db.query(MissionModel).filter(
                MissionModel.id == mission_id,
                MissionModel.user_id == user_id
            ).first()
            
            if not mission_model:
                raise MissionNotFoundError(mission_id)
            
            # Get mission using transformer
            mission = await self.mission_transformer.model_to_schema(mission_model)
            
            # Get hops for this mission
            hops = await self.hop_service.get_hops_by_mission(mission_id, user_id)
            
            return {
                "mission": mission,
                "hops": hops
            }
            
        except MissionTransformationError as e:
            raise Exception(f"Failed to get mission with hops: {e}")
    
    async def coordinate_mission_status_with_hop(
        self, 
        mission_id: str, 
        user_id: int, 
        hop_status: 'HopStatus'
    ) -> bool:
        """
        Coordinate mission status based on hop status changes according to new state transition rules.
        
        With the new simplified mission states:
        - Mission is either AWAITING_APPROVAL, IN_PROGRESS, or terminal (COMPLETED/FAILED/CANCELLED)
        - When mission is IN_PROGRESS, all work happens at hop level
        - Mission status changes are minimal - mainly when hop completes final hop
        """
        from schemas.workflow import HopStatus
        
        try:
            # Get current mission
            mission = await self.get_mission(mission_id, user_id)
            if not mission:
                return False
            
            # Determine new mission status based on hop status
            new_mission_status = None
            
            # For most hop status changes, mission stays IN_PROGRESS
            # Only change mission status for significant events
            
            if hop_status == HopStatus.COMPLETED:
                # Hop completed - check if final hop
                current_hop = mission.current_hop
                if current_hop and current_hop.is_final:
                    # Final hop completed - mission is complete
                    new_mission_status = SchemaMissionStatus.COMPLETED
                else:
                    # Non-final hop completed - mission stays in progress
                    new_mission_status = SchemaMissionStatus.IN_PROGRESS
            
            elif hop_status == HopStatus.FAILED:
                # Hop failed - mission fails
                new_mission_status = SchemaMissionStatus.FAILED
            
            elif hop_status == HopStatus.CANCELLED:
                # Hop cancelled - mission cancelled
                new_mission_status = SchemaMissionStatus.CANCELLED
            
            # For all other hop statuses (planning, implementation phases), mission stays IN_PROGRESS
            # No mission status change needed for:
            # - HOP_PLAN_STARTED, HOP_PLAN_PROPOSED, HOP_PLAN_READY
            # - HOP_IMPL_STARTED, HOP_IMPL_PROPOSED, HOP_IMPL_READY
            # - EXECUTING
            
            # Update mission status if needed
            if new_mission_status and new_mission_status != mission.status:
                mission.status = new_mission_status
                mission.updated_at = datetime.utcnow()
                
                # Update database
                db_mission = self.db.query(MissionModel).filter(
                    MissionModel.id == mission_id,
                    MissionModel.user_id == user_id
                ).first()
                
                if db_mission:
                    db_mission.status = self.mission_transformer._map_schema_status_to_model(new_mission_status)
                    db_mission.updated_at = datetime.utcnow()
                    self.db.commit()
                    
                    print(f"Mission {mission_id} status updated to {new_mission_status} due to hop status {hop_status}")
                    return True
                else:
                    print(f"Mission {mission_id} not found in database")
                    return False
            
            # No mission status change needed
            return True
            
        except Exception as e:
            print(f"Failed to coordinate mission status with hop: {e}")
            return False
    
    # Old transformation methods removed - now handled by MissionTransformer
    # The following methods are deprecated and replaced by centralized transformation:
    # - _model_to_mission -> mission_transformer.model_to_schema
    # - _map_schema_status_to_model -> mission_transformer._map_schema_status_to_model  
    # - _map_model_status_to_schema -> mission_transformer._map_model_status_to_schema


# Dependency function for FastAPI dependency injection
async def get_mission_service(db: Session = Depends(get_db)) -> MissionService:
    """FastAPI dependency that provides MissionService instance"""
    return MissionService(db)