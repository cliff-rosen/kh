from typing import Dict, Optional, Any, List, Union
from datetime import datetime
from sqlalchemy.orm import Session

from models import ToolStep as ToolStepModel, ToolExecutionStatus

from services.asset_service import AssetService
from services.tool_step_service import ToolStepService
from services.state_transition_service import StateTransitionService, TransactionType, TransactionResult

from schemas.workflow import ToolStep as ToolStepSchema
from schemas.asset import Asset
from schemas.tool_handler_schema import ToolHandlerInput, ToolHandlerResult, ToolParameterValue
from schemas.tool import ToolDefinition
from schemas.resource import ResourceConfig
from schemas.tool_execution import ToolExecutionResponse

from tools.tool_registry import get_tool_definition

"""
Tool Execution Service - Orchestrates tool step execution with proper service delegation.

Internal Call Tree (execute_tool_step is the root):

execute_tool_step(tool_step_id, user_id)
├── ToolStepService.get_tool_step(tool_step_id, user_id)
├── ToolStepService.update_tool_step_status(EXECUTING)
├── AssetService.get_hop_asset_context(hop_id, user_id)
│   ├── AssetMappingService.get_hop_assets(hop_id)
│   └── AssetService.get_assets_by_ids(asset_ids, user_id)
├── _execute_tool(step, asset_context, user_id)
│   ├── get_tool_definition(tool_id)
│   ├── _map_parameters(step, asset_context)
│   └── tool_def.execution_handler.handler(execution_input)
├── StateTransitionService.updateState(COMPLETE_TOOL_STEP, execution_result)
│   ├── Update ToolStep status to COMPLETED
│   ├── Process result mappings to create/update assets
│   ├── Check hop completion status
│   └── Check mission completion status
└── [Error handling: ToolStepService.update_tool_step_status(FAILED)]

Service Dependencies:
- ToolStepService: Tool step database operations
- AssetService: Asset retrieval and hop-asset context resolution
- StateTransitionService: ALL persistence and workflow state management
- Tool Registry: Tool definition lookup
- Tool Handlers: Actual tool execution
"""

# Type aliases for better readability
AssetContext = Dict[str, Asset]

