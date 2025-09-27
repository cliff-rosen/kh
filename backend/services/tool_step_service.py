from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from datetime import datetime
from uuid import uuid4
import logging

from models import ToolStep as ToolStepModel, ToolExecutionStatus
from schemas.workflow import ToolStep, AssetFieldMapping, LiteralMapping, DiscardMapping
from services.asset_service import AssetService
from exceptions import ToolStepNotFoundError

# Create logger for this module
logger = logging.getLogger(__name__)


class ToolStepService:
    def __init__(self, db: Session):
        self.db = db
        self.asset_service = AssetService(db)

    def _convert_parameter_mapping(self, raw_mapping: Dict[str, Any]) -> Dict[str, Any]:
        """Convert raw JSON parameter mapping to proper Pydantic models"""
        converted = {}
        for key, value in raw_mapping.items():
            if isinstance(value, dict):
                if value.get('type') == 'asset_field':
                    converted[key] = AssetFieldMapping(**value)
                elif value.get('type') == 'literal':
                    converted[key] = LiteralMapping(**value)
                else:
                    # Unknown type, keep as dict for now
                    converted[key] = value
            else:
                # Not a dict, keep as is
                converted[key] = value
        return converted

    def _convert_result_mapping(self, raw_mapping: Dict[str, Any]) -> Dict[str, Any]:
        """Convert raw JSON result mapping to proper Pydantic models"""
        converted = {}
        for key, value in raw_mapping.items():
            if isinstance(value, dict):
                if value.get('type') == 'asset_field':
                    converted[key] = AssetFieldMapping(**value)
                elif value.get('type') == 'discard':
                    converted[key] = DiscardMapping(**value)
                else:
                    # Unknown type, keep as dict for now
                    converted[key] = value
            else:
                # Not a dict, keep as is
                converted[key] = value
        return converted

    def _model_to_schema(self, tool_step_model: ToolStepModel) -> ToolStep:
        """Convert database model to ToolStep schema"""
        try:
            # Convert raw JSON mappings to proper Pydantic models
            parameter_mapping = self._convert_parameter_mapping(tool_step_model.parameter_mapping or {})
            result_mapping = self._convert_result_mapping(tool_step_model.result_mapping or {})
            
            return ToolStep(
                id=tool_step_model.id,
                tool_id=tool_step_model.tool_id,
                name=tool_step_model.name or tool_step_model.description or f"Step {tool_step_model.sequence_order}",
                description=tool_step_model.description or "",
                sequence_order=tool_step_model.sequence_order,
                hop_id=tool_step_model.hop_id,
                resource_configs=tool_step_model.resource_configs or {},
                parameter_mapping=parameter_mapping,
                result_mapping=result_mapping,
                status=ToolExecutionStatus(tool_step_model.status.value),
                error_message=tool_step_model.error_message,
                validation_errors=tool_step_model.validation_errors or [],
                created_at=tool_step_model.created_at,
                updated_at=tool_step_model.updated_at
            )
        except Exception as e:
            # If validation fails, create a simplified ToolStep with validation errors
            error_msg = f"ToolStep validation failed for {tool_step_model.id}: {str(e)}"
            if hasattr(e, 'errors'):
                error_msg += f" | Pydantic errors: {e.errors()}"
            
            logger.warning(
                error_msg,
                extra={
                    "tool_step_id": tool_step_model.id,
                    "hop_id": tool_step_model.hop_id,
                    "parameter_mapping_raw": tool_step_model.parameter_mapping,
                    "result_mapping_raw": tool_step_model.result_mapping
                }
            )
            return ToolStep(
                id=tool_step_model.id,
                tool_id=tool_step_model.tool_id,
                name=tool_step_model.name or tool_step_model.description or f"Step {tool_step_model.sequence_order}",
                description=tool_step_model.description or "",
                sequence_order=tool_step_model.sequence_order,
                hop_id=tool_step_model.hop_id,
                resource_configs={},  # Reset to empty if validation fails
                parameter_mapping={},  # Reset to empty if validation fails
                result_mapping={},  # Reset to empty if validation fails
                status=ToolExecutionStatus.ERROR,
                error_message=f"Validation error: {str(e)}",
                validation_errors=[f"Schema validation failed: {str(e)}"],
                created_at=tool_step_model.created_at,
                updated_at=tool_step_model.updated_at
            )

    async def create_tool_step(
        self,
        hop_id: str,
        user_id: int,
        tool_id: str,
        description: str,
        resource_configs: Optional[Dict[str, Any]] = None,
        parameter_mapping: Optional[Dict[str, Any]] = None,
        result_mapping: Optional[Dict[str, Any]] = None,
        validation_errors: Optional[List[str]] = None
    ) -> ToolStep:
        """Create a new tool step with automatic sequence ordering"""
        
        # Get the next sequence order for this hop
        latest_tool_step = self.db.query(ToolStepModel).filter(
            ToolStepModel.hop_id == hop_id
        ).order_by(desc(ToolStepModel.sequence_order)).first()
        
        next_sequence = (latest_tool_step.sequence_order + 1) if latest_tool_step else 1
        
        tool_step_model = ToolStepModel(
            id=str(uuid4()),
            hop_id=hop_id,
            user_id=user_id,
            tool_id=tool_id,
            description=description,
            sequence_order=next_sequence,
            resource_configs=resource_configs or {},
            parameter_mapping=parameter_mapping or {},
            result_mapping=result_mapping or {},
            status=ToolExecutionStatus.PROPOSED,
            validation_errors=validation_errors
        )
        
        self.db.add(tool_step_model)
        self.db.commit()
        self.db.refresh(tool_step_model)
        
        return self._model_to_schema(tool_step_model)

    async def get_tool_step(self, tool_step_id: str, user_id: int) -> ToolStep:
        """Get a tool step by ID - throws ToolStepNotFoundError if not found"""
        tool_step_model = self.db.query(ToolStepModel).filter(
            and_(ToolStepModel.id == tool_step_id, ToolStepModel.user_id == user_id)
        ).first()
        
        if not tool_step_model:
            raise ToolStepNotFoundError(tool_step_id)
        
        return self._model_to_schema(tool_step_model)

    async def get_tool_steps_by_hop(self, hop_id: str, user_id: int) -> List[ToolStep]:
        """Get all tool steps for a hop, ordered by sequence"""
        tool_step_models = self.db.query(ToolStepModel).filter(
            and_(ToolStepModel.hop_id == hop_id, ToolStepModel.user_id == user_id)
        ).order_by(ToolStepModel.sequence_order).all()
        
        return [self._model_to_schema(tool_step_model) for tool_step_model in tool_step_models]

    async def update_tool_step(
        self,
        tool_step_id: str,
        user_id: int,
        updates: Dict[str, Any]
    ) -> ToolStep:
        """Update a tool step - throws ToolStepNotFoundError if not found"""
        tool_step_model = self.db.query(ToolStepModel).filter(
            and_(ToolStepModel.id == tool_step_id, ToolStepModel.user_id == user_id)
        ).first()
        
        if not tool_step_model:
            raise ToolStepNotFoundError(tool_step_id)
        
        # Handle status updates
        if 'status' in updates:
            if isinstance(updates['status'], str):
                updates['status'] = ToolExecutionStatus(updates['status'])
        
        # Update fields
        for key, value in updates.items():
            if hasattr(tool_step_model, key):
                setattr(tool_step_model, key, value)
        
        tool_step_model.updated_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(tool_step_model)
        
        return self._model_to_schema(tool_step_model)

    async def update_tool_step_status(
        self,
        tool_step_id: str,
        user_id: int,
        status: ToolExecutionStatus,
        error_message: Optional[str] = None,
        execution_result: Optional[Dict[str, Any]] = None
    ) -> ToolStep:
        """Update tool step status with optional error message and execution result - throws ToolStepNotFoundError if not found"""
        updates = {
            'status': ToolExecutionStatus(status.value),
            'updated_at': datetime.utcnow()
        }
        
        if error_message:
            updates['error_message'] = error_message
        elif status == ToolExecutionStatus.COMPLETED:
            # Clear error message on successful completion
            updates['error_message'] = None
        
        if execution_result:
            updates['execution_result'] = execution_result
        
        # Update timing fields
        if status == ToolExecutionStatus.EXECUTING:
            updates['started_at'] = datetime.utcnow()
        elif status == ToolExecutionStatus.COMPLETED:
            updates['completed_at'] = datetime.utcnow()
        
        return await self.update_tool_step(tool_step_id, user_id, updates)

    async def delete_tool_step(self, tool_step_id: str, user_id: int) -> None:
        """Delete a tool step - throws ToolStepNotFoundError if not found"""
        tool_step_model = self.db.query(ToolStepModel).filter(
            and_(ToolStepModel.id == tool_step_id, ToolStepModel.user_id == user_id)
        ).first()
        
        if not tool_step_model:
            raise ToolStepNotFoundError(tool_step_id)
        
        self.db.delete(tool_step_model)
        self.db.commit()

    async def get_next_pending_tool_step(self, hop_id: str, user_id: int) -> Optional[ToolStep]:
        """Get the next pending tool step for a hop"""
        tool_step_model = self.db.query(ToolStepModel).filter(
            and_(
                ToolStepModel.hop_id == hop_id,
                ToolStepModel.user_id == user_id,
                ToolStepModel.status == ToolExecutionStatus.PROPOSED
            )
        ).order_by(ToolStepModel.sequence_order).first()
        
        if not tool_step_model:
            return None
        
        return self._model_to_schema(tool_step_model)

    async def get_failed_tool_steps(self, hop_id: str, user_id: int) -> List[ToolStep]:
        """Get all failed tool steps for a hop"""
        tool_step_models = self.db.query(ToolStepModel).filter(
            and_(
                ToolStepModel.hop_id == hop_id,
                ToolStepModel.user_id == user_id,
                ToolStepModel.status == ToolExecutionStatus.FAILED
            )
        ).order_by(ToolStepModel.sequence_order).all()
        
        return [self._model_to_schema(tool_step_model) for tool_step_model in tool_step_models]

    async def reorder_tool_steps(
        self,
        hop_id: str,
        user_id: int,
        tool_step_id_order: List[str]
    ) -> List[ToolStep]:
        """Reorder tool steps by updating their sequence_order"""
        updated_tool_steps = []
        
        for i, tool_step_id in enumerate(tool_step_id_order):
            tool_step_model = self.db.query(ToolStepModel).filter(
                and_(
                    ToolStepModel.id == tool_step_id,
                    ToolStepModel.hop_id == hop_id,
                    ToolStepModel.user_id == user_id
                )
            ).first()
            
            if tool_step_model:
                tool_step_model.sequence_order = i + 1
                tool_step_model.updated_at = datetime.utcnow()
                updated_tool_steps.append(self._model_to_schema(tool_step_model))
        
        self.db.commit()
        
        return updated_tool_steps

 