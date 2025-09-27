from typing import Dict, Any, List, Optional, Union, get_args
from datetime import datetime
from pydantic import BaseModel, Field, validator
import uuid

from schemas.asset import Asset, AssetStatus, AssetRole, AssetScopeType
from schemas.workflow import ToolStep, Hop, HopStatus, ToolExecutionStatus, Mission, MissionStatus, AssetFieldMapping, LiteralMapping, DiscardMapping, ParameterMappingValue, ResultMappingValue
from schemas.base import SchemaType, ValueType, PrimitiveType, ComplexType, CanonicalType
from utils.string_utils import canonical_key

def get_all_value_types() -> List[str]:
    """Get all valid ValueType strings"""
    primitive_types = get_args(PrimitiveType)
    complex_types = get_args(ComplexType)
    canonical_types = get_args(CanonicalType)
    return list(primitive_types) + list(complex_types) + list(canonical_types)

class AssetLite(BaseModel):
    """Simplified asset definition for mission proposals"""
    name: str = Field(description="Name of the asset")
    description: str = Field(description="User-friendly description of what this asset contains - should be clear and understandable for non-technical users")
    agent_specification: str = Field(description="Detailed technical specification for agents including data structure, format requirements, validation criteria, tool integration details, and schema definitions")
    type: ValueType = Field(description="Type of asset. Must be one of: 'string', 'number', 'boolean', 'primitive', 'object', 'file', 'database_entity', 'markdown', 'config', 'email', 'webpage', 'search_result', 'pubmed_article', 'newsletter', 'daily_newsletter_recap'")
    subtype: Optional[str] = Field(default=None, description="Specific format or schema (e.g., 'csv', 'json', 'email', 'oauth_token')")
    is_array: bool = Field(default=False, description="Whether this asset contains multiple items (arrays, lists)")
    role: Optional[str] = Field(default=None, description="Role of asset in workflow: 'input' for user-provided data/credentials, 'output' for final results, 'intermediate' for data retrieved from external systems")
    example_value: Optional[Any] = Field(default=None, description="Example of what the asset value might look like")
    external_system_for: Optional[str] = Field(default=None, description="If this is a config asset for external system credentials, specify which system (e.g., 'gmail', 'pubmed')")

    @validator('type')
    def validate_type(cls, v):
        """Ensure type is a valid ValueType"""
        valid_types = get_all_value_types()
        if v not in valid_types:
            raise ValueError(f"Invalid type '{v}'. Must be one of: {', '.join(valid_types)}")
        return v

    @validator('role')
    def validate_role(cls, v):
        """Ensure role is valid if provided"""
        if v is not None and v not in ['input', 'output', 'intermediate']:
            raise ValueError(f"Invalid role '{v}'. Must be one of: 'input', 'output', 'intermediate'")
        return v

class MissionLite(BaseModel):
    """Simplified mission definition for proposals"""
    name: str = Field(description="Name of the mission (2-8 words)")
    description: str = Field(description="One sentence describing what the mission accomplishes")
    goal: str = Field(description="The main goal of the mission")
    success_criteria: List[str] = Field(description="2-3 specific, measurable outcomes that define completion")
    inputs: List[AssetLite] = Field(description="Input assets required for the mission (user data + external system credentials)")
    outputs: List[AssetLite] = Field(description="Output assets produced by the mission")
    scope: str = Field(description="What is explicitly included/excluded in the mission")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata for the mission")

class ToolStepLite(BaseModel):
    """Simplified tool step definition"""
    id: str = Field(description="Unique identifier for the tool step")
    tool_id: str = Field(description="ID of the tool to use")
    description: str = Field(description="Description of what this step accomplishes")
    resource_configs: Dict[str, Any] = Field(default_factory=dict, description="Configuration for external resources needed by the tool")
    parameter_mapping: Dict[str, ParameterMappingValue] = Field(default_factory=dict, description="Mapping of tool parameters to values or asset fields")
    result_mapping: Dict[str, ResultMappingValue] = Field(default_factory=dict, description="Mapping of tool results to asset fields")

class NewAssetOutput(BaseModel):
    """Specification for creating a new output asset in a hop"""
    asset: AssetLite = Field(description="Complete definition of the new asset to create")

class ExistingAssetOutput(BaseModel):
    """Specification for using an existing mission asset as output"""
    mission_asset_id: str = Field(description="ID of the existing mission asset to use as output")

# Union type for hop output specification
OutputAssetSpec = Union[NewAssetOutput, ExistingAssetOutput]

