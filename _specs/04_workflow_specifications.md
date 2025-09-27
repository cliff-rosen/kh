# Workflow Specifications

This document defines the essential workflows for mission and hop creation, with precise asset management patterns and tool execution flows.

## Core Concept: Dual Representation

The system uses two representations of entities:

1. **Essence Representation**: Simplified models that capture the core meaning for LLM processing
2. **Full Implementation**: Complete models with all data relationships, metadata, and system requirements

The **Essential Inputs/Outputs** describe the essence representation that LLMs work with, while **Post-Processing** describes how these are mapped to the full implementation.

## Mission Creation Workflow

### Essential Inputs (Essence)

The following inputs are required when creating a mission that doesn't exist:

- **Message History**: The conversation context and user requirements
- **Tool List**: Available tools that can be used to accomplish the mission

### Essential Outputs (Essence)

The mission creation process must produce:

- **Name**: A clear, descriptive name for the mission
- **Goal**: The primary objective the mission aims to achieve
- **Success Criteria**: Measurable outcomes that define mission completion
- **Input Assets**: Required data and credentials needed to start the mission
- **Output Assets**: The final deliverables the mission will produce

### Post-Processing (Essence → Full Implementation)

After the initial mission proposal is created, the primary agent must:

1. **Direct Transfer**: Name, goal, and success criteria are taken directly from the proposal
2. **Asset Management**: All assets are properly initialized with appropriate statuses and metadata
3. **Database Persistence**: Mission and assets are persisted with proper mapping relationships

**Asset Creation Process**:
```python
# For each asset in the mission proposal
for asset_spec in mission_proposal.assets:
    # Create asset at mission scope
    created_asset_id = asset_service.create_asset(
        scope_type="mission",
        scope_id=mission_id,
        role=asset_spec.role,  # input, output, or intermediate
        **asset_spec.data
    )
    
    # Create mission-asset mapping
    asset_mapping_service.add_mission_asset(
        mission_id=mission_id,
        asset_id=created_asset_id,
        role=AssetRole(asset_spec.role)
    )
```

## Hop Planning Workflow

### Essential Inputs (Essence)

The following inputs are required for creating a new hop in an existing mission:

- **Mission Description**: Context about the overall mission and current progress
- **Available Assets**: Current mission assets that can be used as inputs
- **Tool List**: Available tools that can be used to implement the hop

### Essential Outputs (Essence)

Each hop proposal must include:

- **Name**: A descriptive name for the hop (2-8 words)
- **Description**: One sentence explaining what the hop accomplishes
- **Required Inputs**: Assets needed from the available mission assets
- **Target Output**: Either reference to existing mission asset or specification for new asset
- **Rationale**: Explanation of why this hop is needed and how it contributes to the mission

### Post-Processing (Essence → Full Implementation)

After a hop is proposed, the primary agent must:

1. **Asset Input Mapping**: Link existing mission assets as hop inputs
2. **Asset Output Management**: Handle hop output specification (union type)
3. **Hop Asset Mapping**: Create proper asset-to-hop relationships

**Asset Management Process**:
```python
# 1. Add input assets to hop working set
for input_asset_id in hop_proposal.input_asset_ids:
    asset_mapping_service.add_hop_asset(
        hop_id=hop_id,
        asset_id=input_asset_id,
        role=AssetRole.INPUT
    )

# 2. Handle output asset (union type)
output_spec = hop_proposal.output

if output_spec.type == "new_asset":
    # Create new mission-scoped intermediate asset
    created_asset_id = asset_service.create_asset(
        scope_type='mission',
        scope_id=mission_id,
        role='intermediate',  # INTERMEDIATE from mission perspective
        **output_spec.asset_data
    )
    
    # Add to mission and hop mappings
    asset_mapping_service.add_mission_asset(mission_id, created_asset_id, AssetRole.INTERMEDIATE)
    asset_mapping_service.add_hop_asset(hop_id, created_asset_id, AssetRole.OUTPUT)

elif output_spec.type == "existing_asset":
    # Reference existing mission asset
    asset_mapping_service.add_hop_asset(
        hop_id=hop_id,
        asset_id=output_spec.mission_asset_id,
        role=AssetRole.OUTPUT
    )
```

## Hop Implementation Workflow

### Essential Inputs (Essence)

The following inputs are required for implementing a proposed hop:

- **Hop Definition**: The hop proposal with input/output mappings
- **Available Tools**: Complete list of tools with their parameters and outputs
- **Mission Context**: Overall mission goal and current progress

### Essential Outputs (Essence)

Each hop implementation must produce:

- **Tool Steps**: A sequence of 1-4 tool executions that transform inputs to outputs
- **Parameter Mappings**: How each tool's parameters map to hop assets
- **Result Mappings**: How each tool's outputs map to hop assets
- **Intermediate Assets**: Any new assets created during the tool chain

### Tool Step Structure

Each tool step must include:

- **ID**: Unique identifier for the step
- **Tool ID**: The specific tool to execute
- **Description**: What this step accomplishes
- **Parameter Mapping**: Maps tool parameters to hop assets or literal values
- **Result Mapping**: Maps tool outputs to hop assets

