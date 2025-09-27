
## Asset Scoping and Roles - Complete Understanding

### Mission-Scoped Assets (live in mission scope forever)

- **Mission Inputs/Outputs**: Defined at mission creation, permanent mission deliverables
- **Mission Intermediates**: Created by hops as working artifacts, but not mission deliverables

### Hop-Scoped Assets (temporary, only during hop execution)

- **Hop Intermediates**: Temporary working assets created during tool step execution
- These are the "scratch pad" assets that tools use for intermediate calculations
- They don't get promoted to mission scope - they're just execution artifacts

### The Flow:

1. **During 2.2 PROPOSE_HOP_PLAN**:
   - **Input assets**: Reference existing mission assets → `hop_asset_map` as INPUT
   - **New assets**: Create at mission scope as INTERMEDIATE → `mission_asset_map` as INTERMEDIATE, `hop_asset_map` as OUTPUT
   - **Existing assets**: Reference existing mission assets → `hop_asset_map` as OUTPUT

2. **During tool execution**:
   - Tools may create hop-scoped intermediate assets for working data
   - These assets exist only for the duration of the hop execution
   - They are NOT promoted to mission scope when the hop completes

3. **Key Distinction**:
   - **Mission-scoped intermediates**: Created by hops but persist at mission level (deliverables)
   - **Hop-scoped intermediates**: Created by tool steps but discarded after hop completion (scratch work)

## State Transition Implementation Details

### **1.1 PROPOSE_MISSION**

#### Input Data Structure
```python
class MissionLite(BaseModel):
    """Simplified mission structure for creation and LLM processing"""
    name: str                                                    # Mission display name
    description: Optional[str] = None                            # Mission overview
    goal: Optional[str] = None                                   # Primary objective
    success_criteria: List[str] = Field(default_factory=list)   # Success conditions
    mission_metadata: Dict[str, Any] = Field(default_factory=dict)  # Additional metadata
    assets: List[AssetLite] = Field(default_factory=list)       # Asset specifications to be created

class AssetLite(BaseModel):
    """Simplified asset structure for creation and LLM processing"""
    name: str                                                    # Asset display name
    description: Optional[str] = None                            # Asset description
    schema_definition: Dict[str, Any]                           # Schema type definition
    role: AssetRole                                             # INPUT, OUTPUT, or INTERMEDIATE
    subtype: Optional[str] = None                               # Asset subtype (optional)
    content: Optional[Any] = None                               # Initial content if any
    asset_metadata: Dict[str, Any] = Field(default_factory=dict)  # Additional metadata
```

#### Semantics
This transition creates a new mission proposal from an agent's mission planning analysis. The agent provides a complete mission specification including all required deliverable assets. The mission is created in `AWAITING_APPROVAL` status and automatically linked to the user's active session. All assets are created at mission scope with the specified roles.

#### Entity Updates

**Mission Creation:**
```python
mission = Mission(
    id=uuid4(),
    name=mission_lite.name,
    description=mission_lite.description,
    goal=mission_lite.goal,
    success_criteria=mission_lite.success_criteria,
    status=MissionStatus.AWAITING_APPROVAL,
    mission_metadata=mission_lite.mission_metadata,
    created_at=datetime.utcnow(),
    updated_at=datetime.utcnow()
)
```

**UserSession Updates:**
```python
# Link mission to user's active session
user_session.mission_id = mission.id
user_session.updated_at = datetime.utcnow()
```

#### Asset Management
```python
# Process each asset in mission_lite.assets
for asset_data in mission_lite.assets:
    # 1. Create Asset entity
    created_asset_id = asset_service.create_asset(
        user_id=user_id,
        name=asset_data.name,
        schema_definition=asset_data.schema_definition,
        subtype=asset_data.subtype,
        description=asset_data.description,
        content=asset_data.content,                    # Usually None for proposed assets
        scope_type=AssetScopeType.MISSION,            # Mission-scoped
        scope_id=mission_id,
        role=asset_data.role,                         # INPUT, OUTPUT, or INTERMEDIATE
        asset_metadata=asset_data.asset_metadata
    )
    
    # 2. Create MissionAsset mapping
    asset_mapping_service.add_mission_asset(
        mission_id=mission_id,
        asset_id=created_asset_id,
        role=asset_data.role
    )
```

