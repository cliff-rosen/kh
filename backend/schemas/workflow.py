"""
Workflow Schema Definitions

This module contains all Pydantic models and related utilities for defining
and managing workflows, including Missions, Hops, and ToolSteps.
"""

from __future__ import annotations
from pydantic import BaseModel, Field, validator
from typing import Dict, Any, Optional, List, Union, Literal, TYPE_CHECKING, TypedDict
from datetime import datetime
from enum import Enum

from .asset import Asset, AssetRole, AssetMapSummary
from .resource import Resource

if TYPE_CHECKING:
    from tools.tool_execution import execute_tool_step, ToolExecutionError
    from .chat import AssetReference


class ToolExecutionStatus(str, Enum):
    """Status of tool step execution"""
    PROPOSED = "proposed"
    READY_TO_CONFIGURE = "ready_to_configure"
    READY_TO_EXECUTE = "ready_to_execute"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class MissionStatus(str, Enum):
    """Status of a mission"""
    AWAITING_APPROVAL = "awaiting_approval"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class HopStatus(str, Enum):
    """Status of a hop"""
    HOP_PLAN_STARTED = "hop_plan_started"
    HOP_PLAN_PROPOSED = "hop_plan_proposed"
    HOP_PLAN_READY = "hop_plan_ready"
    HOP_IMPL_STARTED = "hop_impl_started"
    HOP_IMPL_PROPOSED = "hop_impl_proposed"
    HOP_IMPL_READY = "hop_impl_ready"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Sanitized Types for Chat Contexts
class SanitizedAsset(TypedDict):
    """Sanitized asset structure for chat contexts"""
    id: str
    name: str
    description: str
    type: str
    subtype: str
    status: str
    role: str
    scope_type: str
    token_count: int


class SanitizedHop(TypedDict):
    """Sanitized hop structure for chat contexts"""
    id: str
    name: str
    description: str
    status: str
    sequence_order: int


class SanitizedMission(TypedDict):
    """Sanitized mission structure for chat contexts"""
    id: str
    name: str
    description: str
    goal: str
    success_criteria: List[str]
    status: str
    current_hop_id: Optional[str]
    current_hop: Optional[SanitizedHop]
    hops: List[SanitizedHop]
    mission_asset_map: Dict[str, str]  # asset_id -> role mapping
    mission_metadata: Dict[str, Any]
    created_at: str
    updated_at: str


class ChatContextPayloadBase(TypedDict):
    """Core guaranteed fields in chat context payload"""
    mission: Optional[SanitizedMission]
    asset_summaries: Dict[str, 'AssetReference']


class ChatContextPayload(ChatContextPayloadBase, total=False):
    """
    Chat context payload structure returned by prepare_chat_context.
    
    Core fields (mission, asset_summaries) are guaranteed to be present.
    Additional fields may be included from the original chat request payload.
    """
    # Additional arbitrary fields from additional_payload are allowed
    # but not defined here since they're dynamic


class Hop(BaseModel):
    """
    Represents one step in a mission, containing a sequence of tool steps
    to be executed.
    """
    # Core fields
    id: str
    sequence_order: int
    name: str
    description: Optional[str] = None
    goal: Optional[str] = None
    success_criteria: List[str] = Field(default_factory=list)
    rationale: Optional[str] = None
    status: HopStatus = Field(default=HopStatus.HOP_PLAN_PROPOSED)
    
    # Hop state
    is_final: bool = Field(default=False)
    is_resolved: bool = Field(default=False)
    error_message: Optional[str] = None
    hop_metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships (populated by services) - Parent manages child context
    tool_steps: List['ToolStep'] = Field(default_factory=list)
    
    # Asset collections removed - use hop_asset_map instead
    
    # Asset mapping (populated by services)
    hop_asset_map: Dict[str, AssetRole] = Field(default_factory=dict)  # asset_id -> role mapping
    
    # Full asset objects for frontend compatibility (populated by services)
    assets: List['Asset'] = Field(default_factory=list)  # Full Asset objects for UI
    
    
    @property
    def asset_summary(self) -> AssetMapSummary:
        """Get summary of hop assets by role"""
        return AssetMapSummary.from_asset_map(self.hop_asset_map)
    
    def get_hop_input_ids(self) -> List[str]:
        """Get all input asset IDs from hop_asset_map"""
        return [aid for aid, role in self.hop_asset_map.items() if role == AssetRole.INPUT]
    
    def get_hop_output_ids(self) -> List[str]:
        """Get all output asset IDs from hop_asset_map"""
        return [aid for aid, role in self.hop_asset_map.items() if role == AssetRole.OUTPUT]
    
    def get_hop_intermediate_ids(self) -> List[str]:
        """Get all intermediate asset IDs from hop_asset_map"""
        return [aid for aid, role in self.hop_asset_map.items() if role == AssetRole.INTERMEDIATE]


