"""
General chat domain types and payload types

Domain types: GeneralChatMessage, ActionMetadata, SuggestedValue, SuggestedAction, CustomPayload
Response payload type: ChatResponsePayload (structured final response)
Request/Response models (ChatRequest, ChatStreamChunk, ChatStatusResponse) are in routers/general_chat.py
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
# Response Payload Type (structured final response data)
# ============================================================================

class ChatResponsePayload(BaseModel):
    """Structured payload for final chat responses"""
    message: str
    suggested_values: Optional[List[SuggestedValue]] = None
    suggested_actions: Optional[List[SuggestedAction]] = None
    custom_payload: Optional[CustomPayload] = None