#### Validation Rules
- User must have an active session
- Mission name must be unique for the user
- All assets must have valid schema definitions
- Asset roles must be valid (INPUT, OUTPUT only - no INTERMEDIATE)
- Mission must have at least one OUTPUT asset
- Mission inputs are optional
- Mission is created in AWAITING_APPROVAL status

#### Business Rules
- Mission automatically linked to user's active session
- All assets created at mission scope (persistent)
- Assets start in PROPOSED status
- No hop is created during mission proposal
- Mission requires user approval before work can begin

### **1.2 ACCEPT_MISSION**

#### Input Data Structure
```python
mission_id: str  # UUID of the mission to accept
```

#### Semantics
This transition accepts a mission proposal that is currently in `AWAITING_APPROVAL` status. The user has reviewed the mission plan and its deliverable assets and approves proceeding with the mission. The mission status changes to `IN_PROGRESS` making it ready for hop planning and execution.

#### Entity Updates

**Mission Status Update:**
```python
mission.status = MissionStatus.IN_PROGRESS
mission.updated_at = datetime.utcnow()
```

**Asset Status Updates:**
```python
# All mission assets transition from PROPOSED to PENDING
for asset_id in mission.mission_asset_map.keys():
    asset = asset_service.get_asset_by_id(asset_id, user_id)
    if asset.status == AssetStatus.PROPOSED:
        asset_service.update_asset_status(
            asset_id=asset_id,
            user_id=user_id,
            status=AssetStatus.PENDING
        )
```

#### Validation Rules
- Mission must exist and belong to the user
- Mission must be in `AWAITING_APPROVAL` status
- User must have permission to accept the mission
- Mission must be linked to user's active session

#### Business Rules
- Mission becomes active and ready for hop planning
- All mission assets become pending (ready for work)
- Mission approval is irreversible
- No hop is created during mission acceptance
- User can now request hop planning via chat

### **2.1 START_HOP_PLAN**

#### Input Data Structure
```python
mission_id: str  # UUID of the mission to start hop planning for
```

#### Semantics
This transition initiates hop planning for a mission that is currently in `IN_PROGRESS` status. The user requests hop planning via chat, and the system creates a new hop entity in `HOP_PLAN_STARTED` status. The mission's `current_hop_id` is updated to link the active hop, and the agent begins hop design planning.

#### Entity Updates

**New Hop Creation:**
```python
hop = Hop(
    id=uuid4(),
    sequence_order=len(mission.hops) + 1,  # Next in sequence
    name=f"Hop {len(mission.hops) + 1}",   # Default name
    status=HopStatus.HOP_PLAN_STARTED,
    mission_id=mission_id,
    is_final=False,                        # TBD during planning
    created_at=datetime.utcnow(),
    updated_at=datetime.utcnow()
)
```

**Mission Update:**
```python
mission.current_hop_id = hop.id
mission.updated_at = datetime.utcnow()
```

#### Validation Rules
- Mission must exist and belong to the user
- Mission must be in `IN_PROGRESS` status
- Mission must not have an active hop (current_hop_id must be null)
- User must have permission to modify the mission

#### Business Rules
- Hop is created in planning state
- Mission links to the new active hop
- Agent begins hop design analysis
- Only one hop can be in planning state at a time per mission
- Hop planning is user-initiated via chat interaction

### **2.2 PROPOSE_HOP_PLAN**

#### Input Data Structure
```python
class HopLite(BaseModel):
    """Simplified hop structure for hop planning operations"""
    name: str
    description: Optional[str] = None
    goal: Optional[str] = None
    rationale: Optional[str] = None
    success_criteria: List[str] = Field(default_factory=list)
    is_final: bool = False
    inputs: List[str]  # List of mission asset IDs to use as inputs
    output: OutputAssetSpec  # Either new asset specification or existing asset reference
    hop_metadata: Dict[str, Any] = Field(default_factory=dict)
```

#### Semantics
This transition completes hop planning for a hop that is currently in `HOP_PLAN_STARTED` status. The agent provides a complete hop design including input/output asset specifications and execution details. New mission-scoped intermediate assets are created for hop deliverables, and asset mappings are established for both inputs and outputs.

