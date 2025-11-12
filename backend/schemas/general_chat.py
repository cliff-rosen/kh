"""
Schemas for general-purpose chat system
"""

from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Literal


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    timestamp: str


class ActionMetadata(BaseModel):
    action_identifier: str
    action_data: Optional[Any] = None


class ChatRequest(BaseModel):
    message: str
    context: Dict[str, Any]
    interaction_type: Literal["text_input", "value_selected", "action_executed"]
    action_metadata: Optional[ActionMetadata] = None
    conversation_history: List[ChatMessage]


class SuggestedValue(BaseModel):
    label: str
    value: str


class SuggestedAction(BaseModel):
    label: str
    action: str
    handler: Literal["client", "server"]
    data: Optional[Any] = None
    style: Optional[Literal["primary", "secondary", "warning"]] = None


class CustomPayload(BaseModel):
    type: str
    data: Any


class ChatResponse(BaseModel):
    message: str
    suggested_values: Optional[List[SuggestedValue]] = None
    suggested_actions: Optional[List[SuggestedAction]] = None
    payload: Optional[CustomPayload] = None


# ============================================================================
# SSE Streaming Response Types
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
