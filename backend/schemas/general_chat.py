"""
Domain types and streaming response types for general-purpose chat system

Domain types (used across service and router):
- GeneralChatMessage, ActionMetadata, SuggestedValue, SuggestedAction, CustomPayload

Streaming response types (used by service, consumed by router):
- ChatPayload, ChatAgentResponse, ChatStatusResponse

API request model is in routers/general_chat.py (ChatRequest)
"""

from pydantic import BaseModel
from typing import List, Optional, Any, Literal


# ============================================================================
# Domain Types
# ============================================================================

class GeneralChatMessage(BaseModel):
    """Simple chat message for general chat API (not to be confused with schemas.chat.ChatMessage)"""
    role: Literal["user", "assistant"]
    content: str
    timestamp: str


class ActionMetadata(BaseModel):
    """Metadata for action-based interactions"""
    action_identifier: str
    action_data: Optional[Any] = None


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


# ============================================================================
# Streaming Response Types (constructed by service, streamed by router)
# ============================================================================

class ChatPayload(BaseModel):
    """The specific typed payload for chat responses"""
    message: str
    suggested_values: Optional[List[SuggestedValue]] = None
    suggested_actions: Optional[List[SuggestedAction]] = None
    payload: Optional[CustomPayload] = None


class ChatAgentResponse(BaseModel):
    """Agent response with typed payload for chat"""
    token: Optional[str] = None
    response_text: Optional[str] = None
    payload: Optional[ChatPayload] = None
    status: Optional[str] = None
    error: Optional[str] = None
    debug: Optional[Any] = None


class ChatStatusResponse(BaseModel):
    """Status response for chat"""
    status: str
    payload: Optional[Any] = None
    error: Optional[str] = None
    debug: Optional[Any] = None