#### Entity Updates
```python
# Hop Status Update + Plan Details
hop.status = HopStatus.HOP_PLAN_PROPOSED
hop.name = hop_lite.name
hop.description = hop_lite.description
hop.goal = hop_lite.goal
hop.rationale = hop_lite.rationale
hop.success_criteria = hop_lite.success_criteria
hop.is_final = hop_lite.is_final
hop.hop_metadata = hop_lite.hop_metadata

# Intended asset tracking for hop proposal
hop.intended_input_asset_ids = hop_lite.inputs
if isinstance(hop_lite.output, NewAssetOutput):
    hop.intended_output_asset_ids = []
    hop.intended_output_asset_specs = [hop_lite.output]
elif isinstance(hop_lite.output, ExistingAssetOutput):
    hop.intended_output_asset_ids = [hop_lite.output.mission_asset_id]
    hop.intended_output_asset_specs = []

hop.updated_at = datetime.utcnow()
```

#### Asset Management
```python
# 1. Add INPUT assets to hop working set
for input_asset_id in hop_lite.inputs:  # List[str] - existing mission assets
    # Add to HopAsset mapping - hop will use this existing mission asset
    asset_mapping_service.add_hop_asset(
        hop_id=hop_id,
        asset_id=input_asset_id,
        role=AssetRole.INPUT
    )

# 2. Handle OUTPUT asset (union type: NewAssetOutput | ExistingAssetOutput)
output_spec = hop_lite.output

if isinstance(output_spec, NewAssetOutput):
    # Create NEW mission-scoped intermediate asset
    created_asset_id = asset_service.create_asset(
        user_id=user_id,
        name=output_spec.asset.name,
        schema_definition=output_spec.asset.schema_definition,
        subtype=output_spec.asset.subtype,
        description=output_spec.asset.description,
        content=output_spec.asset.content,  # Should be None initially
        scope_type=AssetScopeType.MISSION,  # MISSION scope
        scope_id=mission_id,
        role=AssetRole.INTERMEDIATE,  # INTERMEDIATE from mission perspective
        asset_metadata={
            'created_by_hop': hop_id,
            'hop_name': hop_lite.name,
            'created_at': datetime.utcnow().isoformat()
        }
    )
    
    # Add to MissionAsset mapping as INTERMEDIATE
    asset_mapping_service.add_mission_asset(
        mission_id=mission_id,
        asset_id=created_asset_id,
        role=AssetRole.INTERMEDIATE
    )
    
    # Add to HopAsset mapping as OUTPUT (hop's deliverable)
    asset_mapping_service.add_hop_asset(
        hop_id=hop_id,
        asset_id=created_asset_id,
        role=AssetRole.OUTPUT
    )

elif isinstance(output_spec, ExistingAssetOutput):
    # Reference existing mission asset (input or output)
    existing_asset_id = output_spec.mission_asset_id
    
    # Add to HopAsset mapping as OUTPUT (hop will update/produce this)
    asset_mapping_service.add_hop_asset(
        hop_id=hop_id,
        asset_id=existing_asset_id,
        role=AssetRole.OUTPUT
    )
```

#### Validation Rules
- Current hop (from mission.current_hop_id) must exist and belong to the user's mission
- Current hop must be in `HOP_PLAN_STARTED` status
- All input asset IDs must refer to existing mission assets
- HopLite output specification must be valid (NewAssetOutput or ExistingAssetOutput)
- New assets must have valid schema definitions
- Asset roles in NewAssetOutput should be INTERMEDIATE (working deliverables)
- Mission must be in `IN_PROGRESS` status

#### Business Rules
- Hop planning transforms from started to proposed state
- New assets are created at mission scope (persistent deliverables)
- Input assets are linked to hop via HopAsset mapping as INPUT role
- Output assets are linked to hop via HopAsset mapping as OUTPUT role
- Mission-scoped assets are also linked via MissionAsset mapping as INTERMEDIATE role
- Hop tracks intended asset relationships for implementation phase
- Agent completes full hop design before proposing to user

### **2.3 ACCEPT_HOP_PLAN**

#### Input Data Structure
```python
hop_id: str  # UUID of the hop to accept
```

#### Semantics
This transition accepts a hop plan that is currently in `HOP_PLAN_PROPOSED` status. The user has reviewed the hop design including its input/output asset specifications and approves proceeding with the hop. The hop status changes to `HOP_PLAN_READY` making it ready for implementation planning.

#### Entity Updates

**Hop Status Update:**
```python
hop.status = HopStatus.HOP_PLAN_READY
hop.updated_at = datetime.utcnow()
```