### Mapping Types

#### Parameter Mapping
- **Asset Field Mapping**: `{"type": "asset_field", "state_asset": "asset_id"}`
- **Literal Mapping**: `{"type": "literal", "value": "actual_value"}`

#### Result Mapping
- **Asset Field Mapping**: `{"type": "asset_field", "state_asset": "asset_id"}`
- **Discard Mapping**: `{"type": "discard"}` (for unused outputs)

### Post-Processing (Essence → Full Implementation)

After a hop is implemented, the primary agent must:

1. **Tool Step Creation**: Create ToolStep entities with proper mappings
2. **Validation**: Tool chain is validated against hop assets and tool definitions
3. **Status Update**: Hop is marked as ready for execution

**Tool Step Creation Process**:
```python
for i, tool_step_data in enumerate(tool_steps):
    tool_step = ToolStep(
        id=uuid4(),
        hop_id=hop_id,
        user_id=user_id,
        tool_id=tool_step_data['tool_id'],
        sequence_order=i + 1,
        name=tool_step_data.get('name', f'Step {i + 1}'),
        description=tool_step_data.get('description'),
        status=ToolExecutionStatus.PROPOSED,
        parameter_mapping=serialize_mappings(tool_step_data.get('parameter_mapping', {})),
        result_mapping=serialize_mappings(tool_step_data.get('result_mapping', {})),
        resource_configs=tool_step_data.get('resource_configs', {}),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
```

## Tool Execution Flow

### Execution Sequence

1. **Setup**: Hop assets are initialized from mission asset mappings
2. **Sequential Execution**: Each tool step executes in order:
   - Parameters are resolved from hop assets
   - Tool is executed with resolved parameters
   - Results are mapped back to hop assets
3. **Completion**: Output assets are updated with final results

### Asset Management During Execution

**Existing Asset Updates**:
```python
# Update existing mission-scoped or hop-scoped asset
asset_service.update_asset(
    asset_id=asset_id,
    user_id=user_id,
    updates={
        'content': output_value,
        'asset_metadata': {
            **existing_asset.asset_metadata,
            'updated_by_tool': tool_step.tool_id,
            'tool_step_id': tool_step.id,
            'updated_at': datetime.utcnow().isoformat()
        }
    }
)
```

**New Hop-Scoped Intermediate Creation**:
```python
# Create new hop-scoped asset for tool working data
created_asset_id = asset_service.create_asset(
    scope_type='hop',  # HOP scope for tool intermediates
    scope_id=tool_step.hop_id,
    role='intermediate',
    name=f"Tool {tool_step.tool_id} Output",
    content=output_value,
    asset_metadata={
        'generated_by_tool': tool_step.tool_id,
        'tool_step_id': tool_step.id,
        'created_at': datetime.utcnow().isoformat()
    }
)

# Add to hop asset mapping
asset_mapping_service.add_hop_asset(
    hop_id=tool_step.hop_id,
    asset_id=created_asset_id,
    role=AssetRole.INTERMEDIATE
)
```

## Asset Management Patterns

### Asset Types and Validation

- Assets must use valid types: `string`, `number`, `boolean`, `primitive`, `object`, `file`, `database_entity`, `markdown`, `config`, `email`, `webpage`, `search_result`, `pubmed_article`, `newsletter`, `daily_newsletter_recap`
- For collections, set `is_collection=true` and specify `collection_type` as `array`, `map`, or `set`
- External system credentials must use type `config`

### Asset Categories

- **Mission Assets**: Final deliverables and persistent working artifacts
- **Available Assets**: Current mission assets that can be used as hop inputs
- **Intermediate Assets**: Assets created by hops or tools that contribute to final outputs

### Asset Scoping Rules

**Mission-Scoped Assets**:
- Created during mission proposal (inputs/outputs)
- Created during hop planning (new intermediates)
- Persist throughout mission lifecycle
- Managed through `MissionAsset` mapping table

**Hop-Scoped Assets**:
- Created during tool execution (working data)
- Temporary, discarded after hop completion
- Managed through `HopAsset` mapping table

## Design Principles

1. **Incremental Progress**: Each hop should make clear progress toward the mission goal
2. **Tractability**: Each hop should be implementable with available tools
3. **Cohesive Goals**: Each hop should have a clear, focused purpose
4. **Input/Output Focus**: Each hop should clearly map inputs to outputs
5. **Asset Consistency**: Asset scoping and roles must be properly maintained

## Validation Requirements

### Tool Chain Validation

The tool chain must be validated to ensure:

1. **Asset Availability**: All parameter mappings reference available assets
2. **Tool Compatibility**: Tool parameters match expected types
3. **Chain Completeness**: All required outputs are produced
4. **Execution Order**: Dependencies between steps are properly sequenced

### Business Rule Validation

1. **Status Progression**: Entities must be in correct status for transitions
2. **User Authorization**: All operations properly scoped to authenticated user
3. **Asset Integrity**: Asset mappings maintain referential integrity
4. **Execution Constraints**: Tool steps execute sequentially within hops

This workflow specification ensures consistent, reliable processing of missions and hops while maintaining proper asset management and execution constraints throughout the system.