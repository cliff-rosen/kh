"""
Research Stream Chat endpoint for AI-guided stream creation
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from sse_starlette.sse import EventSourceResponse
import logging

from database import get_db
from models import User
from schemas.agent_responses import AgentResponse, StatusResponse

from routers.auth import get_current_user
from services.stream_chat_service import StreamChatService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/research-streams", tags=["research-streams"])


class StreamChatRequest(BaseModel):
    message: str
    current_config: Dict[str, Any]
    current_step: str


class CheckboxOption(BaseModel):
    label: str
    value: str
    checked: bool


class StreamChatResponse(BaseModel):
    message: str
    next_step: str
    updated_config: Dict[str, Any]
    suggestions: Optional[Dict[str, List[str]]] = None
    options: Optional[List[CheckboxOption]] = None


@router.post("/chat", response_model=StreamChatResponse)
async def chat_for_stream_creation(
    request: StreamChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Process a chat message in the stream creation interview flow.
    The AI assistant guides the user through creating a research stream.
    """
    service = StreamChatService(db, current_user.user_id)
    response = await service.process_message(
        message=request.message,
        current_config=request.current_config,
        current_step=request.current_step
    )
    return response


@router.post("/chat/stream",
    response_class=EventSourceResponse,
    responses={
        200: {
            "description": "Server-Sent Events stream of AgentResponse objects (AgentResponse | StatusResponse)",
            "content": {
                "text/event-stream": {
                    "schema": {
                        "oneOf": [
                            AgentResponse.model_json_schema(),
                            StatusResponse.model_json_schema()
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
    request: StreamChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> EventSourceResponse:
    """
    Stream chat responses for AI-guided research stream creation.

    Returns Server-Sent Events where each event is structured as AgentResponse or StatusResponse:
    - StatusResponse: Used for tool usage, thinking status updates
    - AgentResponse: Used for streaming tokens and final responses
    """

    async def event_generator():
        """Generate SSE events that are AgentResponse or StatusResponse objects"""
        try:
            service = StreamChatService(db, current_user.user_id)

            # Stream the response from the service
            async for chunk in service.stream_message(
                message=request.message,
                current_config=request.current_config,
                current_step=request.current_step
            ):
                # Yield as SSE event
                yield {
                    "event": "message",
                    "data": chunk
                }

        except Exception as e:
            logger.error(f"Error in stream chat: {str(e)}")
            error_response = AgentResponse(
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