class HopLite(BaseModel):
    """Simplified hop definition focusing on inputs and outputs"""
    name: str = Field(description="Name of the hop (2-8 words)")
    description: str = Field(description="One sentence describing what the hop accomplishes")
    inputs: List[str] = Field(description="List of asset IDs from mission state to use as inputs for this hop")
    output: OutputAssetSpec = Field(description="Output asset specification for this hop - either a new asset definition or reference to existing mission asset")
    is_final: bool = Field(default=False, description="Whether this is the final hop in the mission")
    rationale: str = Field(description="Explanation of why this hop is needed and how it contributes to the mission")
    alternative_approaches: List[str] = Field(
        default_factory=list, 
        description="Alternative approaches that were considered but not chosen"
    )

    @validator('output')
    def validate_output_spec(cls, v):
        """Validate that output specification is complete"""
        if isinstance(v, ExistingAssetOutput) and not v.mission_asset_id:
            raise ValueError("mission_asset_id is required when using an existing mission asset")
        return v

# Mapping functions to convert between Lite and full models

def create_asset_from_lite(asset_lite: AssetLite) -> Asset:
    """Convert an AssetLite object to a full Asset object with unified schema"""
    current_time = datetime.utcnow()
    
    # Create metadata for the asset
    custom_metadata = {}
    if asset_lite.external_system_for:
        custom_metadata['external_system_for'] = asset_lite.external_system_for
    if asset_lite.agent_specification:
        custom_metadata['agent_specification'] = asset_lite.agent_specification
    if asset_lite.example_value is not None:
        custom_metadata['example_value'] = asset_lite.example_value
    if asset_lite.is_array:
        custom_metadata['is_array'] = asset_lite.is_array

    asset_metadata = {
        "created_at": current_time.isoformat(),
        "updated_at": current_time.isoformat(),
        "creator": "mission_specialist",
        "custom_metadata": custom_metadata,
    }
    
    # Determine initial status based on type and subtype
    # Assets created from lite models start as PROPOSED (frontend only)
    initial_status = AssetStatus.PROPOSED
    if asset_lite.role == 'input':
        # Config values and system credentials are ready by default
        if (asset_lite.type in ['config', 'object'] or 
            asset_lite.subtype in ['oauth_token', 'email'] or
            asset_lite.external_system_for is not None):
            initial_status = AssetStatus.READY
    
    # Convert role string to AssetRole enum
    if asset_lite.role == 'input':
        role = AssetRole.INPUT
    elif asset_lite.role == 'output':
        role = AssetRole.OUTPUT
    else:
        role = AssetRole.INTERMEDIATE
    
    # Create value representation from description and example value
    value_representation = asset_lite.description
    if asset_lite.example_value is not None:
        value_representation += f" (Example: {asset_lite.example_value})"
    
    # Create schema definition from AssetLite type information
    from schemas.base import SchemaType
    schema_definition = SchemaType(
        type=asset_lite.type,
        description=asset_lite.agent_specification,
        is_array=asset_lite.is_array
    )
    
    # Create the full Asset object with correct field mapping
    return Asset(
        id=str(uuid.uuid4()),
        name=asset_lite.name,
        description=asset_lite.description,
        schema_definition=schema_definition,
        subtype=asset_lite.subtype,
        scope_type="mission",  # Assets from lite models are mission-scoped
        scope_id="system",  # Default scope_id for mission assets
        status=initial_status,
        role=role,
        value_representation=value_representation,
        asset_metadata=asset_metadata,
        created_at=current_time,
        updated_at=current_time,
    )

def create_mission_from_lite(mission_lite: MissionLite) -> Mission:
    """Convert a MissionLite object to a full Mission object"""
    current_time = datetime.utcnow()
    
    # Convert input and output assets
    inputs = [create_asset_from_lite(asset) for asset in mission_lite.inputs]
    outputs = [create_asset_from_lite(asset) for asset in mission_lite.outputs]
    
    # Create the full Mission object
    mission = Mission(
        id=str(uuid.uuid4()),
        name=mission_lite.name,
        description=mission_lite.description,
        goal=mission_lite.goal,
        success_criteria=mission_lite.success_criteria,
        status=MissionStatus.AWAITING_APPROVAL,
        current_hop_id=None,
        current_hop=None,
        hops=[],
        mission_metadata=mission_lite.metadata,
        created_at=current_time,
        updated_at=current_time,
    )
    
    # Initialize mission_asset_map with input and output assets
    for asset in inputs + outputs:
        mission.mission_asset_map[asset.id] = asset.role
    
    return mission

