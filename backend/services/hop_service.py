from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from datetime import datetime
from uuid import uuid4
import logging

from models import Hop as HopModel, HopStatus

from exceptions import HopNotFoundError
from schemas.workflow import Hop, HopStatus as HopStatusSchema

from services.asset_service import AssetService
from services.asset_mapping_service import AssetMappingService

# Create logger for this module
logger = logging.getLogger(__name__)


class HopService:
    def __init__(self, db: Session):
        self.db = db
        self.asset_service = AssetService(db)
        self.asset_mapping_service = AssetMappingService(db)

    async def _model_to_schema(self, hop_model: HopModel, load_assets: bool = True) -> Hop:
        """Convert database model to Hop schema with optional asset loading"""
        hop_asset_map = {}
        assets = []
        tool_steps = []
        
        if load_assets:
            # Get hop asset mapping
            hop_asset_map = self.asset_mapping_service.get_hop_assets(hop_model.id)
            logger.debug(
                "Loading hop assets",
                extra={
                    "hop_id": hop_model.id,
                    "asset_count": len(hop_asset_map),
                    "asset_map": {k: v.value for k, v in hop_asset_map.items()}
                }
            )
            
            # Load full Asset objects for frontend compatibility
            for asset_id in hop_asset_map.keys():
                asset = self.asset_service.get_asset(asset_id, hop_model.user_id)
                if asset:
                    assets.append(asset)
                    logger.debug(
                        "Loaded asset for hop",
                        extra={"hop_id": hop_model.id, "asset_id": asset_id}
                    )
                else:
                    logger.warning(
                        "Failed to load asset for hop",
                        extra={"hop_id": hop_model.id, "asset_id": asset_id}
                    )
            
            logger.debug(
                "Hop asset loading complete",
                extra={"hop_id": hop_model.id, "total_assets_loaded": len(assets)}
            )
        
        # Load tool steps for this hop
        from services.tool_step_service import ToolStepService
        tool_step_service = ToolStepService(self.db)
        try:
            tool_steps = await tool_step_service.get_tool_steps_by_hop(hop_model.id, hop_model.user_id)
        except Exception as e:
            logger.warning(
                "Failed to load tool steps for hop",
                extra={
                    "hop_id": hop_model.id,
                    "user_id": hop_model.user_id,
                    "error": str(e)
                }
            )
            tool_steps = []
        
        return Hop(
            id=hop_model.id,
            name=hop_model.name,
            description=hop_model.description or "",
            goal=hop_model.goal,
            success_criteria=hop_model.success_criteria or [],
            sequence_order=hop_model.sequence_order,
            status=HopStatusSchema(hop_model.status.value),
            is_final=hop_model.is_final,
            is_resolved=hop_model.is_resolved,
            rationale=hop_model.rationale,
            error_message=hop_model.error_message,
            hop_metadata=hop_model.hop_metadata or {},
            hop_asset_map=hop_asset_map,
            assets=assets,
            tool_steps=tool_steps,
            created_at=hop_model.created_at,
            updated_at=hop_model.updated_at
        )

    async def create_hop(
        self,
        mission_id: str,
        user_id: int,
        name: str,
        description: str,
        goal: Optional[str] = None,
        success_criteria: Optional[List[str]] = None,
        input_asset_ids: Optional[List[str]] = None,
        output_asset_ids: Optional[List[str]] = None,
        rationale: Optional[str] = None,
        is_final: bool = False,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Hop:
        """Create a new hop with automatic sequence ordering"""
        
        # Get the next sequence order for this mission
        latest_hop = self.db.query(HopModel).filter(
            HopModel.mission_id == mission_id
        ).order_by(desc(HopModel.sequence_order)).first()
        
        next_sequence = (latest_hop.sequence_order + 1) if latest_hop else 1
        
        hop_model = HopModel(
            id=str(uuid4()),
            mission_id=mission_id,
            user_id=user_id,
            name=name,
            description=description,
            goal=goal,
            success_criteria=success_criteria or [],
            input_asset_ids=input_asset_ids or [],
            output_asset_ids=output_asset_ids or [],
            sequence_order=next_sequence,
            status=HopStatus.HOP_PLAN_STARTED,
            is_final=is_final,
            is_resolved=False,
            rationale=rationale,
            metadata=metadata or {}
        )
        
        self.db.add(hop_model)
        self.db.commit()
        self.db.refresh(hop_model)
        
        return await self._model_to_schema(hop_model)

    async def get_hop(self, hop_id: str, user_id: int) -> Hop:
        """Get a hop by ID - throws HopNotFoundError if not found"""
        hop_model = self.db.query(HopModel).filter(
            and_(HopModel.id == hop_id, HopModel.user_id == user_id)
        ).first()
        
        if not hop_model:
            raise HopNotFoundError(hop_id)
        
        return await self._model_to_schema(hop_model)

    async def get_hops_by_mission(self, mission_id: str, user_id: int) -> List[Hop]:
        """Get all hops for a mission, ordered by sequence"""
        hop_models = self.db.query(HopModel).filter(
            and_(HopModel.mission_id == mission_id, HopModel.user_id == user_id)
        ).order_by(HopModel.sequence_order).all()
        
        # Convert models to schemas using asyncio.gather for concurrent execution
        import asyncio
        return await asyncio.gather(*[self._model_to_schema(hop_model) for hop_model in hop_models])

    async def execute_hop(self, hop_id: str, user_id: int) -> Dict[str, Any]:
        """Execute all tool steps in a hop sequentially"""
        logger.info(f"Starting hop execution for hop {hop_id}", extra={"hop_id": hop_id, "user_id": user_id})
        
        # Get the hop (throws HopNotFoundError if not found)
        hop = await self.get_hop(hop_id, user_id)
        
        logger.info(f"Hop {hop_id} current status: {hop.status.value}", extra={"hop_id": hop_id, "status": hop.status.value})
        
        # Check if hop is ready for execution or failed (allow retry)
        if hop.status not in [HopStatusSchema.HOP_IMPL_READY, HopStatusSchema.FAILED]:
            error_msg = f"Hop status is {hop.status.value}, expected HOP_IMPL_READY or FAILED"
            logger.error(error_msg, extra={
                "hop_id": hop_id, 
                "current_status": hop.status.value,
                "allowed_statuses": ["HOP_IMPL_READY", "FAILED"]
            })
            return {
                "success": False,
                "errors": [error_msg],
                "message": f"Hop is not ready for execution (status: {hop.status.value})",
                "executed_steps": 0,
                "total_steps": len(hop.tool_steps)
            }
        
        # If hop is FAILED, reset it to HOP_IMPL_READY before execution
        if hop.status == HopStatusSchema.FAILED:
            logger.info(f"Hop {hop_id} is in FAILED status, resetting to HOP_IMPL_READY for retry")
            await self.update_hop_status(hop_id, user_id, HopStatusSchema.HOP_IMPL_READY)
        
        # Update hop status to EXECUTING
        await self.update_hop_status(hop_id, user_id, HopStatusSchema.EXECUTING)
        
        tool_steps = hop.tool_steps
        total_steps = len(tool_steps)
        executed_steps = 0
        errors = []
        
        try:
            # Execute tool steps in sequence order
            from services.tool_execution_service import ToolExecutionService
            tool_execution_service = ToolExecutionService(self.db)
            
            for step in sorted(tool_steps, key=lambda x: x.sequence_order):
                try:
                    logger.info(
                        f"Executing tool step {step.id} (step {step.sequence_order})",
                        extra={
                            "hop_id": hop_id,
                            "tool_step_id": step.id,
                            "tool_id": step.tool_id,
                            "sequence_order": step.sequence_order
                        }
                    )
                    
                    result = await tool_execution_service.execute_tool_step(
                        step.id, 
                        user_id
                    )
                    
                    logger.info(f"Tool step {step.id} execution result", extra={
                        "tool_step_id": step.id,
                        "result": result,
                        "success": result.get('success', False)
                    })
                    
                    if result.get('success', False):
                        executed_steps += 1
                        logger.info(f"Tool step {step.id} completed successfully")
                    else:
                        error_msg = f"Tool step {step.id} failed: {result.get('error', 'Unknown error')}"
                        errors.append(error_msg)
                        logger.error(error_msg, extra={
                            "tool_step_id": step.id,
                            "result": result,
                            "error_details": result.get('error_details', {}),
                            "execution_metadata": result.get('metadata', {})
                        })
                        break  # Stop execution on first failure
                        
                except Exception as e:
                    error_msg = f"Tool step {step.id} execution error: {str(e)}"
                    errors.append(error_msg)
                    logger.error(error_msg, extra={
                        "tool_step_id": step.id, 
                        "error": str(e),
                        "exception_type": type(e).__name__,
                        "tool_id": step.tool_id,
                        "parameter_mapping": step.parameter_mapping
                    })
                    break  # Stop execution on first error
            
            # Determine final status
            if executed_steps == total_steps and not errors:
                # All steps completed successfully
                await self.update_hop_status(hop_id, user_id, HopStatusSchema.COMPLETED)
                success_msg = f"Hop executed successfully. All {executed_steps} tool steps completed."
                logger.info(success_msg, extra={
                    "hop_id": hop_id,
                    "executed_steps": executed_steps,
                    "total_steps": total_steps
                })
                return {
                    "success": True,
                    "errors": [],
                    "message": success_msg,
                    "executed_steps": executed_steps,
                    "total_steps": total_steps
                }
            else:
                # Some steps failed
                error_summary = "; ".join(errors) if errors else "Execution incomplete"
                await self.update_hop_status(hop_id, user_id, HopStatusSchema.FAILED, error_message=error_summary)
                failure_msg = f"Hop execution failed. Executed {executed_steps}/{total_steps} tool steps."
                logger.error(failure_msg, extra={
                    "hop_id": hop_id,
                    "executed_steps": executed_steps,
                    "total_steps": total_steps,
                    "errors": errors,
                    "error_summary": error_summary
                })
                return {
                    "success": False,
                    "errors": errors,
                    "message": failure_msg,
                    "executed_steps": executed_steps,
                    "total_steps": total_steps
                }
                
        except Exception as e:
            # Unexpected error during execution
            error_msg = f"Hop execution failed with error: {str(e)}"
            logger.error(error_msg, extra={
                "hop_id": hop_id, 
                "user_id": user_id,
                "error": str(e),
                "executed_steps": executed_steps,
                "total_steps": total_steps,
                "exception_type": type(e).__name__
            })
            await self.update_hop_status(hop_id, user_id, HopStatusSchema.FAILED, error_message=error_msg)
            
            return {
                "success": False,
                "errors": [error_msg],
                "message": "Hop execution failed due to unexpected error",
                "executed_steps": executed_steps,
                "total_steps": total_steps
            }

    async def update_hop(
        self,
        hop_id: str,
        user_id: int,
        updates: Dict[str, Any]
    ) -> Hop:
        """Update a hop - throws HopNotFoundError if not found"""
        hop_model = self.db.query(HopModel).filter(
            and_(HopModel.id == hop_id, HopModel.user_id == user_id)
        ).first()
        
        if not hop_model:
            raise HopNotFoundError(hop_id)
        
        # Handle status updates
        if 'status' in updates:
            if isinstance(updates['status'], str):
                updates['status'] = HopStatus(updates['status'])
        
        # Update fields
        for key, value in updates.items():
            if hasattr(hop_model, key):
                setattr(hop_model, key, value)
        
        hop_model.updated_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(hop_model)
        
        return await self._model_to_schema(hop_model)

    async def update_hop_status(
        self,
        hop_id: str,
        user_id: int,
        status: HopStatusSchema,
        error_message: Optional[str] = None
    ) -> Optional[Hop]:
        """Update hop status with optional error message and coordinate with mission status"""
        # For completion status, use StateTransitionService for atomic coordination
        if status == HopStatusSchema.COMPLETED:
            try:
                from services.state_transition_service import StateTransitionService
                state_service = StateTransitionService(self.db)
                
                # Use atomic completion operation
                mission, hop = await state_service.complete_hop_and_update_mission(
                    hop_id=hop_id,
                    user_id=user_id,
                    execution_result=None
                )
                
                print(f"Hop {hop_id} completed with atomic mission coordination")
                return hop
                
            except Exception as e:
                print(f"Failed to complete hop with coordination: {str(e)}")
                # Fall back to simple update if coordination fails
                pass
        
        # For other status updates, use simple update
        updates = {
            'status': HopStatus(status.value),
            'updated_at': datetime.utcnow()
        }
        
        if error_message:
            updates['error_message'] = error_message
        elif status == HopStatusSchema.COMPLETED:
            # Clear error message on successful completion
            updates['error_message'] = None
        
        hop = await self.update_hop(hop_id, user_id, updates)
        
        # For non-completion updates, still coordinate mission status
        if hop and status != HopStatusSchema.COMPLETED:
            try:
                # Import here to avoid circular imports
                from services.mission_service import MissionService
                
                # Get the mission ID from the hop
                hop_model = self.db.query(HopModel).filter(
                    HopModel.id == hop_id
                ).first()
                
                if hop_model and hop_model.mission_id:
                    mission_service = MissionService(self.db)
                    await mission_service.coordinate_mission_status_with_hop(
                        hop_model.mission_id, 
                        user_id, 
                        status
                    )
                    print(f"Mission status coordinated for hop {hop_id} with status {status}")
            except Exception as e:
                print(f"Failed to coordinate mission status for hop {hop_id}: {str(e)}")
                # Don't fail the hop update if mission coordination fails
        
        return hop

    async def delete_hop(self, hop_id: str, user_id: int) -> None:
        """Delete a hop - throws HopNotFoundError if not found"""
        hop_model = self.db.query(HopModel).filter(
            and_(HopModel.id == hop_id, HopModel.user_id == user_id)
        ).first()
        
        if not hop_model:
            raise HopNotFoundError(hop_id)
        
        self.db.delete(hop_model)
        self.db.commit()

    async def get_current_hop(self, mission_id: str, user_id: int) -> Optional[Hop]:
        """Get the current active hop for a mission"""
        # Get the first hop that is not completed
        hop_model = self.db.query(HopModel).filter(
            and_(
                HopModel.mission_id == mission_id,
                HopModel.user_id == user_id,
                HopModel.status.notin_([HopStatus.COMPLETED, HopStatus.CANCELLED])
            )
        ).order_by(HopModel.sequence_order).first()
        
        if not hop_model:
            return None
        
        return await self._model_to_schema(hop_model)

    async def get_completed_hops(self, mission_id: str, user_id: int) -> List[Hop]:
        """Get all completed hops for a mission"""
        hop_models = self.db.query(HopModel).filter(
            and_(
                HopModel.mission_id == mission_id,
                HopModel.user_id == user_id,
                HopModel.status == HopStatus.COMPLETED
            )
        ).order_by(HopModel.sequence_order).all()
        
        # Convert models to schemas using asyncio.gather for concurrent execution
        import asyncio
        return await asyncio.gather(*[self._model_to_schema(hop_model) for hop_model in hop_models])

    async def reorder_hops(
        self,
        mission_id: str,
        user_id: int,
        hop_id_order: List[str]
    ) -> List[Hop]:
        """Reorder hops by updating their sequence_order"""
        updated_hops = []
        
        for i, hop_id in enumerate(hop_id_order):
            hop_model = self.db.query(HopModel).filter(
                and_(
                    HopModel.id == hop_id,
                    HopModel.mission_id == mission_id,
                    HopModel.user_id == user_id
                )
            ).first()
            
            if hop_model:
                hop_model.sequence_order = i + 1
                hop_model.updated_at = datetime.utcnow()
                updated_hops.append(await self._model_to_schema(hop_model))
        
        self.db.commit()
        
        return updated_hops 