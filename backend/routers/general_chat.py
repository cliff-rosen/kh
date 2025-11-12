"""
General-purpose chat endpoint
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse
import logging

from database import get_db
from models import User
from routers.auth import get_current_user
from schemas.general_chat import ChatRequest, ChatResponse, ChatAgentResponse, ChatStatusResponse
from services.general_chat_service import GeneralChatService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/stream",
    response_class=EventSourceResponse,
    responses={
        200: {
            "description": "Server-Sent Events stream of chat responses",
            "content": {
                "text/event-stream": {
                    "schema": {
                        "oneOf": [
                            ChatAgentResponse.model_json_schema(),
                            ChatStatusResponse.model_json_schema()
                        ]
                    }
                }
            }
        }
    },
    summary="Stream chat responses",
    description="Streams chat responses in real-time using Server-Sent Events"
)
async def chat_stream(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> EventSourceResponse:
    """
    General purpose chat streaming endpoint.

    Accepts user message with context and streams:
    - Token-by-token response
    - Final structured response with suggested values/actions
    """

    async def event_generator():
        """Generate SSE events"""
        try:
            service = GeneralChatService(db, current_user.user_id)

            # Stream the response from the service
            async for chunk in service.stream_chat_message(request):
                # Yield as SSE event
                yield {
                    "event": "message",
                    "data": chunk
                }

        except Exception as e:
            logger.error(f"Error in chat stream: {str(e)}")
            error_response = ChatAgentResponse(
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
