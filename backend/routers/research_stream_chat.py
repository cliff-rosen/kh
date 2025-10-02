"""
Research Stream Chat endpoint for AI-guided stream creation
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from database import get_db
from models import User
from routers.auth import get_current_user
from services.stream_chat_service import StreamChatService

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