class Mission(BaseModel):
    """
    Represents the overall goal or workflow, composed of a series of hops.
    """
    # Core fields
    id: str
    name: str
    description: Optional[str] = None
    goal: Optional[str] = None
    success_criteria: List[str] = Field(default_factory=list)
    status: MissionStatus = Field(default=MissionStatus.AWAITING_APPROVAL)
    
    # Current hop tracking
    current_hop_id: Optional[str] = None
    
    # Metadata
    mission_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships (populated by services) - Parent manages child context
    current_hop: Optional['Hop'] = None
    hops: List['Hop'] = Field(default_factory=list)  # hop_history
    
    # Asset mapping (populated by services)
    mission_asset_map: Dict[str, AssetRole] = Field(default_factory=dict)  # asset_id -> role mapping
    
    # Full asset objects for frontend compatibility (populated by services)
    assets: List['Asset'] = Field(default_factory=list)  # Full Asset objects for UI
    
    @property
    def asset_summary(self) -> AssetMapSummary:
        """Get summary of mission assets by role"""
        return AssetMapSummary.from_asset_map(self.mission_asset_map)

    @validator('created_at', 'updated_at', pre=True)
    def handle_empty_datetime(cls, v):
        """Handle empty datetime strings from LLM responses"""
        if v == "" or v is None:
            return datetime.utcnow()
        return v
    
    def get_input_ids(self) -> List[str]:
        """Get all input asset IDs from mission_asset_map"""
        return [aid for aid, role in self.mission_asset_map.items() if role == AssetRole.INPUT]
    
    def get_output_ids(self) -> List[str]:
        """Get all output asset IDs from mission_asset_map"""
        return [aid for aid, role in self.mission_asset_map.items() if role == AssetRole.OUTPUT]
    
    def get_intermediate_ids(self) -> List[str]:
        """Get all intermediate asset IDs from mission_asset_map"""
        return [aid for aid, role in self.mission_asset_map.items() if role == AssetRole.INTERMEDIATE]
    
    def get_inputs(self) -> List['Asset']:
        """Get all input Asset objects from assets list"""
        return [asset for asset in self.assets if asset.role == AssetRole.INPUT]
    
    def get_outputs(self) -> List['Asset']:
        """Get all output Asset objects from assets list"""
        return [asset for asset in self.assets if asset.role == AssetRole.OUTPUT]
    
    def get_intermediates(self) -> List['Asset']:
        """Get all intermediate Asset objects from assets list"""
        return [asset for asset in self.assets if asset.role == AssetRole.INTERMEDIATE]


class AssetFieldMapping(BaseModel):
    """Maps a tool parameter to a specific asset by ID."""
    type: Literal["asset_field"] = "asset_field"
    state_asset_id: str


class LiteralMapping(BaseModel):
    """Provides a literal value directly to a tool parameter."""
    type: Literal["literal"] = "literal"
    value: Any


class DiscardMapping(BaseModel):
    """Indicates that a tool output should be discarded."""
    type: Literal["discard"] = "discard"


ParameterMappingValue = Union[AssetFieldMapping, LiteralMapping]
ResultMappingValue = Union[AssetFieldMapping, DiscardMapping]


class ToolStep(BaseModel):
    """
    Represents an atomic unit of work: a single tool execution within a hop.
    """
    # Core fields
    id: str
    tool_id: str
    sequence_order: int
    name: str
    description: Optional[str] = None
    status: ToolExecutionStatus = Field(default=ToolExecutionStatus.PROPOSED)
    
    # Context
    hop_id: str
    
    # Tool configuration
    parameter_mapping: Dict[str, ParameterMappingValue] = Field(default_factory=dict)
    result_mapping: Dict[str, ResultMappingValue] = Field(default_factory=dict)
    resource_configs: Dict[str, Resource] = Field(default_factory=dict)
    
    # Execution data
    validation_errors: List[str] = Field(default_factory=list)
    execution_result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    @validator('created_at', 'updated_at', pre=True)
    def handle_empty_datetime(cls, v):
        """Handle empty datetime strings from LLM responses"""
        if v == "" or v is None:
            return datetime.utcnow()
        return v

    async def execute(self, hop_assets: Dict[str, Asset], user_id: Optional[int] = None, db: Optional[Any] = None) -> Dict[str, Any]:
        """
        Execute this tool step and return the results.
        
        Args:
            hop_assets: Current assets of the hop as a dictionary
            user_id: User ID for asset persistence (optional)
            db: Database session for asset persistence (optional)
            
        Returns:
            Dict containing the execution results
            
        Raises:
            ToolExecutionError: If tool execution fails
        """
        # Import here to avoid circular imports
        from tools.tool_execution import execute_tool_step, ToolExecutionError
        
        try:
            self.status = ToolExecutionStatus.EXECUTING
            result = await execute_tool_step(self, hop_assets, user_id=user_id, db=db)
            self.status = ToolExecutionStatus.COMPLETED
            return result
        except Exception as e:
            self.status = ToolExecutionStatus.FAILED
            self.error_message = str(e)
            raise ToolExecutionError(str(e), self.tool_id)


