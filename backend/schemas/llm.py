"""
LLM message types for AI model interactions

These types are used across the application for structuring messages to LLMs
(OpenAI, Anthropic, etc.). Used by agents, prompts, and services that call LLMs.

NOT for user-facing chat - see schemas/chat.py for user chat types.
"""

from typing import Optional, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    """Role of a message in an LLM conversation"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"
    STATUS = "status"


class LLMMessage(BaseModel):
    """Individual message for LLM interactions"""
    id: str = Field(description="Unique identifier for the message")
    chat_id: str = Field(description="ID of the parent chat session")
    role: MessageRole = Field(description="Role of the message sender")
    content: str = Field(description="Content of the message")
    message_metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional message metadata")
    created_at: datetime = Field(description="When the message was created")
    updated_at: datetime = Field(description="When the message was last updated")


# Backwards compatibility alias
ChatMessage = LLMMessage


class AssetReference(BaseModel):
    """Lightweight asset reference for LLM requests"""
    id: str = Field(description="Unique identifier for the asset")
    name: str = Field(description="Name of the asset")
    description: str = Field(description="Description of the asset")
    type: str = Field(description="Type of the asset")
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Optional metadata for the asset"
    )
