"""
Chat Service

Manages chat persistence (CRUD operations on chats and messages).
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc

from models import Conversation, Message, User

logger = logging.getLogger(__name__)


class ChatService:
    """Service for managing chats and messages"""

    def __init__(self, db: Session):
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
