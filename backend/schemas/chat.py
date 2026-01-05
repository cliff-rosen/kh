"""
Chat domain types for user-facing chat feature

This module contains:
- Core types: Conversation, Message, MessageRole (matching models.py)
- Stream event types for SSE streaming
- Interaction types: SuggestedValue, SuggestedAction, etc.

For LLM infrastructure types, see schemas/llm.py
"""

from pydantic import BaseModel
from typing import List, Optional, Any, Literal, Union
from datetime import datetime
from enum import Enum


# ============================================================================
# Core Types (matching models.py)
# ============================================================================

class MessageRole(str, Enum):
    """Role of a message sender in a conversation"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Message(BaseModel):
    """A message in a conversation"""
    id: int
    conversation_id: int
    role: MessageRole
    content: str
    context: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class Conversation(BaseModel):
    """A chat conversation"""
    id: int
    user_id: int
    app: str = "kh"  # "kh", "tablizer", "trialscout"
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationWithMessages(Conversation):
    """A conversation with its messages"""
    messages: List[Message]


# ============================================================================
# Interaction Types
# ============================================================================

class SuggestedValue(BaseModel):
    """A suggested value that the user can select"""
    label: str
    value: str


class SuggestedAction(BaseModel):
    """A suggested action button"""
    label: str
    action: str
    handler: Literal["client", "server"]
    data: Optional[Any] = None
    style: Optional[Literal["primary", "secondary", "warning"]] = None


class CustomPayload(BaseModel):
    """Custom payload for specialized chat responses"""
    type: str
    data: Any


class ActionMetadata(BaseModel):
    """Metadata for action-based interactions"""
    action_identifier: str
    action_data: Optional[Any] = None


class ToolHistoryEntry(BaseModel):
    """Record of a tool call made during the response"""
    tool_name: str
    input: Any
    output: Any


class ChatDiagnostics(BaseModel):
    """Diagnostics info about what was passed to the agent loop"""
    model: str
    max_tokens: int
    max_iterations: int
    temperature: float
    tools: List[str]  # List of tool names available
    system_prompt: str
    messages: List[dict]  # The messages passed to the LLM
    context: dict  # The context object
    raw_llm_response: Optional[str] = None  # Raw text collected from LLM before parsing


class ChatResponsePayload(BaseModel):
    """Structured payload for final chat responses"""
    message: str
    suggested_values: Optional[List[SuggestedValue]] = None
    suggested_actions: Optional[List[SuggestedAction]] = None
    custom_payload: Optional[CustomPayload] = None
    tool_history: Optional[List[ToolHistoryEntry]] = None
    conversation_id: Optional[int] = None
    diagnostics: Optional[ChatDiagnostics] = None


# ============================================================================
# Stream Event Types (discriminated union with explicit 'type' field)
# ============================================================================

class TextDeltaEvent(BaseModel):
    """Streaming text token"""
    type: Literal["text_delta"] = "text_delta"
    text: str


class StatusEvent(BaseModel):
    """Status message (thinking, processing, etc.)"""
    type: Literal["status"] = "status"
    message: str


class ToolStartEvent(BaseModel):
    """Tool execution begins"""
    type: Literal["tool_start"] = "tool_start"
    tool: str
    input: Any
    tool_use_id: str


class ToolProgressEvent(BaseModel):
    """Tool execution progress update"""
    type: Literal["tool_progress"] = "tool_progress"
    tool: str
    stage: str
    message: str
    progress: float  # 0.0 to 1.0
    data: Optional[Any] = None


class ToolCompleteEvent(BaseModel):
    """Tool execution finished"""
    type: Literal["tool_complete"] = "tool_complete"
    tool: str
    index: int  # Index for [[tool:N]] markers


class CompleteEvent(BaseModel):
    """Final response with payload"""
    type: Literal["complete"] = "complete"
    payload: ChatResponsePayload


class ErrorEvent(BaseModel):
    """Error occurred"""
    type: Literal["error"] = "error"
    message: str


class CancelledEvent(BaseModel):
    """Request was cancelled"""
    type: Literal["cancelled"] = "cancelled"


# Discriminated union of all stream event types
StreamEvent = Union[
    TextDeltaEvent,
    StatusEvent,
    ToolStartEvent,
    ToolProgressEvent,
    ToolCompleteEvent,
    CompleteEvent,
    ErrorEvent,
    CancelledEvent
]


# ============================================================================
# Backwards Compatibility Aliases
# ============================================================================

# Alias for code still using GeneralChatMessage
class GeneralChatMessage(BaseModel):
    """Simple chat message for general chat API (backwards compatibility)"""
    role: Literal["user", "assistant"]
    content: str
    timestamp: str
