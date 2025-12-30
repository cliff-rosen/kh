"""
Conversation Service

Manages chat conversations and message persistence.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc

from models import Conversation, Message, User

logger = logging.getLogger(__name__)


class ConversationService:
    """Service for managing chat conversations and messages"""

    def __init__(self, db: Session):
        self.db = db

    def create_conversation(
        self,
        user_id: int,
        title: Optional[str] = None
    ) -> Conversation:
        """
        Create a new conversation.

        Args:
            user_id: ID of the user
            title: Optional title (can be set later)

        Returns:
            Created Conversation
        """
        conversation = Conversation(
            user_id=user_id,
            title=title
        )
        self.db.add(conversation)
        self.db.commit()
        self.db.refresh(conversation)

        logger.debug(f"Created conversation {conversation.id} for user {user_id}")
        return conversation

    def get_conversation(self, conversation_id: int, user_id: int) -> Optional[Conversation]:
        """
        Get a conversation by ID, ensuring it belongs to the user.

        Args:
            conversation_id: ID of the conversation
            user_id: ID of the requesting user

        Returns:
            Conversation if found and owned by user, None otherwise
        """
        return self.db.query(Conversation).filter(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id
        ).first()

    def get_user_conversations(
        self,
        user_id: int,
        limit: int = 50,
        offset: int = 0
    ) -> List[Conversation]:
        """
        Get conversations for a user, ordered by most recent.

        Args:
            user_id: ID of the user
            limit: Max conversations to return
            offset: Pagination offset

        Returns:
            List of conversations
        """
        return self.db.query(Conversation).filter(
            Conversation.user_id == user_id
        ).order_by(
            desc(Conversation.updated_at)
        ).offset(offset).limit(limit).all()

    def update_conversation_title(
        self,
        conversation_id: int,
        user_id: int,
        title: str
    ) -> Optional[Conversation]:
        """
        Update conversation title.

        Args:
            conversation_id: ID of the conversation
            user_id: ID of the requesting user
            title: New title

        Returns:
            Updated conversation if found, None otherwise
        """
        conversation = self.get_conversation(conversation_id, user_id)
        if conversation:
            conversation.title = title
            self.db.commit()
            self.db.refresh(conversation)
        return conversation

    def delete_conversation(self, conversation_id: int, user_id: int) -> bool:
        """
        Delete a conversation and all its messages.

        Args:
            conversation_id: ID of the conversation
            user_id: ID of the requesting user

        Returns:
            True if deleted, False if not found
        """
        conversation = self.get_conversation(conversation_id, user_id)
        if conversation:
            self.db.delete(conversation)
            self.db.commit()
            return True
        return False

    def add_message(
        self,
        conversation_id: int,
        user_id: int,
        role: str,
        content: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Optional[Message]:
        """
        Add a message to a conversation.

        Args:
            conversation_id: ID of the conversation
            user_id: ID of the requesting user (for ownership check)
            role: Message role ('user', 'assistant', 'system')
            content: Message content
            context: Optional context (page, report_id, article_pmid, etc.)

        Returns:
            Created Message if conversation exists and owned by user
        """
        conversation = self.get_conversation(conversation_id, user_id)
        if not conversation:
            return None

        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            context=context
        )
        self.db.add(message)

        # Update conversation's updated_at
        conversation.updated_at = datetime.utcnow()

        # Auto-generate title from first user message if not set
        if not conversation.title and role == 'user':
            # Use first 50 chars of first user message as title
            conversation.title = content[:50] + ('...' if len(content) > 50 else '')

        self.db.commit()
        self.db.refresh(message)

        logger.debug(f"Added message to conversation {conversation_id}: role={role}")
        return message

    def get_messages(
        self,
        conversation_id: int,
        user_id: int,
        limit: int = 100,
        before_id: Optional[int] = None
    ) -> List[Message]:
        """
        Get messages for a conversation.

        Args:
            conversation_id: ID of the conversation
            user_id: ID of the requesting user
            limit: Max messages to return
            before_id: Get messages before this ID (for pagination)

        Returns:
            List of messages ordered by created_at
        """
        # Verify ownership
        conversation = self.get_conversation(conversation_id, user_id)
        if not conversation:
            return []

        query = self.db.query(Message).filter(
            Message.conversation_id == conversation_id
        )

        if before_id:
            query = query.filter(Message.id < before_id)

        return query.order_by(Message.created_at).limit(limit).all()

    def get_all_conversations(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[int] = None
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Get all conversations (admin view) with user info.

        Args:
            limit: Max conversations to return
            offset: Pagination offset
            user_id: Optional filter by user

        Returns:
            Tuple of (conversations with user info, total count)
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

        conversations = []
        for conv, user in results:
            # Get message count
            msg_count = self.db.query(Message).filter(
                Message.conversation_id == conv.id
            ).count()

            conversations.append({
                "id": conv.id,
                "user_id": conv.user_id,
                "user_email": user.email,
                "user_name": user.full_name,
                "title": conv.title,
                "message_count": msg_count,
                "created_at": conv.created_at.isoformat(),
                "updated_at": conv.updated_at.isoformat()
            })

        return conversations, total

    def get_conversation_with_messages(
        self,
        conversation_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get full conversation with all messages (admin view).

        Args:
            conversation_id: ID of the conversation

        Returns:
            Conversation dict with messages, or None if not found
        """
        result = self.db.query(Conversation, User).join(
            User, User.user_id == Conversation.user_id
        ).filter(
            Conversation.id == conversation_id
        ).first()

        if not result:
            return None

        conv, user = result

        messages = self.db.query(Message).filter(
            Message.conversation_id == conversation_id
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
                    "created_at": msg.created_at.isoformat()
                }
                for msg in messages
            ]
        }
