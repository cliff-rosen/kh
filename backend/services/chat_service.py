"""
Chat Service

Manages chat persistence (CRUD operations on chats and messages).
"""

import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Conversation, Message, User
from fastapi import Depends
from database import get_async_db

logger = logging.getLogger(__name__)


class ChatService:
    """Service for managing chats and messages.

    Supports both sync (Session) and async (AsyncSession) database access.
    """

    def __init__(self, db: Session | AsyncSession):
        self.db = db

    def create_chat(
        self,
        user_id: int,
        app: str = "kh",
        title: Optional[str] = None
    ) -> Conversation:
        """
        Create a new chat.

        Args:
            user_id: ID of the user
            app: App identifier ("kh", "tablizer", "trialscout")
            title: Optional title (can be set later)

        Returns:
            Created Conversation
        """
        chat = Conversation(
            user_id=user_id,
            app=app,
            title=title
        )
        self.db.add(chat)
        self.db.commit()
        self.db.refresh(chat)

        logger.debug(f"Created chat {chat.id} for user {user_id} in app {app}")
        return chat

    def get_chat(self, chat_id: int, user_id: int) -> Optional[Conversation]:
        """
        Get a chat by ID, ensuring it belongs to the user.

        Args:
            chat_id: ID of the chat
            user_id: ID of the requesting user

        Returns:
            Conversation if found and owned by user, None otherwise
        """
        return self.db.query(Conversation).filter(
            Conversation.id == chat_id,
            Conversation.user_id == user_id
        ).first()

    def get_user_chats(
        self,
        user_id: int,
        app: str = "kh",
        limit: int = 50,
        offset: int = 0
    ) -> List[Conversation]:
        """
        Get chats for a user in a specific app, ordered by most recent.

        Args:
            user_id: ID of the user
            app: App identifier ("kh", "tablizer", "trialscout")
            limit: Max chats to return
            offset: Pagination offset

        Returns:
            List of chats
        """
        return self.db.query(Conversation).filter(
            Conversation.user_id == user_id,
            Conversation.app == app
        ).order_by(
            desc(Conversation.updated_at)
        ).offset(offset).limit(limit).all()

    def update_chat_title(
        self,
        chat_id: int,
        user_id: int,
        title: str
    ) -> Optional[Conversation]:
        """
        Update chat title.

        Args:
            chat_id: ID of the chat
            user_id: ID of the requesting user
            title: New title

        Returns:
            Updated chat if found, None otherwise
        """
        chat = self.get_chat(chat_id, user_id)
        if chat:
            chat.title = title
            self.db.commit()
            self.db.refresh(chat)
        return chat

    def delete_chat(self, chat_id: int, user_id: int) -> bool:
        """
        Delete a chat and all its messages.

        Args:
            chat_id: ID of the chat
            user_id: ID of the requesting user

        Returns:
            True if deleted, False if not found
        """
        chat = self.get_chat(chat_id, user_id)
        if chat:
            self.db.delete(chat)
            self.db.commit()
            return True
        return False

    def add_message(
        self,
        chat_id: int,
        user_id: int,
        role: str,
        content: str,
        context: Optional[Dict[str, Any]] = None,
        extras: Optional[Dict[str, Any]] = None
    ) -> Optional[Message]:
        """
        Add a message to a chat.

        Args:
            chat_id: ID of the chat
            user_id: ID of the requesting user (for ownership check)
            role: Message role ('user', 'assistant', 'system')
            content: Message content
            context: Optional context (page, report_id, article_pmid, etc.)
            extras: Optional extended data (tool_history, custom_payload, diagnostics, etc.)

        Returns:
            Created Message if chat exists and owned by user
        """
        chat = self.get_chat(chat_id, user_id)
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
            # Use first 50 chars of first user message as title
            chat.title = content[:50] + ('...' if len(content) > 50 else '')

        self.db.commit()
        self.db.refresh(message)

        logger.debug(f"Added message to chat {chat_id}: role={role}")
        return message

    def get_messages(
        self,
        chat_id: int,
        user_id: int,
        limit: int = 100,
        before_id: Optional[int] = None
    ) -> List[Message]:
        """
        Get messages for a chat.

        Args:
            chat_id: ID of the chat
            user_id: ID of the requesting user
            limit: Max messages to return
            before_id: Get messages before this ID (for pagination)

        Returns:
            List of messages ordered by created_at
        """
        # Verify ownership
        chat = self.get_chat(chat_id, user_id)
        if not chat:
            return []

        query = self.db.query(Message).filter(
            Message.conversation_id == chat_id
        )

        if before_id:
            query = query.filter(Message.id < before_id)

        return query.order_by(Message.created_at).limit(limit).all()

    def get_all_chats(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[int] = None
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Get all chats (admin view) with user info.

        Args:
            limit: Max chats to return
            offset: Pagination offset
            user_id: Optional filter by user

        Returns:
            Tuple of (chats with user info, total count)
        """
        query = self.db.query(Conversation, User).join(
            User, User.user_id == Conversation.user_id
        )

        if user_id:
            query = query.filter(Conversation.user_id == user_id)

        total = query.count()

        results = query.order_by(
            desc(Conversation.updated_at)
        ).offset(offset).limit(limit).all()

        chats = []
        for conv, user in results:
            # Get message count
            msg_count = self.db.query(Message).filter(
                Message.conversation_id == conv.id
            ).count()

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

    def get_chat_with_messages(
        self,
        chat_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get full chat with all messages (admin view).

        Args:
            chat_id: ID of the chat

        Returns:
            Chat dict with messages, or None if not found
        """
        result = self.db.query(Conversation, User).join(
            User, User.user_id == Conversation.user_id
        ).filter(
            Conversation.id == chat_id
        ).first()

        if not result:
            return None

        conv, user = result

        messages = self.db.query(Message).filter(
            Message.conversation_id == chat_id
        ).order_by(Message.created_at).all()

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


    # =============================================================================
    # Async Methods (for use with AsyncSession)
    # =============================================================================

    async def async_get_user_chats(
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

    async def async_get_chat(
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

    async def async_get_messages(
        self,
        chat_id: int,
        user_id: int,
        limit: int = 100
    ) -> List[Message]:
        """Get messages for a chat (async)."""
        # Verify ownership first
        chat = await self.async_get_chat(chat_id, user_id)
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

    async def async_get_all_chats(
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

    async def async_get_chat_with_messages(
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


# Dependency injection provider for async chat service
async def get_async_chat_service(
    db: AsyncSession = Depends(get_async_db)
) -> ChatService:
    """Get a ChatService instance with async database session."""
    return ChatService(db)
