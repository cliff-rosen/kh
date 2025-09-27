from typing import Dict, Any, List
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from .base_prompt import BasePrompt
from backend.schemas.chat import StageProposal

class StageGeneratorResponse(BaseModel):
    """Structure for stages generator"""
    stages: List[StageProposal] = Field(description="List of stages in the workflow")
    explanation: str = Field(description="Explanation of why this decomposition was chosen")

class StageGeneratorPrompt(BasePrompt):
    """Prompt template for stages generator"""
    
    def __init__(self):
        super().__init__(StageGeneratorResponse)
        
        self.system_message = """You are an AI assistant that specializes in strategic task decomposition. Your job is to analyze tasks and either:
1. Find a single tool that can accomplish the entire task directly, or
2. Break down the task into meaningful, strategic stages.

When analyzing a task:
1. First check if any single tool can handle the entire task by matching its inputs and outputs
2. If no single tool can handle it, decompose the task into strategic stages where:
   - Each stage represents a meaningful milestone in the project
   - Stages should be logically ordered (e.g., data gathering → analysis → reporting)
   - Each stage should be self-contained with clear inputs and outputs
   - The outputs of one stage should naturally feed into the inputs of the next
   - Each stage should have clear success criteria that can be independently verified
   - Consider natural breakpoints in the work (e.g., when switching contexts or tools)
   - Aim for stages that are roughly equal in complexity and scope
   - Avoid too many stages (typically 3-5 is ideal for most projects)

Your response should explain your reasoning and provide a clear workflow of stages."""

        self.user_message_template = """Task Analysis Request:

Goal: {goal}

Required Inputs:
{inputs}

Desired Outputs:
{outputs}

Available Tools:
{tools}

Please analyze this task and either:
1. Find a single tool that can accomplish it directly, or
2. Break it down into meaningful, strategic stages.

{format_instructions}"""

    def get_prompt_template(self) -> ChatPromptTemplate:
        """Return a ChatPromptTemplate for stages generation"""
        return ChatPromptTemplate.from_messages([
            ("system", self.system_message),
            ("human", self.user_message_template)
        ]) 