**Asset Status Updates:**
```python
# Update all assets created during hop planning from PROPOSED to PENDING
# These are the assets created in PROPOSE_HOP_PLAN with asset_metadata containing 'created_by_hop'
for asset_id in hop.hop_asset_map.keys():
    asset = asset_service.get_asset_by_id(asset_id, user_id)
    if (asset.status == AssetStatus.PROPOSED and 
        asset.asset_metadata.get('created_by_hop') == hop_id):
        asset_service.update_asset_status(
            asset_id=asset_id,
            user_id=user_id,
            status=AssetStatus.PENDING
        )
```

#### Validation Rules
- Hop must exist and belong to the user's mission
- Hop must be in `HOP_PLAN_PROPOSED` status
- User must have permission to accept the hop plan
- Mission must be in `IN_PROGRESS` status

#### Business Rules
- Hop becomes ready for implementation planning
- Hop plan approval is irreversible
- No new entities are created during hop plan acceptance
- User can now request hop implementation via chat
- All asset relationships remain unchanged
- Assets created during hop planning become pending (ready for work)

### **3.1 START_HOP_IMPL**

#### Input Data Structure
```python
hop_id: str  # UUID of the hop to start implementation for
```

#### Semantics
This transition initiates implementation planning for a hop that is currently in `HOP_PLAN_READY` status. The user requests implementation via chat, and the hop status changes to `HOP_IMPL_STARTED`. The agent begins analyzing the hop plan to create detailed tool step implementations.

#### Entity Updates

**Hop Status Update:**
```python
hop.status = HopStatus.HOP_IMPL_STARTED
hop.updated_at = datetime.utcnow()
```

#### Validation Rules
- Hop must exist and belong to the user's mission
- Hop must be in `HOP_PLAN_READY` status
- User must have permission to modify the hop
- Mission must be in `IN_PROGRESS` status

#### Business Rules
- Hop moves from planning to implementation phase
- Implementation is user-initiated via chat interaction
- Agent begins tool step design analysis
- No new entities are created during implementation start
- All asset relationships remain unchanged

### **3.2 PROPOSE_HOP_IMPL**

#### Input Data Structure
```python
class ToolStepLite(BaseModel):
    """Simplified tool step structure for implementation proposals"""
    tool_id: str
    name: str
    description: Optional[str] = None
    sequence_order: int
    parameter_mapping: Dict[str, ParameterMappingValue] = Field(default_factory=dict)
    result_mapping: Dict[str, ResultMappingValue] = Field(default_factory=dict)
    tool_metadata: Dict[str, Any] = Field(default_factory=dict)

# Input is a list of tool steps
tool_steps: List[ToolStepLite]
```

#### Semantics
This transition completes implementation design for a hop that is currently in `HOP_IMPL_STARTED` status. The agent provides detailed tool step specifications including parameter and result mappings. Tool step entities are created with PROPOSED status, and the hop status changes to `HOP_IMPL_PROPOSED` ready for user approval.

#### Entity Updates

**Hop Status Update:**
```python
hop.status = HopStatus.HOP_IMPL_PROPOSED
hop.updated_at = datetime.utcnow()
```

**Tool Step Creation:**
```python
for step_data in tool_steps:
    tool_step = ToolStep(
        id=uuid4(),
        hop_id=hop_id,
        tool_id=step_data.tool_id,
        sequence_order=step_data.sequence_order,
        name=step_data.name,
        description=step_data.description,
        status=ToolExecutionStatus.PROPOSED,
        parameter_mapping=step_data.parameter_mapping,
        result_mapping=step_data.result_mapping,
        tool_metadata=step_data.tool_metadata,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
```

#### Validation Rules
- Hop must exist and belong to the user's mission
- Hop must be in `HOP_IMPL_STARTED` status
- All tool_ids must reference valid available tools
- Parameter mappings must reference valid asset IDs or literal values
- Result mappings must specify valid asset targets or discard instructions
- Tool step sequence orders must be unique within the hop

#### Business Rules
- Hop moves from implementation start to implementation proposed state
- Tool steps are created in PROPOSED status awaiting user approval
- Parameter/result mappings are serialized for execution
- Agent completes detailed implementation design before proposing to user
- Implementation approval required before execution can begin

### **3.3 ACCEPT_HOP_IMPL**

#### Input Data Structure
```python
hop_id: str  # UUID of the hop to accept implementation for
```