class ToolExecutionService:
    def __init__(self, db: Session):
        self.db = db
        self.asset_service = AssetService(db)
        self.tool_step_service = ToolStepService(db)
        self.state_transition_service = StateTransitionService(db)

    async def execute_tool_step(
        self,
        tool_step_id: str,
        user_id: int
    ) -> Dict[str, Any]:  # Returns comprehensive result with metadata, not just the schema
        """
        Execute a tool step.
        
        1. Get tool step from database
        2. Resolve asset context from hop/mission scope  
        3. Execute the tool using existing tool_execution logic
        4. Delegate state management to StateTransitionService
        5. Return comprehensive results
        """
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"Starting tool step execution", extra={
            "tool_step_id": tool_step_id,
            "user_id": user_id
        })
        
        try:
            # 1. Get tool step from database
            tool_step_schema: ToolStepSchema = await self.tool_step_service.get_tool_step(tool_step_id, user_id)
            logger.info(f"Retrieved tool step", extra={
                "tool_step_id": tool_step_id,
                "tool_id": tool_step_schema.tool_id,
                "hop_id": tool_step_schema.hop_id,
                "parameter_mapping": tool_step_schema.parameter_mapping
            })
            
            # 2. Mark tool step as executing
            await self.tool_step_service.update_tool_step_status(
                tool_step_id, 
                user_id, 
                ToolExecutionStatus.EXECUTING
            )
            
            # 3. Resolve asset context from hop scope
            logger.info(f"Resolving asset context for hop {tool_step_schema.hop_id}")
            asset_context: AssetContext = self.asset_service.get_hop_asset_context(tool_step_schema.hop_id, user_id)
            logger.info(f"Asset context resolved", extra={
                "hop_id": tool_step_schema.hop_id,
                "asset_context_keys": list(asset_context.keys()),
                "asset_context": {k: {"id": v.id, "name": v.name} for k, v in asset_context.items()}
            })
            
            # 4. Execute the tool using internal methods
            logger.info(f"About to execute tool for step {tool_step_id}")
            tool_result: ToolExecutionResponse = await self._execute_tool(
                step=tool_step_schema,
                asset_context=asset_context,
                user_id=user_id
            )
            logger.info(f"Tool execution completed for step {tool_step_id} - success: {tool_result.success}, errors: {tool_result.errors}, outputs: {list(tool_result.outputs.keys()) if tool_result.outputs else []}, canonical_outputs: {list(tool_result.canonical_outputs.keys()) if tool_result.canonical_outputs else []}")
            
            # 5. Use StateTransitionService to handle all state updates
            logger.info(f"About to call StateTransitionService.updateState for COMPLETE_TOOL_STEP - tool_step_id: {tool_step_id}, user_id: {user_id}, execution_result_keys: {list(tool_result.model_dump().keys())}")
            
            try:
                transition_result: TransactionResult = await self.state_transition_service.updateState(
                    TransactionType.COMPLETE_TOOL_STEP,
                    {
                        'tool_step_id': tool_step_id,
                        'user_id': user_id,
                        'execution_result': tool_result.model_dump()  # Convert Pydantic to dict
                    }
                )
                logger.info(f"StateTransitionService.updateState completed - success: {transition_result.success}, message: {transition_result.message}, metadata: {transition_result.metadata}")
            except Exception as state_error:
                logger.error(f"StateTransitionService.updateState failed - tool_step_id: {tool_step_id}, error: {str(state_error)}, exception_type: {type(state_error).__name__}")
                raise state_error
            
            # 6. Return comprehensive result
            return {
                "success": transition_result.success,
                "tool_step_id": tool_step_id,
                "tool_result": tool_result,
                "state_transition": transition_result.to_dict(),
                "assets_created": transition_result.metadata.get('assets_created', []),
                "hop_completed": transition_result.metadata.get('hop_completed', False),
                "mission_completed": transition_result.metadata.get('mission_completed', False),
                "hop_id": tool_step_schema.hop_id
            }
            
        except Exception as e:
            logger.error(f"Tool step execution failed", extra={
                "tool_step_id": tool_step_id,
                "user_id": user_id,
                "error": str(e),
                "exception_type": type(e).__name__
            })
            
            # Mark tool step as failed using tool step service
            try:
                await self.tool_step_service.update_tool_step_status(
                    tool_step_id,
                    user_id,
                    ToolExecutionStatus.FAILED,
                    error_message=str(e)
                )
            except:
                pass  # Don't fail on cleanup failure
            
            raise Exception(f"Tool step execution failed: {str(e)}")

    async def _execute_tool(
        self,
        step: ToolStepSchema,
        asset_context: AssetContext,
        user_id: int
    ) -> ToolExecutionResponse:
        """
        Execute a tool step and return the results with proper canonical type handling.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"Starting tool execution", extra={
            "tool_step_id": step.id,
            "tool_id": step.tool_id,
            "asset_context_keys": list(asset_context.keys()),
            "parameter_mapping": step.parameter_mapping
        })

        # Get tool definition from registry
        tool_def: Optional[ToolDefinition] = get_tool_definition(step.tool_id)
        
        # Build tool inputs from parameter mappings
        params: Dict[str, ToolParameterValue] = self._map_parameters(step, asset_context)
        
        # Convert Resource objects to dictionaries
        resource_configs: Dict[str, ResourceConfig] = {}
        if step.resource_configs:
            resource_configs = {
                resource_id: resource.model_dump() if hasattr(resource, 'model_dump') else resource
                for resource_id, resource in step.resource_configs.items()
            }
        
        # Create execution input
        execution_input = ToolHandlerInput(
            params=params,
            resource_configs=resource_configs,
            step_id=step.id
        )
        
        try:
            # Execute the tool
            print(f"Executing tool {step.tool_id}")
            result = await tool_def.execution_handler(execution_input)
            
            print("Tool execution completed")
            
            return ToolExecutionResponse(
                success=True,
                errors=[],
                outputs=result.outputs,
                canonical_outputs=result.outputs,  # Assuming outputs are already canonical
                metadata=result.metadata or {}
            )
                
        except Exception as e:
            print(f"Error executing tool: {e}")
            raise Exception(f"Tool {step.tool_id} execution failed: {str(e)}")

    def _map_parameters(self, step: ToolStepSchema, asset_context: AssetContext) -> Dict[str, ToolParameterValue]:
        """Build tool inputs from parameter mappings."""
        import logging
        logger = logging.getLogger(__name__)
        
        params: Dict[str, ToolParameterValue] = {}
        
        if not step.parameter_mapping:
            return params
            
        for param_name, mapping in step.parameter_mapping.items():
            if mapping.type == "literal":
                # Create ToolParameterValue with literal value
                params[param_name] = ToolParameterValue(
                    value=mapping.value,
                    parameter_name=param_name,
                    parameter_type="literal"
                )
            elif mapping.type == "asset_field":
                asset_id = mapping.state_asset_id
                
                # Get asset from context (always returns Asset object)
                asset: Optional[Asset] = asset_context.get(asset_id)
                if not asset:
                    raise Exception(f"Asset {asset_id} not found in asset context")
                
                # Extract value from asset - use value_representation for tool execution
                value = asset.value_representation
                
                # Create ToolParameterValue with asset value
                params[param_name] = ToolParameterValue(
                    value=value,
                    parameter_name=param_name,
                    parameter_type="asset"
                )
        
        return params



 