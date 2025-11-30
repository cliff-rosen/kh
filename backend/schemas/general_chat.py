"""
General chat domain types and streaming response types

Domain types: GeneralChatMessage, ActionMetadata, SuggestedValue, SuggestedAction, CustomPayload
Streaming response types: ChatPayload, ChatAgentResponse, ChatStatusResponse
Request model (ChatRequest) is in routers/general_chat.py
"""

from pydantic import BaseModel
from typing import List, Optional, Any, Literal


# ============================================================================
# Domain Types
# ============================================================================

class GeneralChatMessage(BaseModel):
    """Simple chat message for general chat API"""
    role: Literal["user", "assistant"]
    content: str
    timestamp: str


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