#### Semantics
This transition accepts an implementation proposal that is currently in `HOP_IMPL_PROPOSED` status. The user has reviewed the tool step specifications including parameter and result mappings and approves proceeding with execution. The hop status changes to `HOP_IMPL_READY` and all tool steps advance from PROPOSED to READY_TO_EXECUTE status.

#### Entity Updates

**Hop Status Update:**
```python
hop.status = HopStatus.HOP_IMPL_READY
hop.updated_at = datetime.utcnow()
```

**Tool Step Status Updates:**
```python
# Update all tool steps from PROPOSED to READY_TO_EXECUTE
for tool_step in hop.tool_steps:
    if tool_step.status == ToolExecutionStatus.PROPOSED:
        tool_step.status = ToolExecutionStatus.READY_TO_EXECUTE
        tool_step.updated_at = datetime.utcnow()
```

#### Validation Rules
- Hop must exist and belong to the user's mission
- Hop must be in `HOP_IMPL_PROPOSED` status
- All tool steps must be in PROPOSED status
- User must have permission to accept the implementation
- Mission must be in `IN_PROGRESS` status

#### Business Rules
- Hop becomes ready for execution
- Implementation approval is irreversible
- All tool steps become ready for execution
- No new entities are created during implementation acceptance
- User can now start hop execution
- Parameter/result mappings are finalized and cannot be changed

### **4.1 COMPLETE_TOOL_STEP**

#### Asset Management
```python
# Extract tool outputs and map to assets
tool_outputs = execution_result.get("outputs", {})
result_mapping = tool_step.result_mapping or {}

for output_name, mapping_config in result_mapping.items():
    if output_name in tool_outputs and mapping_config.get('type') == 'asset_field':
        asset_id = mapping_config.get('state_asset')
        output_value = tool_outputs[output_name]
        
        # Check if this is an existing asset or needs to be created
        existing_asset = asset_service.get_asset_by_id(asset_id, user_id)
        
        if existing_asset:
            # Update existing asset (mission-scoped or hop-scoped)
            asset_service.update_asset(
                asset_id=asset_id,
                user_id=user_id,
                updates={
                    'content': output_value,
                    'asset_metadata': {
                        **existing_asset.asset_metadata,
                        'updated_by_tool': tool_step.tool_id,
                        'tool_step_id': tool_step.id,
                        'output_name': output_name,
                        'updated_at': datetime.utcnow().isoformat()
                    }
                }
            )
        else:
            # Create new hop-scoped intermediate asset for tool working data
            created_asset_id = asset_service.create_asset(
                user_id=user_id,
                name=f"Tool {tool_step.tool_id} Output",
                schema_definition={"type": "object", "description": f"Output from {tool_step.tool_id}"},
                description=f"Intermediate output from {tool_step.name}",
                content=output_value,
                scope_type=AssetScopeType.HOP,  # HOP scope for tool intermediates
                scope_id=tool_step.hop_id,
                role=AssetRole.INTERMEDIATE,
                asset_metadata={
                    'generated_by_tool': tool_step.tool_id,
                    'tool_step_id': tool_step.id,
                    'output_name': output_name,
                    'created_at': datetime.utcnow().isoformat()
                }
            )
            
            # Add to HopAsset mapping as INTERMEDIATE
            asset_mapping_service.add_hop_asset(
                hop_id=tool_step.hop_id,
                asset_id=created_asset_id,
                role=AssetRole.INTERMEDIATE
            )
```

## Critical Implementation Notes

### Transaction Atomicity
- All entity updates within a transition must commit together or rollback completely
- Asset creation and mapping updates must be part of the same database transaction
- Session linking failures should log warnings but not fail the transaction

### Asset Scope Rules
- **Mission assets**: Created with `scope_type=AssetScopeType.MISSION`, `scope_id=mission_id`
- **Hop assets**: Created with `scope_type=AssetScopeType.HOP`, `scope_id=hop_id`

### Status Progression Rules
- Each transition validates the current status before making changes
- Invalid status transitions throw `StateTransitionError` and rollback
- Tool steps progress: PROPOSED → READY_TO_EXECUTE → EXECUTING → COMPLETED

### Sequential Execution Rules
- Only the first tool step starts EXECUTING during EXECUTE_HOP
- Each COMPLETE_TOOL_STEP can advance the next step to EXECUTING
- Hop completion requires ALL tool steps to be COMPLETED

This document ensures consistent implementation across all state transition services while maintaining database integrity and business rule compliance.