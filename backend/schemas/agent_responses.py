"""
Agent Response Models

These models are used for streaming responses from agents.
They are kept in schemas to avoid circular imports between agents and routers.
"""

from pydantic import BaseModel, Field
from typing import Optional, Union

class AgentResponse(BaseModel):
    token: str | None = Field(description="The token for the agent")
    response_text: str | None = Field(description="The message from the agent")
    payload: str | object | None = Field(description="The payload from the agent")
    status: str | None = Field(description="The status of the agent")
    error: str | None = Field(description="The error from the agent")
    debug: str | object | None = Field(description="The debug information from the agent")

class StatusResponse(BaseModel):
    status: str = Field(description="The status of the agent")
    payload: str | object | None = Field(description="The payload from the agent")
    error: str | None = Field(description="The error from the agent")
    debug: str | object | None = Field(description="The debug information from the agent")