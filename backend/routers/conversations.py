"""
Conversations Router

Endpoints for chat conversation persistence.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from database import get_db
from models import User, UserRole
from services import auth_service
from services.conversation_service import ConversationService

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


# === Schemas ===

class CreateConversationRequest(BaseModel):
    """Request to create a conversation"""
    title: Optional[str] = None


class AddMessageRequest(BaseModel):
    """Request to add a message"""
    role: str  # 'user', 'assistant'
    content: str
    context: Optional[dict] = None


class UpdateTitleRequest(BaseModel):
    """Request to update conversation title"""
    title: str


class MessageResponse(BaseModel):
    """Single message response"""
    id: int
    role: str
    content: str
    context: Optional[dict] = None
    created_at: str


class ConversationResponse(BaseModel):
    """Conversation response"""
    id: int
    title: Optional[str] = None
    created_at: str
    updated_at: str


class ConversationWithMessagesResponse(BaseModel):
    """Conversation with messages"""
    id: int
    title: Optional[str] = None
    created_at: str
    updated_at: str
    messages: List[MessageResponse]


class ConversationsListResponse(BaseModel):
    """List of conversations"""
    conversations: List[ConversationResponse]


# === User Endpoints ===

@router.post("", response_model=ConversationResponse)
async def create_conversation(
    request: CreateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """Create a new conversation."""
    service = ConversationService(db)
    conv = service.create_conversation(
        user_id=current_user.user_id,
        title=request.title
    )
    return ConversationResponse(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat()
    )


@router.get("", response_model=ConversationsListResponse)
async def list_conversations(
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """List user's conversations."""
    service = ConversationService(db)
    convs = service.get_user_conversations(
        user_id=current_user.user_id,
        limit=limit,
        offset=offset
    )
    return ConversationsListResponse(
        conversations=[
            ConversationResponse(
                id=c.id,
                title=c.title,
                created_at=c.created_at.isoformat(),
                updated_at=c.updated_at.isoformat()
            )
            for c in convs
        ]
    )


@router.get("/{conversation_id}", response_model=ConversationWithMessagesResponse)
async def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """Get a conversation with its messages."""
    service = ConversationService(db)
    conv = service.get_conversation(conversation_id, current_user.user_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = service.get_messages(conversation_id, current_user.user_id)

    return ConversationWithMessagesResponse(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
        messages=[
            MessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                context=m.context,
                created_at=m.created_at.isoformat()
            )
            for m in messages
        ]
    )


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: int,
    request: UpdateTitleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """Update conversation title."""
    service = ConversationService(db)
    conv = service.update_conversation_title(
        conversation_id=conversation_id,
        user_id=current_user.user_id,
        title=request.title
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return ConversationResponse(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat()
    )


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """Delete a conversation and all its messages."""
    service = ConversationService(db)
    deleted = service.delete_conversation(conversation_id, current_user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"success": True}


@router.post("/{conversation_id}/messages", response_model=MessageResponse)
async def add_message(
    conversation_id: int,
    request: AddMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """Add a message to a conversation."""
    if request.role not in ('user', 'assistant', 'system'):
        raise HTTPException(status_code=400, detail="Role must be 'user', 'assistant', or 'system'")

    service = ConversationService(db)
    message = service.add_message(
        conversation_id=conversation_id,
        user_id=current_user.user_id,
        role=request.role,
        content=request.content,
        context=request.context
    )
    if not message:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return MessageResponse(
        id=message.id,
        role=message.role,
        content=message.content,
        context=message.context,
        created_at=message.created_at.isoformat()
    )


# === Admin Endpoints ===

class AdminConversationResponse(BaseModel):
    """Conversation with user info for admin"""
    id: int
    user_id: int
    user_email: str
    user_name: Optional[str] = None
    title: Optional[str] = None
    message_count: int
    created_at: str
    updated_at: str


class AdminConversationsListResponse(BaseModel):
    """Paginated list of conversations for admin"""
    conversations: List[AdminConversationResponse]
    total: int
    limit: int
    offset: int


class AdminConversationDetailResponse(BaseModel):
    """Full conversation with messages for admin"""
    id: int
    user_id: int
    user_email: str
    user_name: Optional[str] = None
    title: Optional[str] = None
    created_at: str
    updated_at: str
    messages: List[MessageResponse]


@router.get("/admin/all", response_model=AdminConversationsListResponse)
async def admin_list_conversations(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """List all conversations (platform admin only)."""
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Platform admin access required")

    service = ConversationService(db)
    convs, total = service.get_all_conversations(
        limit=limit,
        offset=offset,
        user_id=user_id
    )

    return AdminConversationsListResponse(
        conversations=[AdminConversationResponse(**c) for c in convs],
        total=total,
        limit=limit,
        offset=offset
    )


@router.get("/admin/{conversation_id}", response_model=AdminConversationDetailResponse)
async def admin_get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """Get full conversation with messages (platform admin only)."""
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Platform admin access required")

    service = ConversationService(db)
    conv = service.get_conversation_with_messages(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return AdminConversationDetailResponse(
        id=conv["id"],
        user_id=conv["user_id"],
        user_email=conv["user_email"],
        user_name=conv["user_name"],
        title=conv["title"],
        created_at=conv["created_at"],
        updated_at=conv["updated_at"],
        messages=[MessageResponse(**m) for m in conv["messages"]]
    )
