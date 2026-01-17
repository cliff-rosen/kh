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
    """Individual message for LLM interactions.

    Can be used in two modes:
    1. Simple mode: Just role and content (for internal LLM calls)
    2. Full mode: All fields populated (for chat storage/retrieval)
    """
    role: MessageRole = Field(description="Role of the message sender")
    content: str = Field(description="Content of the message")
    # Optional fields for chat storage - not needed for simple LLM calls
    id: Optional[str] = Field(default=None, description="Unique identifier for the message")
    chat_id: Optional[str] = Field(default=None, description="ID of the parent chat session")
    message_metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional message metadata")
    created_at: Optional[datetime] = Field(default=None, description="When the message was created")
    updated_at: Optional[datetime] = Field(default=None, description="When the message was last updated")


# Backwards compatibility alias
ChatMessage = LLMMessage