def create_tool_step_from_lite(step_lite: ToolStepLite) -> ToolStep:
    """Convert a ToolStepLite object to a full ToolStep object"""
    from schemas.resource import get_resource
    
    current_time = datetime.utcnow()
    
    # Convert resource configs from Dict[str, Any] to Dict[str, Resource]
    resource_configs = {}
    for resource_key, config in step_lite.resource_configs.items():
        if isinstance(config, dict):
            # This is a configuration dict, we need to get the Resource definition
            # The resource_key is the key in the mapping, config should contain the resource ID
            resource_id = config.get('resource_id', resource_key)
            resource_def = get_resource(resource_id)
            if resource_def:
                resource_configs[resource_key] = resource_def
            else:
                # If we can't find the resource definition, skip it
                # This prevents the validation error but logs the issue
                print(f"Warning: Resource '{resource_id}' not found in registry for tool step '{step_lite.id}'")
        elif isinstance(config, str):
            # This is a string reference to a resource ID
            # Handle common mappings where the AI might use different names
            resource_id_mapping = {
                'gmail_login_credentials': 'gmail',
                'gmail_credentials': 'gmail',
                'gmail_oauth': 'gmail',
                'pubmed_credentials': 'pubmed',
                'web_search_credentials': 'web_search',
                'dropbox_credentials': 'dropbox'
            }
            
            actual_resource_id = resource_id_mapping.get(config, config)
            resource_def = get_resource(actual_resource_id)
            if resource_def:
                resource_configs[resource_key] = resource_def
            else:
                # If we can't find the resource definition, skip it
                # This prevents the validation error but logs the issue
                print(f"Warning: Resource '{config}' (mapped to '{actual_resource_id}') not found in registry for tool step '{step_lite.id}'")
        else:
            # Assume it's already a Resource object (shouldn't happen but be safe)
            resource_configs[resource_key] = config
    
    return ToolStep(
        id=step_lite.id,
        tool_id=step_lite.tool_id,
        sequence_order=0,  # Default sequence order, will be set properly when added to hop
        name=step_lite.description,  # Use description as name
        description=step_lite.description,
        resource_configs=resource_configs,
        parameter_mapping=step_lite.parameter_mapping,
        result_mapping=step_lite.result_mapping,
        status=ToolExecutionStatus.PROPOSED,
        created_at=current_time,
        updated_at=current_time
    )

def create_hop_from_lite(hop_lite: HopLite, mission_state: Dict[str, Asset] = None) -> Hop:
    """Convert a HopLite object to a full Hop object"""
    current_time = datetime.utcnow()
    
    # Create input mapping from asset IDs
    input_mapping = {}
    if mission_state:
        # We have access to mission state, so we can create proper canonical key mapping
        for asset_id in hop_lite.inputs:
            if asset_id in mission_state:
                asset = mission_state[asset_id]
                input_mapping[canonical_key(asset.name)] = asset_id
            else:
                # Fallback: use asset_id as both key and value
                input_mapping[asset_id] = asset_id
    else:
        # No mission state available, use asset_id as both key and value
        # The actual canonical key mapping will be done when the hop is implemented
        for asset_id in hop_lite.inputs:
            input_mapping[asset_id] = asset_id
    
    # Handle output asset specification based on type
    if isinstance(hop_lite.output, NewAssetOutput):
        # Create new output asset from lite version
        output_asset = create_asset_from_lite(hop_lite.output.asset)
        output_asset_id = output_asset.id
        output_asset_name = hop_lite.output.asset.name
    elif isinstance(hop_lite.output, ExistingAssetOutput):
        # Use existing mission asset
        output_asset_id = hop_lite.output.mission_asset_id
        # We need to get the asset name from the mission state, but we don't have access to it here
        # For now, we'll use the ID as the key and let the caller handle the name resolution
        output_asset_name = hop_lite.output.mission_asset_id
    else:
        raise ValueError(f"Invalid output specification type: {type(hop_lite.output)}")
    
    # Create output mapping
    output_mapping = {
        canonical_key(output_asset_name): output_asset_id
    }
    
    # Create the full Hop object
    return Hop(
        id=str(uuid.uuid4()),
        sequence_order=0,  # Default sequence order, will be set properly when added to mission
        name=hop_lite.name,
        description=hop_lite.description,
        goal=None,  # Will be set later
        success_criteria=[],  # Will be set later  
        rationale=hop_lite.rationale,
        status=HopStatus.HOP_PLAN_PROPOSED,
        is_final=hop_lite.is_final,
        is_resolved=False,
        error_message=None,
        hop_metadata={},
        tool_steps=[],  # Tool steps will be added by the implementer
        created_at=current_time,
        updated_at=current_time
    ) 