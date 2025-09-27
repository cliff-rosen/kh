from typing import Dict, Any, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

from schemas.chat import ChatMessage
from schemas.workflow import Mission, Hop
from schemas.lite_models import ToolStepLite

from utils.message_formatter import format_tool_descriptions_for_implementation

from .base_prompt_caller import BasePromptCaller

class HopImplementationResponse(BaseModel):
    """Structure for hop implementation response"""
    response_type: str = Field(description="Type of response: IMPLEMENTATION_PLAN or CLARIFICATION_NEEDED")
    response_content: str = Field(description="The main response text to add to the conversation")
    tool_steps: List[ToolStepLite] = Field(default_factory=list, description="List of tool steps to implement the hop")
    # hop_state removed - assets are managed through hop.assets list
    missing_information: List[str] = Field(default_factory=list, description="List of missing information if clarification is needed")
    reasoning: str = Field(description="Explanation of the implementation decisions made")

class HopImplementerPromptCaller(BasePromptCaller):
    """A simplified prompt caller for hop implementation"""
    
    def __init__(self):
        # Get current date and time
        current_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        
        # Define the system message
        system_message = f"""You are an AI assistant that implements "hops" - discrete processing steps within knowledge missions.

## Core Concepts

**Knowledge Mission**: A project to generate a desired information asset from available inputs using tools and resources.

**Hop**: A single processing step that:
- Takes available assets as inputs
- Applies 1-4 tool steps
- Produces output assets (either intermediate or final)

## Your Task

Design a sequence of 1-4 tool steps that transform the available input assets into the desired output assets for this specific hop.

**Important**: Focus on THIS hop's output assets, not the mission's final deliverable (unless this is the final hop).

## CRITICAL: Asset Analysis

Before implementing, carefully analyze the asset information provided:

### What to Look For in Asset Information:
1. **User Description**: User-friendly explanation of what the asset contains
2. **Agent Specification**: Detailed technical requirements including:
   - Data structure and format requirements
   - Validation criteria and constraints
   - Tool integration specifications
   - Expected schema and field definitions

### When Asset Information Is Insufficient:
If asset specifications lack critical details needed for tool configuration, respond with `CLARIFICATION_NEEDED` and specify:
- What technical details are missing
- How this impacts tool selection/configuration
- What additional specification details are needed

## Tool Step Structure

Each tool step requires:
- **Unique identifier** - Clear, descriptive name
- **Tool selection** - Which tool to use from available options
- **Parameter mapping** - How to map hop state assets to tool parameters
- **Result mapping** - How to map tool outputs back to hop state

## Available Tools
{{tools_list}}

## Current Context

**Date/Time**: {current_time}

**Mission**: {{mission_description}}

**This Hop**: {{hop_description}}

**Available Input Assets**: {{available_assets}}

**Required Output Assets**: {{desired_assets}}

## Implementation Guidelines

1. **Analyze Asset Descriptions** - Verify output asset descriptions contain sufficient detail for tool configuration
2. **Analyze the transformation** - What processing is needed to go from inputs to outputs?
3. **Select appropriate tools** - Choose tools that match the required operations and can produce the specified output format
4. **Design the sequence** - Order steps logically, ensuring each step's outputs are available for subsequent steps
5. **Map inputs flexibly** - Use asset fields when available data is suitable, or literal values when you need to construct specific formats from context
6. **Validate completeness** - Confirm all required output assets will be produced according to their detailed specifications
7. **Consider tool capabilities** - Ensure selected tools can actually produce outputs matching the asset descriptions

## Asset Mapping Syntax

### Parameter Mapping (Input to Tool)

**Option 1: Asset Field (use existing asset data)**
```python
{{{{
    "parameter_name": {{{{
        "type": "asset_field",
        "state_asset_id": "12345678-1234-5678-9abc-123456789012",
        "path": "optional.nested.field.path"
    }}}}
}}}}
```

**Option 2: Literal Value (construct value directly)**
```python
{{{{
    "parameter_name": {{{{
        "type": "literal",
        "value": "your_direct_value_here"
    }}}}
}}}}
```

### Result Mapping (Tool Output to State)
```python
{{{{
    "result_name": {{{{
        "type": "asset_field", 
        "state_asset_id": "87654321-4321-8765-cba9-210987654321"
    }}}}
}}}}
```

## Input Mapping Decision Guide

**Use `asset_field` when:**
- Asset contains the exact data needed by the tool
- Asset field provides sufficient detail and structure
- You need to reference existing user data or previous results

**Use `literal` when:**
- Asset exists but doesn't contain the specific format/detail needed
- You need to derive/transform information from available context
- Tool requires specific syntax/format that assets don't provide
- You can construct the needed value from mission/hop description

**Example:** If asset contains "research cannabis and dopamine" but tool needs specific research parameters:
```python
{{{{
    "research_goal": {{{{
        "type": "literal", 
        "value": "Generate PubMed search queries about cannabis effects on dopamine system"
    }}}}
}}}}
```

**IMPORTANT**: Use the actual asset ID (UUID) from the asset list above when using asset_field, NOT the asset name.

## Implementation Quality Checks

Before finalizing your implementation, verify:
1. ✅ All output assets can be produced with the selected tools
2. ✅ Tool parameters are correctly mapped to available input assets
3. ✅ Output format matches the detailed asset description requirements
4. ✅ Validation criteria from asset descriptions can be satisfied
5. ✅ Tool sequence is logical and dependencies are resolved
6. ✅ All required fields/properties specified in asset descriptions will be populated

## Response Guidelines

### For IMPLEMENTATION_PLAN:
- Include detailed reasoning for tool selection
- Explain how each tool step contributes to the output asset requirements
- Describe how the implementation satisfies the asset description specifications

### For CLARIFICATION_NEEDED:
- Specify exactly what asset description details are missing
- Explain why this information is critical for tool configuration
- Suggest what the asset description should include

Now implement this hop by designing the tool steps."""

        # Initialize the base class with messages_placeholder=False since we don't need conversation history
        super().__init__(
            response_model=HopImplementationResponse,
            system_message=system_message,
            messages_placeholder=False
        )
    
    async def invoke(
        self,
        mission: Mission,
        **kwargs: Dict[str, Any]
    ) -> HopImplementationResponse:
        """
        Invoke the hop implementer prompt.
        
        Args:
            mission: Current mission state (contains current_hop and assets)
            **kwargs: Additional variables to format into the prompt
            
        Returns:
            Parsed response as a HopImplementationResponse
        """
        # Get current hop from mission
        current_hop = mission.current_hop
        if not current_hop:
            raise ValueError("No current hop found in mission")
        
        # Extract and format the essential inputs
        mission_description = self._format_mission_description(mission)
        hop_description = self._format_hop_description(current_hop)
        desired_assets = self._format_desired_assets(current_hop)
        available_assets = self._format_available_assets(current_hop)
        tools_list = format_tool_descriptions_for_implementation()
        
        # Call base invoke with individual variables
        response = await super().invoke(
            messages=[],  # Empty list since we don't need conversation history
            mission_description=mission_description,
            hop_description=hop_description,
            desired_assets=desired_assets,
            available_assets=available_assets,
            tools_list=tools_list,
            **kwargs
        )

        return response
    
    def _format_mission_description(self, mission: Mission) -> str:
        """Format mission description for the prompt"""
        return f"""Name: {mission.name}
Description: {mission.description}
Goal: {mission.goal}
Success Criteria: {', '.join(mission.success_criteria)}"""

    def _format_hop_description(self, hop: Hop) -> str:
        """Format hop description for the prompt"""
        return f"""Name: {hop.name}
Description: {hop.description}
Rationale: {hop.rationale if hop.rationale else 'No rationale provided'}
Is Final: {hop.is_final}"""

    def _format_desired_assets(self, hop: Hop) -> str:
        """Format desired (output) assets for the prompt with enhanced detail"""
        # Get output assets by filtering assets list by role
        output_assets = [asset for asset in hop.assets if asset.role.value == 'output']
        if not output_assets:
            return "No output assets defined"
        
        formatted_assets = []
        for asset in output_assets:
            asset_type = asset.schema_definition.type if asset.schema_definition else "unknown"
            
            # Enhanced formatting with agent specification
            asset_info = f"- **{asset.name}** (ID: {asset.id}, {asset_type}): {asset.description}"
            
            # Add agent specification if available
            if hasattr(asset, 'agent_specification') and asset.agent_specification:
                asset_info += f"\n  Agent Spec: {asset.agent_specification}"
            
            # Add subtype if available
            if asset.subtype:
                asset_info += f"\n  Subtype: {asset.subtype}"
            
            formatted_assets.append(asset_info)
        
        return "\n\n".join(formatted_assets)

    def _format_available_assets(self, hop: Hop) -> str:
        """Format available (input) assets for the prompt with enhanced detail"""
        if not hop.assets:
            return "No assets available in hop"
        
        # Categorize assets by their role in the hop
        input_assets_list = [asset for asset in hop.assets if asset.role.value == 'input']
        output_assets_list = [asset for asset in hop.assets if asset.role.value == 'output']
        intermediate_assets_list = [asset for asset in hop.assets if asset.role.value == 'intermediate']
        
        # Format input assets with enhanced detail
        input_assets = []
        for asset in input_assets_list:
            asset_type = asset.schema_definition.type
            asset_info = f"- **{asset.name}** (ID: {asset.id}, {asset_type}): {asset.description}"
            input_details = [asset_info]
            
            # Add agent specification if available
            if hasattr(asset, 'agent_specification') and asset.agent_specification:
                input_details.append(f"  Agent Spec: {asset.agent_specification}")
            
            if asset.status != "ready":
                input_details.append(f"  Status: {asset.status}")
                # Note: Asset schema doesn't have error_message field
                # Error details would be in asset_metadata if needed
            
            input_assets_str = "\n".join(input_details) if input_details else "None"
            input_assets.append(input_assets_str)
        
        # Format output assets
        output_assets = []
        for asset in output_assets_list:
            asset_type = asset.schema_definition.type if asset.schema_definition else "unknown"
            output_assets.append(f"- **{asset.name}** (ID: {asset.id}, {asset_type}): {asset.description}")
        
        # Format intermediate assets  
        intermediate_assets = []
        for asset in intermediate_assets_list:
            asset_type = asset.schema_definition.type if asset.schema_definition else "unknown"
            intermediate_assets.append(f"- **{asset.name}** (ID: {asset.id}, {asset_type}): {asset.description}")
        
        # Build formatted string
        sections = []
        
        if input_assets:
            sections.append("**Input Assets (Available for tool parameters):**")
            sections.extend(input_assets)
            sections.append("")
        
        if output_assets:
            sections.append("**Output Assets (Target outputs to produce):**")
            sections.extend(output_assets)
            sections.append("")
        
        if intermediate_assets:
            sections.append("**Intermediate Assets (Available for processing):**")
            sections.extend(intermediate_assets)
            sections.append("")
        
        return "\n".join(sections) 