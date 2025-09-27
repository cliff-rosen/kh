from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from schemas.chat import ChatMessage
from schemas.workflow import Mission
from schemas.lite_models import MissionLite

from utils.message_formatter import format_tool_descriptions_for_mission_design
from .base_prompt_caller import BasePromptCaller

class MissionDefinitionResponse(BaseModel):
    """Structure for mission definition response"""
    response_type: str = Field(description="Type of response: MISSION_DEFINITION or INTERVIEW_QUESTION")
    response_content: str = Field(description="The main response text added to the conversation")
    mission_proposal: Optional[MissionLite] = Field(default=None, description="Proposed mission details")

class MissionDefinitionPromptCaller(BasePromptCaller):
    """A simplified prompt caller for mission definition"""
    
    def __init__(self):
        # Get current date and time
        current_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        
        # Define the system message
        system_message = f"""You are an AI assistant that helps users create structured mission definitions for knowledge-based projects. Your primary responsibilities are:

## Core Functions
1. **Analyze** user requirements and identify gaps in their mission definition
2. **Structure** incomplete ideas into comprehensive mission plans
3. **Clarify** ambiguous requirements through targeted questions
4. **Validate** that mission plans are actionable and measurable with available tools

## Current Date and Time
{current_time}

## Available Tools
The system has these specific tools available for mission execution:

{{tool_descriptions}}

## Mission Structure
A mission consists of:
1. A clear goal and success criteria including scoping parameters, output asset descriptions, and validation criteria
2. Required input assets (user data + external system credentials)
3. Expected output assets
4. A defined scope

## Asset Types and Roles
1. **Mission Inputs** (role: "input"):
   - **USER CONTEXT (REQUIRED)**: Always include an input asset that captures the user's original question, request, or parameters that started the mission. This can be named "User Context", "User Request", "Initial Context", "Mission Context", or similar.
   - User-provided data (files, text, config values)
   - External system credentials (type: "config")
   - Must specify external_system_for if providing credentials

2. **Mission Outputs** (role: "output"):
   - Final deliverables only (ie. not intermediate data like search queries)
   - Reports, summaries, processed data

3. **Valid Asset Types**:
    PrimitiveType = Literal['string', 'number', 'boolean', 'primitive']
    ComplexType = Literal['object', 'file', 'database_entity', 'markdown', 'config']
    CanonicalType = Literal['email', 'webpage', 'search_result', 'pubmed_article', 'newsletter', 'daily_newsletter_recap', 'pubmed_extraction', 'scored_article']


## CRITICAL REQUIREMENTS
1. Every mission MUST include an initial input asset that contains the user's original question, request, or parameters. This provides essential context for the mission execution and ensures that the user's intent is always available as a reference point. If the user hasn't explicitly provided context information, create an input asset that captures their implied request or question.

2. Every mission MUST include an output asset that contains the final deliverable. This is the main result of the mission.

## Current Context
Mission Goal: {{mission_goal}}
Desired Assets: {{desired_assets}}

Based on the conversation history and available tools, analyze what information is complete and what needs clarification to create an effective mission plan."""

        # Initialize the base class
        super().__init__(
            response_model=MissionDefinitionResponse,
            system_message=system_message
        )
    
    async def invoke(
        self,
        messages: List[ChatMessage],
        mission: Mission,
        **kwargs: Dict[str, Any]
    ) -> MissionDefinitionResponse:
        """
        Invoke the mission definition prompt.
        
        Args:
            messages: List of conversation messages
            mission: Current mission state (only goal and outputs are used)
            **kwargs: Additional variables to format into the prompt
            
        Returns:
            Parsed response as a MissionDefinitionResponse
        """
        # Format tool descriptions
        tool_descriptions = format_tool_descriptions_for_mission_design()
        
        # Extract mission goal (handle None mission)
        mission_goal = mission.goal if mission and mission.goal else "No goal specified"
        
        # Format desired assets (mission outputs)
        outputs = mission.get_outputs() if mission else []
        if outputs:
            desired_assets = "\n".join([
                f"- {asset.name} ({asset.schema_definition.type}): {asset.description}"
                for asset in outputs
            ])
        else:
            desired_assets = "No specific outputs defined yet"
        
        # Format existing inputs from the mission (if any)
        inputs = mission.get_inputs() if mission else []
        if inputs:
            existing_inputs = "\n".join([
                f"- {asset.name} ({asset.schema_definition.type}): {asset.description}"
                for asset in inputs
            ])
        else:
            existing_inputs = "No existing inputs defined"
        
        # Call base invoke with simplified variables
        response = await super().invoke(
            messages=messages,
            tool_descriptions=tool_descriptions,
            mission_goal=mission_goal,
            desired_assets=desired_assets,
            existing_inputs=existing_inputs,
            **kwargs
        )

        return response 