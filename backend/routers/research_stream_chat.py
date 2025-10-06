"""
Research Stream Chat endpoint for AI-guided stream creation
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from sse_starlette.sse import EventSourceResponse
import logging

from database import get_db
from models import User
from schemas.stream_building import (
    StreamInProgress,
    StreamBuildStep,
    UserAction,
    UserActionType,
    Suggestion,
    MultiSelectOption
)

from routers.auth import get_current_user
from services.research_stream_chat_service import ResearchStreamChatService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/research-streams", tags=["research-streams"])


# ============================================================================
# API Request/Response Types
# ============================================================================

class ApiMessage(BaseModel):
    """Simple message format for API requests"""
    role: Literal["user", "assistant"] = Field(description="Role of the message sender")
    content: str = Field(description="Message content")


class StreamBuildChatRequest(BaseModel):
    """Request for stream building chat endpoint"""
    message: str = Field(description="User's message")
    current_stream: StreamInProgress = Field(description="Current stream being built")
    current_step: StreamBuildStep = Field(description="Current step in the workflow")
    conversation_history: List[ApiMessage] = Field(default_factory=list, description="Full conversation history")
    user_action: Optional[UserAction] = Field(None, description="Metadata about user's action")


class StreamBuildChatPayload(BaseModel):
    """The specific typed payload for stream building responses"""
    message: str = Field(description="AI's response text")
    mode: Literal["QUESTION", "SUGGESTION", "REVIEW"] = Field(description="Response mode")
    target_field: Optional[str] = Field(None, description="Field being asked about")
    next_step: StreamBuildStep = Field(description="Next workflow step")
    updated_stream: StreamInProgress = Field(description="Updated stream data")
    suggestions: Optional[List[Suggestion]] = Field(None, description="Suggestion chips")
    options: Optional[List[MultiSelectOption]] = Field(None, description="Checkbox options")
    proposed_message: Optional[str] = Field(None, description="Button text for options")


# ============================================================================
# SSE Streaming Response Types
# ============================================================================

class StreamBuildAgentResponse(BaseModel):
    """Agent response with typed payload for stream building"""
    token: Optional[str] = Field(None, description="Individual token")
    response_text: Optional[str] = Field(None, description="Accumulated text")
    payload: Optional[StreamBuildChatPayload] = Field(None, description="Final parsed response")
    status: Optional[str] = Field(None, description="Status of the agent")
    error: Optional[str] = Field(None, description="Error message if any")
    debug: Optional[str | dict] = Field(None, description="Debug information")


class StreamBuildStatusResponse(BaseModel):
    """Status response for stream building"""
    status: str = Field(description="Status message")
    payload: Optional[str | dict] = Field(None, description="Additional status data")
    error: Optional[str] = Field(None, description="Error message if any")
    debug: Optional[str | dict] = Field(None, description="Debug information")


@router.post("/chat/stream",
    response_class=EventSourceResponse,
    responses={
        200: {
            "description": "Server-Sent Events stream of typed stream building responses",
            "content": {
                "text/event-stream": {
                    "schema": {
                        "oneOf": [
                            StreamBuildAgentResponse.model_json_schema(),
                            StreamBuildStatusResponse.model_json_schema()
                        ]
                    },
                    "example": "data: {\"token\": \"Hello\", \"response_text\": null, \"payload\": null, \"status\": \"processing\", \"error\": null, \"debug\": null}\n\n"
                }
            }
        }
    },
    summary="Stream chat responses for stream creation",
    description="Streams responses in real-time using Server-Sent Events for AI-guided stream creation"
)
async def chat_stream_for_stream_creation(
    request: StreamBuildChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> EventSourceResponse:
    """
    Stream chat responses for AI-guided research stream creation.

    Returns Server-Sent Events where each event is structured as StreamBuildAgentResponse or StreamBuildStatusResponse:
    - StreamBuildStatusResponse: Used for tool usage, thinking status updates
    - StreamBuildAgentResponse: Used for streaming tokens and final responses with typed payload
    """

    async def event_generator():
        """Generate SSE events that are typed stream building responses"""
        try:
            service = ResearchStreamChatService(db, current_user.user_id)

            # Default user_action to text_input if not provided (backward compatibility)
            user_action = request.user_action or UserAction(type=UserActionType.TEXT_INPUT)

            # Stream the response from the service
            async for chunk in service.stream_chat_message(
                message=request.message,
                current_stream=request.current_stream,
                current_step=request.current_step,
                conversation_history=[msg.model_dump() for msg in request.conversation_history],
                user_action=user_action
            ):
                # Yield as SSE event
                yield {
                    "event": "message",
                    "data": chunk
                }

        except Exception as e:
            logger.error(f"Error in stream chat: {str(e)}")
            error_response = StreamBuildAgentResponse(
                token=None,
                response_text=None,
                payload=None,
                status=None,
                error=str(e),
                debug=None
            )
            yield {
                "event": "message",
                "data": error_response.model_dump_json()
            }

    return EventSourceResponse(event_generator())