def validate_tool_chain(steps: List[ToolStep], hop_assets: Dict[str, Asset]) -> List[str]:
    """Validate the tool chain returned by the Hop-Implementer.

    Ensures that every tool step references existing assets (or creates them first)
    and that schemas are compatible according to each tool's own validation logic.
    Also validates that the steps form a proper chain where all inputs are satisfied.
    Returns a flat list of validation-error strings (empty list means no errors).
    """
    from tools.tool_registry import TOOL_REGISTRY
    
    errors: List[str] = []
    
    # Track which assets are available at each step based on their roles
    # Start with only INPUT assets - outputs and intermediates are not available until produced!
    available_assets = set()
    input_assets = set()
    output_assets = set()
    intermediate_assets = set()
    
    # Categorize assets by role
    for asset_name, asset in hop_assets.items():
        if asset.role == 'input':
            available_assets.add(asset_name)  # Input assets are immediately available
            input_assets.add(asset_name)
        elif asset.role == 'output':
            output_assets.add(asset_name)  # Output assets only available after production
        elif asset.role == 'intermediate':
            intermediate_assets.add(asset_name)  # Intermediate assets only available after creation
        else:
            # Handle assets without explicit roles - treat as intermediate for safety
            intermediate_assets.add(asset_name)
    
    for step_index, step in enumerate(steps):
        tool_def = TOOL_REGISTRY.get(step.tool_id)
        if not tool_def:
            errors.append(f"Tool definition not found for tool_id '{step.tool_id}'")
            continue

        # Track assets that will be created by this step
        step_outputs = set()

        # Validate parameter mapping
        for param_name, mapping in step.parameter_mapping.items():
            # get the tool parameter for the current parameter mapping
            tool_param = next((p for p in tool_def.parameters if p.name == param_name), None)
            if not tool_param:
                errors.append(
                    f"Step '{step.id}': Parameter '{param_name}' not found in tool '{tool_def.id}' definition. "
                    f"Available parameters: {', '.join(p.name for p in tool_def.parameters)}"
                )
                continue
                
            # if the tool parameter is an asset field, we need to check if the asset is available
            if isinstance(mapping, dict) and mapping.get('type') == 'asset_field':
                state_asset_id = mapping.get('state_asset_id')
                if not state_asset_id:
                    errors.append(f"Step '{step.id}': Missing state_asset_id in parameter mapping for '{param_name}'")
                    continue
                    
                # Check if asset is available (either in initial state or created by previous steps)
                if state_asset_id not in available_assets:
                    errors.append(
                        f"Step '{step.id}' (step {step_index + 1}): Asset '{state_asset_id}' for parameter '{param_name}' is not available. "
                        f"Available assets at this step: {', '.join(sorted(available_assets))}"
                    )
                    continue

                # Check if asset exists in hop assets (for schema validation)
                if state_asset_id not in hop_assets:
                    errors.append(
                        f"Step '{step.id}': Asset '{state_asset_id}' for parameter '{param_name}' not found in hop assets. "
                        f"Available assets: {', '.join(hop_assets.keys())}"
                    )
                    continue
                
                # TODO: Add schema compatibility check here
                # For now, we just check for existence

        # Validate result mapping and track outputs
        for result_name, mapping in step.result_mapping.items():
            # get the tool output for the current result mapping
            tool_output = next((o for o in tool_def.outputs if o.name == result_name), None)
            if not tool_output:
                errors.append(
                    f"Step '{step.id}': Result '{result_name}' not found in tool '{tool_def.id}' definition. "
                    f"Available outputs: {', '.join(o.name for o in tool_def.outputs)}"
                )
                continue
                
            # if the tool output is an asset field, track it as available for subsequent steps
            if isinstance(mapping, dict) and mapping.get('type') == 'asset_field':
                state_asset_id = mapping.get('state_asset_id')
                if not state_asset_id:
                    errors.append(f"Step '{step.id}': Missing state_asset_id in result mapping for '{result_name}'")
                    continue
                    
                # Add to outputs that will be created by this step
                step_outputs.add(state_asset_id)
                
                # Check if asset exists in hop assets (should exist or be created)
                if state_asset_id not in hop_assets:
                    errors.append(
                        f"Step '{step.id}': Asset '{state_asset_id}' for result '{result_name}' not found in hop assets. "
                        f"Available assets: {', '.join(hop_assets.keys())}"
                    )
                    continue

                # TODO: Add schema compatibility check here
                # For now, we just check for existence
        
        # Add this step's outputs to available assets for subsequent steps
        available_assets.update(step_outputs)

    return errors 