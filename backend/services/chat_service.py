"""
Chat Service

Manages chat persistence (CRUD operations on chats and messages).
"""

import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy import desc, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Conversation, Message, User
from fastapi import Depends
from database import get_async_db

logger = logging.getLogger(__name__)


class ChatService:
    """Service for managing chats and messages."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user_chats(
        self,
        user_id: int,
        app: str = "kh",
        limit: int = 50,
        offset: int = 0
    ) -> List[Conversation]:
        """Get chats for a user in a specific app (async)."""
        stmt = (
            select(Conversation)
            .where(Conversation.user_id == user_id, Conversation.app == app)
            .order_by(desc(Conversation.updated_at))
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_chat(
        self,
        chat_id: int,
        user_id: int
    ) -> Optional[Conversation]:
        """Get a chat by ID, ensuring it belongs to the user (async)."""
        stmt = select(Conversation).where(
            Conversation.id == chat_id,
            Conversation.user_id == user_id
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_messages(
        self,
        chat_id: int,
        user_id: int,
        limit: int = 100
    ) -> List[Message]:
        """Get messages for a chat (async)."""
        # Verify ownership first
        chat = await self.get_chat(chat_id, user_id)
        if not chat:
            return []

        stmt = (
            select(Message)
            .where(Message.conversation_id == chat_id)
            .order_by(Message.created_at)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_all_chats(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[int] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get all chats with user info (admin view, async)."""
        # Build base query
        base_where = []
        if user_id:
            base_where.append(Conversation.user_id == user_id)

        # Get total count
        count_stmt = select(func.count(Conversation.id)).select_from(Conversation)
        if base_where:
            count_stmt = count_stmt.where(*base_where)
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get chats with user info
        stmt = (
            select(Conversation, User)
            .join(User, User.user_id == Conversation.user_id)
            .order_by(desc(Conversation.updated_at))
            .offset(offset)
            .limit(limit)
        )
        if base_where:
            stmt = stmt.where(*base_where)

        result = await self.db.execute(stmt)
        rows = result.all()

        chats = []
        for conv, user in rows:
            # Get message count
            msg_count_stmt = select(func.count(Message.id)).where(
                Message.conversation_id == conv.id
            )
            msg_result = await self.db.execute(msg_count_stmt)
            msg_count = msg_result.scalar() or 0

            chats.append({
                "id": conv.id,
                "user_id": conv.user_id,
                "user_email": user.email,
                "user_name": user.full_name,
                "title": conv.title,
                "message_count": msg_count,
                "created_at": conv.created_at.isoformat(),
                "updated_at": conv.updated_at.isoformat()
            })

        return chats, total

    async def get_chat_with_messages(
        self,
        chat_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get full chat with all messages (admin view, async)."""
        stmt = (
            select(Conversation, User)
            .join(User, User.user_id == Conversation.user_id)
            .where(Conversation.id == chat_id)
        )
        result = await self.db.execute(stmt)
        row = result.first()

        if not row:
            return None

        conv, user = row

        # Get messages
        msg_stmt = (
            select(Message)
            .where(Message.conversation_id == chat_id)
            .order_by(Message.created_at)
        )
        msg_result = await self.db.execute(msg_stmt)
        messages = msg_result.scalars().all()

        return {
            "id": conv.id,
            "user_id": conv.user_id,
            "user_email": user.email,
            "user_name": user.full_name,
            "title": conv.title,
            "created_at": conv.created_at.isoformat(),
            "updated_at": conv.updated_at.isoformat(),
            "messages": [
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "context": msg.context,
                    "extras": msg.extras,
                    "created_at": msg.created_at.isoformat()
                }
                for msg in messages
            ]
        }

    async def create_chat(
        self,
        user_id: int,
        app: str = "kh",
        title: Optional[str] = None
    ) -> Conversation:
        """Create a new chat (async)."""
        chat = Conversation(
            user_id=user_id,
            app=app,
            title=title
        )
        self.db.add(chat)
        await self.db.commit()
        await self.db.refresh(chat)
        logger.debug(f"Created chat {chat.id} for user {user_id} in app {app}")
        return chat

    async def add_message(
        self,
        chat_id: int,
        user_id: int,
        role: str,
        content: str,
        context: Optional[Dict[str, Any]] = None,
        extras: Optional[Dict[str, Any]] = None
    ) -> Optional[Message]:
        """Add a message to a chat (async)."""
        chat = await self.get_chat(chat_id, user_id)
        if not chat:
            return None

        message = Message(
            conversation_id=chat_id,
            role=role,
            content=content,
            context=context,
            extras=extras
        )
        self.db.add(message)

        # Update chat's updated_at
        chat.updated_at = datetime.utcnow()

        # Auto-generate title from first user message if not set
        if not chat.title and role == 'user':
            chat.title = content[:50] + ('...' if len(content) > 50 else '')

        await self.db.commit()
        await self.db.refresh(message)

        logger.debug(f"Added message to chat {chat_id}: role={role}")
        return message

    async def delete_chat(self, chat_id: int, user_id: int) -> bool:
        """Delete a chat and all its messages (async)."""
        chat = await self.get_chat(chat_id, user_id)
        if chat:
            await self.db.delete(chat)
            await self.db.commit()
            return True
        return False

    async def update_chat_title(
        self,
        chat_id: int,
        user_id: int,
        title: str
    ) -> Optional[Conversation]:
        """Update chat title (async)."""
        chat = await self.get_chat(chat_id, user_id)
        if chat:
            chat.title = title
            await self.db.commit()
            await self.db.refresh(chat)
        return chat


# Dependency injection provider for async chat service
async def get_chat_service(
    db: AsyncSession = Depends(get_async_db)
) -> ChatService:
    """Get a ChatService instance with async database session."""
    return ChatService(db)
