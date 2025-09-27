"""
State Transition Service - Unified Interface

This service provides a single interface for all mission state transitions:
updateState(transaction_type, data) handles any state transition atomically.

Transaction Types:
- propose_mission: Agent proposes mission → AWAITING_APPROVAL
- accept_mission: User accepts mission → IN_PROGRESS  
- propose_hop_plan: Agent starts hop planning → HOP_PLAN_STARTED → HOP_PLAN_PROPOSED
- accept_hop_plan: User accepts hop plan → HOP_PLAN_READY
- propose_hop_impl: Agent implements hop → HOP_IMPL_STARTED → HOP_IMPL_PROPOSED
- accept_hop_impl: User accepts implementation → HOP_IMPL_READY
- execute_hop: User triggers execution → EXECUTING
- complete_hop: System completes hop → COMPLETED
- complete_mission: Final hop completes → mission COMPLETED
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import uuid4
from sqlalchemy.orm import Session
from dataclasses import dataclass, field
from enum import Enum
from fastapi import Depends
import logging

from database import get_db
from models import (
    Mission as MissionModel, 
    Hop as HopModel, 
    ToolStep as ToolStepModel,
    MissionStatus,
    HopStatus
)
from schemas.workflow import (
    Mission, 
    Hop,
    MissionStatus as SchemaMissionStatus,
    HopStatus as SchemaHopStatus
)
from services.asset_service import AssetService
from services.asset_mapping_service import AssetMappingService
from exceptions import AssetNotFoundError
from services.mission_transformer import MissionTransformer
from services.user_session_service import UserSessionService
from schemas.asset import AssetScopeType, AssetRole
from exceptions import ValidationError

logger = logging.getLogger(__name__)


class TransactionType(str, Enum):
    """Enum for all supported transaction types"""
    PROPOSE_MISSION = "propose_mission"
    ACCEPT_MISSION = "accept_mission"
    PROPOSE_HOP_PLAN = "propose_hop_plan"
    ACCEPT_HOP_PLAN = "accept_hop_plan"
    PROPOSE_HOP_IMPL = "propose_hop_impl"
    ACCEPT_HOP_IMPL = "accept_hop_impl"
    EXECUTE_HOP = "execute_hop"
    COMPLETE_HOP = "complete_hop"
    COMPLETE_MISSION = "complete_mission"
    COMPLETE_TOOL_STEP = "complete_tool_step"


@dataclass
class TransactionResult:
    """Standardized result for all state transitions"""
    success: bool
    entity_id: str
    status: str
    message: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "success": self.success,
            "entity_id": self.entity_id,
            "status": self.status,
            "message": self.message,
            **self.metadata
        }


class StateTransitionError(Exception):
    """Raised when state transitions fail"""
    pass


class StateTransitionService:
    """Unified interface for all state transitions"""
    
    def __init__(self, db: Session, session_service: UserSessionService = None):
        self.db = db
        self.asset_service = AssetService(db)
        self.asset_mapping_service = AssetMappingService(db)
        self.mission_transformer = MissionTransformer(self.asset_service, self.asset_mapping_service)
        self.session_service = session_service
    
    def _serialize_mapping_value(self, mapping_value: Any) -> Dict[str, Any]:
        """
        Serialize ParameterMappingValue or ResultMappingValue objects to JSON-compatible dictionaries.
        
        Args:
            mapping_value: Can be AssetFieldMapping, LiteralMapping, DiscardMapping, or dict
            
        Returns:
            JSON-compatible dictionary
        """
        if hasattr(mapping_value, 'model_dump'):
            # It's a Pydantic model (AssetFieldMapping, LiteralMapping, etc.)
            return mapping_value.model_dump()
        elif isinstance(mapping_value, dict):
            # Already a dictionary, return as-is
            return mapping_value
        else:
            # Fallback for other types
            return {"type": "unknown", "value": str(mapping_value)}
    
    def _serialize_mappings(self, mappings: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize parameter_mapping or result_mapping to JSON-compatible format"""
        if not mappings:
            return {}
        
        return {
            key: self._serialize_mapping_value(value)
            for key, value in mappings.items()
        }
    
    async def updateState(self, transaction_type: TransactionType, data: Dict[str, Any]) -> TransactionResult:
        """
        Unified interface for all state transitions
        
        Args:
            transaction_type: Type of state transition
            data: Transaction data (varies by type)
            
        Returns:
            Dict with transaction results
            
        Raises:
            StateTransitionError: If transition fails
        """
        try:
            # Route to appropriate handler based on transaction type
            if transaction_type == TransactionType.PROPOSE_MISSION:
                return await self._propose_mission(data)
            elif transaction_type == TransactionType.ACCEPT_MISSION:
                return await self._accept_mission(data)
            elif transaction_type == TransactionType.PROPOSE_HOP_PLAN:
                return await self._propose_hop_plan(data)
            elif transaction_type == TransactionType.ACCEPT_HOP_PLAN:
                return await self._accept_hop_plan(data)
            elif transaction_type == TransactionType.PROPOSE_HOP_IMPL:
                return await self._propose_hop_impl(data)
            elif transaction_type == TransactionType.ACCEPT_HOP_IMPL:
                return await self._accept_hop_impl(data)
            elif transaction_type == TransactionType.EXECUTE_HOP:
                return await self._execute_hop(data)
            elif transaction_type == TransactionType.COMPLETE_HOP:
                return await self._complete_hop(data)
            elif transaction_type == TransactionType.COMPLETE_MISSION:
                return await self._complete_mission(data)
            elif transaction_type == TransactionType.COMPLETE_TOOL_STEP:
                return await self._complete_tool_step(data)
            else:
                raise StateTransitionError(f"Unknown transaction type: {transaction_type}")
                
        except Exception as e:
            print(f"State transition failed [{transaction_type}]: {str(e)}")
            self.db.rollback()
            raise StateTransitionError(f"State transition failed [{transaction_type}]: {str(e)}")
    
    def _validate_transition(self, entity_type: str, entity_id: str, current_status: str, expected_status: str, user_id: int) -> None:
        """Validate that a state transition is allowed"""
        if current_status != expected_status:
            raise StateTransitionError(
                f"{entity_type} {entity_id} must be {expected_status}, current: {current_status}"
            )
    
    def _validate_entity_exists(self, entity, entity_type: str, entity_id: str) -> None:
        """Validate that an entity exists"""
        if not entity:
            raise StateTransitionError(f"{entity_type} {entity_id} not found")
    
    # Individual transaction handlers
    
    async def _propose_mission(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle mission proposal: Create mission with AWAITING_APPROVAL status"""
        user_id = data['user_id']
        mission_lite = data['mission_lite']  # Expecting MissionLite object
        
        # Create mission in AWAITING_APPROVAL state
        mission_id = str(uuid4())
        
        # Convert MissionLite to Mission object according to spec 03b
        mission_schema = Mission(
            id=mission_id,
            name=mission_lite.name,
            description=mission_lite.description,
            goal=mission_lite.goal,
            success_criteria=mission_lite.success_criteria,
            status=SchemaMissionStatus.AWAITING_APPROVAL,
            mission_metadata=mission_lite.metadata
        )
        
        # Use transformer to create mission
        mission_model = self.mission_transformer.schema_to_model(mission_schema, user_id)
        self.db.add(mission_model)
        
        # Process each asset in mission_lite inputs and outputs
        # Use the existing create_asset_from_lite function for proper conversion
        from schemas.lite_models import create_asset_from_lite
        
        all_assets = mission_lite.inputs + mission_lite.outputs
        for asset_lite in all_assets:
            # 1. Convert AssetLite to full Asset using existing converter
            asset = create_asset_from_lite(asset_lite)
            
            # 2. Create Asset entity using asset service
            created_asset = self.asset_service.create_asset(
                user_id=user_id,
                name=asset.name,
                schema_definition=asset.schema_definition.model_dump(),  # Convert to dict
                subtype=asset.subtype,
                description=asset.description,
                content=None,                                # Usually None for proposed assets
                scope_type=AssetScopeType.MISSION.value,     # Mission-scoped
                scope_id=mission_id,
                role=asset.role.value                       # Convert enum to string
            )
            
            # 3. Create MissionAsset mapping
            from models import AssetRole
            role = AssetRole(asset.role.value)
            self.asset_mapping_service.add_mission_asset(
                mission_id=mission_id,
                asset_id=created_asset.id,
                role=role
            )
        
        # Link mission to user's active session automatically (before commit)
        if self.session_service:
            try:
                await self.session_service.link_mission_to_session(user_id, mission_id, commit=False)
            except Exception as e:
                # Log but don't fail the transaction
                print(f"Warning: Could not link mission to session: {e}")
        
        self.db.commit()
        
        return TransactionResult(
            success=True,
            entity_id=mission_id,
            status="AWAITING_APPROVAL",
            message="Mission proposed and awaiting user approval",
            metadata={"mission_id": mission_id}
        )
    
    async def _accept_mission(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle mission acceptance: AWAITING_APPROVAL → IN_PROGRESS"""
        mission_id = data['mission_id']
        user_id = data['user_id']
        
        # Update mission status
        mission_model = self.db.query(MissionModel).filter(
            MissionModel.id == mission_id,
            MissionModel.user_id == user_id
        ).first()
        
        self._validate_entity_exists(mission_model, "Mission", mission_id)
        self._validate_transition("Mission", mission_id, mission_model.status.value, "awaiting_approval", user_id)
        
        mission_model.status = MissionStatus.IN_PROGRESS
        mission_model.updated_at = datetime.utcnow()
        
        self.db.commit()
        
        return TransactionResult(
            success=True,
            entity_id=mission_id,
            status="IN_PROGRESS",
            message="Mission accepted and ready for hop planning",
            metadata={"mission_id": mission_id}
        )
    
    async def _propose_hop_plan(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle hop plan proposal: Create hop + link to mission"""
        mission_id = data['mission_id']
        user_id = data['user_id']
        hop_lite = data['hop_lite']  # Expecting HopLite object
        
        # Validate mission state
        mission_model = self.db.query(MissionModel).filter(
            MissionModel.id == mission_id,
            MissionModel.user_id == user_id
        ).first()
        
        self._validate_entity_exists(mission_model, "Mission", mission_id)
        self._validate_transition("Mission", mission_id, mission_model.status.value, "in_progress", user_id)
        
        # Create hop from HopLite
        hop_id = str(uuid4())
        sequence_order = 1  # Calculate next sequence
        
        hop_model = HopModel(
            id=hop_id,
            mission_id=mission_id,
            user_id=user_id,
            name=hop_lite.name,
            description=hop_lite.description,
            goal=hop_lite.description,  # HopLite doesn't have goal
            sequence_order=sequence_order,
            status=HopStatus.HOP_PLAN_PROPOSED.value,
            success_criteria=getattr(hop_lite, 'success_criteria', []),
            rationale=hop_lite.rationale,
            is_final=hop_lite.is_final,
            hop_metadata=getattr(hop_lite, 'hop_metadata', {}),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        self.db.add(hop_model)
        self.db.flush()
        
        # Link to mission
        mission_model.current_hop_id = hop_id
        mission_model.updated_at = datetime.utcnow()
        
        # Initialize hop assets from HopLite
        await self._initialize_hop_assets_from_lite(mission_id, hop_id, user_id, hop_lite)
        
        self.db.commit()
        
        return TransactionResult(
            success=True,
            entity_id=hop_id,
            status="HOP_PLAN_PROPOSED",
            message="Hop plan proposed and awaiting user approval",
            metadata={"hop_id": hop_id, "mission_id": mission_id}
        )
    
    async def _accept_hop_plan(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle hop plan acceptance: HOP_PLAN_PROPOSED → HOP_PLAN_READY"""
        hop_id = data['hop_id']
        user_id = data['user_id']
        
        hop_model = self.db.query(HopModel).filter(
            HopModel.id == hop_id,
            HopModel.user_id == user_id
        ).first()
        
        self._validate_entity_exists(hop_model, "Hop", hop_id)
        self._validate_transition("Hop", hop_id, hop_model.status.value, "hop_plan_proposed", user_id)
        
        hop_model.status = HopStatus.HOP_PLAN_READY.value
        hop_model.updated_at = datetime.utcnow()
        
        self.db.commit()
        
        return TransactionResult(
            success=True,
            entity_id=hop_id,
            status="HOP_PLAN_READY",
            message="Hop plan accepted and ready for implementation",
            metadata={"hop_id": hop_id}
        )
    
    async def _propose_hop_impl(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle hop implementation proposal: HOP_PLAN_READY → HOP_IMPL_PROPOSED"""
        hop_id = data['hop_id']
        user_id = data['user_id']
        tool_steps = data.get('tool_steps', [])
        
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"StateTransitionService received {len(tool_steps)} tool steps for hop {hop_id}")
        
        hop_model = self.db.query(HopModel).filter(
            HopModel.id == hop_id,
            HopModel.user_id == user_id
        ).first()
        
        self._validate_entity_exists(hop_model, "Hop", hop_id)
        self._validate_transition("Hop", hop_id, hop_model.status.value, "hop_plan_ready", user_id)
        
        # Create tool steps from ToolStepLite objects
        for i, tool_step_lite in enumerate(tool_steps):
            tool_id = tool_step_lite.tool_id
            name = tool_step_lite.description or f'Step {i + 1}'
            description = tool_step_lite.description
            parameter_mapping = tool_step_lite.parameter_mapping
            result_mapping = tool_step_lite.result_mapping
            resource_configs = tool_step_lite.resource_configs
            
            logger.info(f"Processing ToolStepLite {i}: {tool_id}")
            logger.info(f"  Raw parameter_mapping: {parameter_mapping}")
            logger.info(f"  Raw result_mapping: {result_mapping}")
            
            serialized_param_mapping = self._serialize_mappings(parameter_mapping)
            serialized_result_mapping = self._serialize_mappings(result_mapping)
            
            logger.info(f"  Serialized parameter_mapping: {serialized_param_mapping}")
            logger.info(f"  Serialized result_mapping: {serialized_result_mapping}")
            
            tool_step_model = ToolStepModel(
                id=str(uuid4()),
                hop_id=hop_id,
                user_id=user_id,
                tool_id=tool_id,
                sequence_order=i + 1,
                name=name,
                description=description,
                parameter_mapping=serialized_param_mapping,
                result_mapping=serialized_result_mapping,
                resource_configs=resource_configs,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            self.db.add(tool_step_model)
        
        # Update hop status
        hop_model.status = HopStatus.HOP_IMPL_PROPOSED.value
        hop_model.updated_at = datetime.utcnow()
        
        self.db.commit()
        
        return TransactionResult(
            success=True,
            entity_id=hop_id,
            status="HOP_IMPL_PROPOSED",
            message="Hop implementation proposed and awaiting user approval",
            metadata={"hop_id": hop_id, "tool_steps_created": len(tool_steps)}
        )
    
    async def _accept_hop_impl(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle hop implementation acceptance: HOP_IMPL_PROPOSED → HOP_IMPL_READY"""
        hop_id = data['hop_id']
        user_id = data['user_id']
        
        hop_model = self.db.query(HopModel).filter(
            HopModel.id == hop_id,
            HopModel.user_id == user_id
        ).first()
        
        self._validate_entity_exists(hop_model, "Hop", hop_id)
        self._validate_transition("Hop", hop_id, hop_model.status.value, "hop_impl_proposed", user_id)
        
        hop_model.status = HopStatus.HOP_IMPL_READY.value
        hop_model.updated_at = datetime.utcnow()
        
        # Update all tool steps from PROPOSED to READY_TO_EXECUTE
        from models import ToolExecutionStatus
        tool_steps = self.db.query(ToolStepModel).filter(
            ToolStepModel.hop_id == hop_id,
            ToolStepModel.user_id == user_id,
            ToolStepModel.status == ToolExecutionStatus.PROPOSED
        ).all()
        
        updated_tool_steps = 0
        for tool_step in tool_steps:
            tool_step.status = ToolExecutionStatus.READY_TO_EXECUTE
            tool_step.updated_at = datetime.utcnow()
            updated_tool_steps += 1
        
        self.db.commit()
        
        return TransactionResult(
            success=True,
            entity_id=hop_id,
            status="HOP_IMPL_READY",
            message="Hop implementation accepted and ready for execution",
            metadata={
                "hop_id": hop_id,
                "tool_steps_updated": updated_tool_steps,
                "tool_steps_status": "READY_TO_EXECUTE"
            }
        )
    
    async def _execute_hop(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle hop execution start: HOP_IMPL_READY → EXECUTING"""
        hop_id = data['hop_id']
        user_id = data['user_id']
        
        hop_model = self.db.query(HopModel).filter(
            HopModel.id == hop_id,
            HopModel.user_id == user_id
        ).first()
        
        self._validate_entity_exists(hop_model, "Hop", hop_id)
        self._validate_transition("Hop", hop_id, hop_model.status.value, "hop_impl_ready", user_id)
        
        hop_model.status = HopStatus.EXECUTING.value
        hop_model.updated_at = datetime.utcnow()
        
        # Start the first tool step execution
        from models import ToolExecutionStatus
        first_tool_step = self.db.query(ToolStepModel).filter(
            ToolStepModel.hop_id == hop_id,
            ToolStepModel.user_id == user_id,
            ToolStepModel.sequence_order == 1
        ).first()
        
        first_step_updated = False
        if first_tool_step and first_tool_step.status == ToolExecutionStatus.READY_TO_EXECUTE:
            first_tool_step.status = ToolExecutionStatus.EXECUTING
            first_tool_step.started_at = datetime.utcnow()
            first_tool_step.updated_at = datetime.utcnow()
            first_step_updated = True
        
        self.db.commit()
        
        return TransactionResult(
            success=True,
            entity_id=hop_id,
            status="EXECUTING",
            message="Hop execution started - first tool step now executing",
            metadata={
                "hop_id": hop_id,
                "first_step_updated": first_step_updated,
                "first_step_id": first_tool_step.id if first_tool_step else None,
                "first_step_status": "EXECUTING" if first_step_updated else "NOT_FOUND"
            }
        )
    
    async def _complete_hop(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle hop completion: EXECUTING → COMPLETED"""
        hop_id = data['hop_id']
        user_id = data['user_id']
        execution_result = data.get('execution_result')
        
        hop_model = self.db.query(HopModel).filter(
            HopModel.id == hop_id,
            HopModel.user_id == user_id
        ).first()
        
        self._validate_entity_exists(hop_model, "Hop", hop_id)
        self._validate_transition("Hop", hop_id, hop_model.status.value, "executing", user_id)
        
        # Complete hop
        hop_model.status = HopStatus.COMPLETED.value
        hop_model.is_resolved = True
        hop_model.updated_at = datetime.utcnow()
        
        if execution_result:
            hop_model.hop_metadata = {
                **hop_model.hop_metadata,
                'execution_result': execution_result,
                'completed_at': datetime.utcnow().isoformat()
            }
        
        # NOTE: Asset promotion concept removed - assets are created at correct scope from the start
        
        # Update mission
        mission_model = self.db.query(MissionModel).filter(
            MissionModel.id == hop_model.mission_id,
            MissionModel.user_id == user_id
        ).first()
        
        if hop_model.is_final:
            # Final hop - complete mission
            mission_model.status = MissionStatus.COMPLETED
            mission_status = "COMPLETED"
            message = "Final hop completed - mission completed"
        else:
            # Non-final hop - reset current_hop_id for next hop
            mission_model.current_hop_id = None
            mission_status = "IN_PROGRESS"
            message = "Hop completed - mission ready for next hop"
        
        mission_model.updated_at = datetime.utcnow()
        
        self.db.commit()
        
        return TransactionResult(
            success=True,
            entity_id=hop_id,
            status="COMPLETED",
            message=message,
            metadata={
                "hop_id": hop_id,
                "mission_id": hop_model.mission_id,
                "hop_status": "COMPLETED",
                "mission_status": mission_status,
                "is_final": hop_model.is_final
            }
        )
    
    async def _complete_mission(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle mission completion: IN_PROGRESS → COMPLETED"""
        mission_id = data['mission_id']
        user_id = data['user_id']
        
        mission_model = self.db.query(MissionModel).filter(
            MissionModel.id == mission_id,
            MissionModel.user_id == user_id
        ).first()
        
        self._validate_entity_exists(mission_model, "Mission", mission_id)
        
        mission_model.status = MissionStatus.COMPLETED
        mission_model.updated_at = datetime.utcnow()
        
        self.db.commit()
        
        return TransactionResult(
            success=True,
            entity_id=mission_id,
            status="COMPLETED",
            message="Mission completed successfully",
            metadata={"mission_id": mission_id}
        )
    
    async def _complete_tool_step(self, data: Dict[str, Any]) -> TransactionResult:
        """Handle tool step completion with real tool execution results"""
        tool_step_id = data['tool_step_id']
        user_id = data['user_id']
        execution_result = data.get('execution_result', {})
        
        logger.info(f"StateTransitionService._complete_tool_step called - tool_step_id: {tool_step_id}, user_id: {user_id}, has_execution_result: {bool(execution_result)}, execution_result: {execution_result}")
        
        # Get tool step
        tool_step_model = self.db.query(ToolStepModel).filter(
            ToolStepModel.id == tool_step_id,
            ToolStepModel.user_id == user_id
        ).first()
        
        self._validate_entity_exists(tool_step_model, "ToolStep", tool_step_id)
        
        # Validate tool step can be completed
        from models import ToolExecutionStatus
        valid_statuses = [ToolExecutionStatus.PROPOSED, ToolExecutionStatus.READY_TO_EXECUTE, ToolExecutionStatus.EXECUTING]
        if tool_step_model.status not in valid_statuses:
            raise StateTransitionError(
                f"Tool step {tool_step_id} must be in {[s.value for s in valid_statuses]}, current: {tool_step_model.status.value}"
            )
        
        # Update tool step status with real execution results
        tool_step_model.status = ToolExecutionStatus.COMPLETED
        tool_step_model.execution_result = execution_result
        tool_step_model.completed_at = datetime.utcnow()
        tool_step_model.updated_at = datetime.utcnow()
        
        if not tool_step_model.started_at:
            tool_step_model.started_at = datetime.utcnow()
        
        # Update output assets based on result_mapping and real tool outputs
        logger.info(f"About to update output assets from tool step {tool_step_id}")
        assets_updated = await self._update_output_assets_from_tool_step(tool_step_model, execution_result, user_id)
        logger.info(f"Updated output assets - tool_step_id: {tool_step_id}, assets_updated: {assets_updated}, num_assets: {len(assets_updated)}")
        
        # Check if we were supposed to update assets but didn't
        if tool_step_model.result_mapping and len(assets_updated) == 0:
            logger.error(f"CRITICAL: Tool step {tool_step_id} has result_mapping but NO assets were updated!")
            logger.error(f"Result mapping: {tool_step_model.result_mapping}")
            logger.error(f"Tool outputs: {list(execution_result.get('outputs', {}).keys())}")
            # Don't fail the transaction - just log the error for now
        
        # Check if all tool steps in the hop are completed
        hop_model = self.db.query(HopModel).filter(HopModel.id == tool_step_model.hop_id).first()
        hop_progress = await self._check_hop_progress(tool_step_model.hop_id, user_id)
        
        # Check if hop should be marked as completed
        hop_completed = False
        mission_completed = False
        
        logger.info(f"Checking hop completion - hop_id: {tool_step_model.hop_id}, hop_progress: {hop_progress}")
        
        if hop_progress['all_completed']:
            # Mark hop as completed
            logger.info(f"Marking hop {tool_step_model.hop_id} as completed")
            hop_model.status = HopStatus.COMPLETED
            hop_model.updated_at = datetime.utcnow()
            hop_completed = True
            
            # Check if mission should be marked as completed
            mission_model = self.db.query(MissionModel).filter(MissionModel.id == hop_model.mission_id).first()
            if mission_model:
                mission_completed = await self._check_and_complete_mission_if_ready(mission_model, user_id)
        
        self.db.commit()
        
        logger.info(f"Tool step completion transaction committed - tool_step_id: {tool_step_id}, hop_completed: {hop_completed}, mission_completed: {mission_completed}, assets_updated_count: {len(assets_updated)}")
        
        return TransactionResult(
            success=True,
            entity_id=tool_step_id,
            status="COMPLETED",
            message="Tool step completed successfully",
            metadata={
                "tool_step_id": tool_step_id,
                "hop_id": tool_step_model.hop_id,
                "mission_id": hop_model.mission_id if hop_model else None,
                "assets_updated": assets_updated,
                "hop_progress": hop_progress,
                "hop_completed": hop_completed,
                "mission_completed": mission_completed,
                "execution_result": execution_result
            }
        )
    
    # Helper methods
    
    def add_asset_to_hop(self, hop_id: str, asset_id: str, role: str) -> None:
        """Single method to add an asset to a hop with a specific role"""
        from models import AssetRole
        print(f"DEBUG: Adding asset {asset_id} to hop {hop_id} with role {role}")
        asset_role = AssetRole(role)
        result = self.asset_mapping_service.add_hop_asset(hop_id, asset_id, asset_role)
        print(f"DEBUG: Asset mapping created with ID: {result}")
    
    async def _initialize_hop_assets(self, mission_id: str, hop_id: str, user_id: int, hop_data: Dict[str, Any]):
        """Initialize hop assets using explicit asset mappings"""
        from models import AssetRole
        
        # Process explicit hop asset mappings
        hop_asset_mappings = hop_data.get('hop_asset_mappings', [])
        print(f"DEBUG: Processing {len(hop_asset_mappings)} hop asset mappings for hop {hop_id}")
        for mapping in hop_asset_mappings:
            asset_id = mapping.get('asset_id')
            role = mapping.get('role')  # 'input', 'output', 'intermediate'
            print(f"DEBUG: Processing mapping: asset_id={asset_id}, role={role}")
            
            if asset_id and role:
                self.add_asset_to_hop(hop_id, asset_id, role)
            else:
                print(f"DEBUG: Skipping invalid mapping: {mapping}")
        
        # Create new mission assets if specified
        new_assets = hop_data.get('new_mission_assets', [])
        for asset_spec in new_assets:
            # Create asset at MISSION scope
            created_asset = self.asset_service.create_asset(
                user_id=user_id,
                name=asset_spec.get('name', 'Mission Output'),
                schema_definition=asset_spec.get('schema_definition', {'type': 'text', 'description': 'Default text output'}),
                subtype=asset_spec.get('subtype'),
                description=asset_spec.get('description', f'Output created by {hop_data.get("name", "hop")}'),
                content="",
                asset_metadata={
                    'created_by_hop': hop_id,
                    'hop_name': hop_data.get('name'),
                    'created_at': datetime.utcnow().isoformat()
                },
                scope_type=AssetScopeType.MISSION.value,
                scope_id=mission_id,
                role=asset_spec.get('mission_role', AssetRole.INTERMEDIATE.value)
            )
            
            # Add to mission asset mapping
            mission_role = AssetRole(asset_spec.get('mission_role', 'intermediate'))
            self.asset_mapping_service.add_mission_asset(mission_id, created_asset.id, mission_role)
            
            # Add to hop asset mapping if specified
            hop_role = asset_spec.get('hop_role')
            if hop_role:
                self.add_asset_to_hop(hop_id, created_asset.id, hop_role)
    
    async def _initialize_hop_assets_from_lite(self, mission_id: str, hop_id: str, user_id: int, hop_lite) -> None:
        """Initialize hop assets from HopLite object"""
        from schemas.lite_models import NewAssetOutput, ExistingAssetOutput, create_asset_from_lite
        from models import AssetRole
        
        print(f"DEBUG: Initializing hop assets from HopLite - inputs: {hop_lite.inputs}, output: {hop_lite.output}")
        
        # Add input assets as hop inputs
        for asset_id in hop_lite.inputs:
            print(f"DEBUG: Adding input asset {asset_id} to hop {hop_id}")
            self.add_asset_to_hop(hop_id, asset_id, 'input')
        
        # Handle output asset specification
        if isinstance(hop_lite.output, NewAssetOutput):
            print(f"DEBUG: Creating new mission asset for hop output")
            # Create new mission asset and add as hop output
            asset = create_asset_from_lite(hop_lite.output.asset)
            created_asset = self.asset_service.create_asset(
                user_id=user_id,
                name=asset.name,
                schema_definition=asset.schema_definition.model_dump(),
                subtype=asset.subtype,
                description=asset.description,
                content="",
                scope_type=AssetScopeType.MISSION.value,
                scope_id=mission_id,
                role=AssetRole.INTERMEDIATE.value
            )
            
            # Add to mission asset mapping
            mission_role = AssetRole('intermediate')
            self.asset_mapping_service.add_mission_asset(mission_id, created_asset.id, mission_role)
            
            # Add to hop asset mapping as output
            self.add_asset_to_hop(hop_id, created_asset.id, 'output')
            
        elif isinstance(hop_lite.output, ExistingAssetOutput):
            print(f"DEBUG: Using existing mission asset {hop_lite.output.mission_asset_id} as hop output")
            # Reference existing mission asset as hop output
            self.add_asset_to_hop(hop_id, hop_lite.output.mission_asset_id, 'output')
        
        print(f"DEBUG: Completed hop asset initialization for hop {hop_id}")

    async def _update_output_assets_from_tool_step(self, tool_step_model: ToolStepModel, execution_result: Dict[str, Any], user_id: int) -> List[str]:
        """Update existing output assets based on tool step execution results - tools never create assets"""
        assets_updated = []
        result_mapping = tool_step_model.result_mapping or {}
        tool_outputs = execution_result.get("outputs", {})
        
        logger.info(f"Updating output assets from tool step - tool_step_id: {tool_step_model.id}, result_mapping: {result_mapping}, outputs: {tool_outputs}, execution_result_keys: {list(execution_result.keys())}")
        
        # Follow spec: Extract tool outputs and map to assets
        for output_name, mapping_config in result_mapping.items():
            if mapping_config.get('type') == 'asset_field':
                # Handle mapping mismatches - check if the exact output exists, otherwise try common alternatives
                output_value = None
                if output_name in tool_outputs:
                    output_value = tool_outputs[output_name]
                else:
                    # Handle common mapping mismatches for tools
                    if output_name == 'generated_queries' and 'optimized_query' in tool_outputs:
                        # Map optimized_query to generated_queries for pubmed_generate_query tool
                        output_value = tool_outputs['optimized_query']
                        logger.info(f"Mapping mismatch resolved: {output_name} -> optimized_query")
                
                if output_value is None:
                    logger.warning(f"Output {output_name} not found in tool outputs: {list(tool_outputs.keys())}")
                    continue
                
                asset_id = mapping_config.get('state_asset_id')  # Fixed: use state_asset_id not asset_name
                
                if not asset_id:
                    logger.warning(f"No state_asset_id found in result mapping for output {output_name}")
                    continue
                
                logger.info(f"Processing output {output_name} -> asset {asset_id}")
                
                # Validate asset_id looks like a UUID
                import uuid
                try:
                    uuid.UUID(asset_id)
                except ValueError:
                    logger.error(f"INVALID ASSET ID: '{asset_id}' is not a valid UUID - looks like an asset name was provided instead of an ID")
                    logger.error(f"Result mapping for {output_name}: {mapping_config}")
                    logger.error(f"This is likely an LLM error - the LLM should provide asset UUIDs, not asset names")
                    continue
                
                # Tools only update existing assets - they never create new ones
                try:
                    logger.info(f"Looking up asset {asset_id} for user {user_id}")
                    existing_asset = self.asset_service.get_asset(asset_id, user_id)
                    logger.info(f"Found asset: {existing_asset.name} (status: {existing_asset.status})")
                    
                    # Update existing asset with tool output
                    logger.info(f"Updating asset {asset_id} with tool output - current status: {existing_asset.status}, value_length: {len(str(output_value))}")
                    self.asset_service.update_asset(
                        asset_id=asset_id,
                        user_id=user_id,
                        updates={
                            'content': output_value,
                            'status': 'ready',  # Mark asset as ready when updated by tool
                            'asset_metadata': {
                                **existing_asset.asset_metadata,
                                'updated_by_tool': tool_step_model.tool_id,
                                'tool_step_id': tool_step_model.id,
                                'output_name': output_name,
                                'updated_at': datetime.utcnow().isoformat()
                            }
                        }
                    )
                    logger.info(f"Successfully updated asset {asset_id} - marked as READY")
                    assets_updated.append(asset_id)
                    
                except AssetNotFoundError:
                    logger.error(f"Asset {asset_id} not found - tools can only update existing assets, not create new ones")
                    logger.error(f"This likely means the asset was never created or the wrong asset ID was provided")
                    continue
                except Exception as e:
                    logger.error(f"Unexpected error updating asset {asset_id}: {str(e)}")
                    logger.error(f"Exception type: {type(e).__name__}")
                    continue
        
        return assets_updated
    
    def _determine_asset_type(self, output_data: Any) -> str:
        """Determine appropriate asset type based on output data"""
        if isinstance(output_data, str):
            return "text"
        elif isinstance(output_data, dict):
            return "json"
        elif isinstance(output_data, list):
            return "json"
        elif isinstance(output_data, (int, float)):
            return "number"
        elif isinstance(output_data, bool):
            return "boolean"
        else:
            return "text"  # Default fallback
    
    async def _check_hop_progress(self, hop_id: str, user_id: int) -> Dict[str, Any]:
        """Check progress of all tool steps in a hop"""
        tool_steps = self.db.query(ToolStepModel).filter(
            ToolStepModel.hop_id == hop_id,
            ToolStepModel.user_id == user_id
        ).order_by(ToolStepModel.sequence_order).all()
        
        from models import ToolExecutionStatus
        total_steps = len(tool_steps)
        completed_steps = len([step for step in tool_steps if step.status == ToolExecutionStatus.COMPLETED])
        
        progress = {
            "total_steps": total_steps,
            "completed_steps": completed_steps,
            "progress_percentage": (completed_steps / total_steps * 100) if total_steps > 0 else 0,
            "all_completed": completed_steps == total_steps,
            "step_statuses": [
                {
                    "step_id": step.id,
                    "name": step.name,
                    "status": step.status.value,
                    "sequence_order": step.sequence_order
                }
                for step in tool_steps
            ]
        }
        
        return progress
    
    async def _check_and_complete_mission_if_ready(self, mission_model: MissionModel, user_id: int) -> bool:
        """
        CORE BUSINESS LOGIC: Check if mission should be completed.
        
        BUSINESS RULE: A mission is complete when ALL OUTPUT ASSETS are in READY status.
        This is the definitive completion criteria - not when hops are done.
        
        Args:
            mission_model: The mission to check
            user_id: User ID for asset access
            
        Returns:
            bool: True if mission was marked as completed, False otherwise
        """
        logger.info(f"Checking mission completion for mission {mission_model.id}")
        
        # Get all mission-scoped output assets
        mission_output_assets = self.asset_service.get_assets_by_scope(user_id, "mission", mission_model.id)
        output_assets = [asset for asset in mission_output_assets if asset.role.value == 'output']
        
        logger.info(f"Mission {mission_model.id} completion check - total_output_assets: {len(output_assets)}, output_asset_statuses: {[asset.status.value for asset in output_assets]}")
        
        # BUSINESS RULE: ALL output assets must be READY
        all_outputs_ready = all(asset.status.value == 'ready' for asset in output_assets) if output_assets else False
        has_output_assets = len(output_assets) > 0
        
        if all_outputs_ready and has_output_assets:
            logger.info(f"MISSION COMPLETION: Marking mission {mission_model.id} as completed - all {len(output_assets)} output assets are ready")
            mission_model.status = MissionStatus.COMPLETED
            mission_model.updated_at = datetime.utcnow()
            return True
        else:
            logger.info(f"Mission {mission_model.id} not ready for completion - output_assets_count: {len(output_assets)}, all_outputs_ready: {all_outputs_ready}, has_output_assets: {has_output_assets}")
            return False


# Dependency function for FastAPI
def get_state_transition_service(db: Session = Depends(get_db)) -> StateTransitionService:
    """Get StateTransitionService instance"""
    from services.user_session_service import UserSessionService
    session_service = UserSessionService(db)
    return StateTransitionService(db, session_service) 