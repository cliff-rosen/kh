"""
Chat Service

This service handles all business logic for chat operations including:
- Message persistence and retrieval
- Sequence order management
- Model to schema conversions
- Chat-related database operations
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
from uuid import uuid4
from fastapi import Depends

from database import get_db
from models import ChatMessage as ChatMessageModel

from schemas.chat import ChatMessage
from exceptions import NotFoundError, ValidationError


class ChatService:
    """Service for managing chat operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def save_message(self, chat_id: str, user_id: int, message: ChatMessage) -> ChatMessage:
        """
        Save a chat message to the database
        
        Args:
            chat_id: ID of the chat
            user_id: ID of the user
            message: ChatMessage object to save
            
        Returns:
            Saved ChatMessage with populated database fields
        """
        try:
            # Get current sequence order
            existing_count = self.db.query(ChatMessageModel).filter(
                ChatMessageModel.chat_id == chat_id
            ).count()
            
            # Create database model
            chat_message_model = ChatMessageModel(
                id=str(uuid4()),
                chat_id=chat_id,
                user_id=user_id,
                sequence_order=existing_count + 1,
                role=message.role,
                content=message.content,
                message_metadata=message.message_metadata or {},
                created_at=datetime.utcnow()
            )
            
            self.db.add(chat_message_model)
            self.db.commit()
            self.db.refresh(chat_message_model)
            
            # Convert back to schema
            return self._model_to_schema(chat_message_model)
            
        except Exception as e:
            self.db.rollback()
            raise ValidationError(f"Failed to save message: {str(e)}")
    
    def get_chat_messages(self, chat_id: str, user_id: int) -> List[ChatMessage]:
        """
        Get all messages for a specific chat
        
        Args:
            chat_id: ID of the chat
            user_id: ID of the user
            
        Returns:
            List of ChatMessage objects ordered by sequence
        """
        try:
            message_models = self.db.query(ChatMessageModel).filter(
                ChatMessageModel.chat_id == chat_id,
                ChatMessageModel.user_id == user_id
            ).order_by(ChatMessageModel.sequence_order).all()
            
            return [self._model_to_schema(model) for model in message_models]
            
        except Exception as e:
            raise ValidationError(f"Failed to retrieve chat messages: {str(e)}")
    
    def get_recent_messages(self, chat_id: str, user_id: int, limit: int = 50) -> List[ChatMessage]:
        """
        Get recent messages for a chat with limit
        
        Args:
            chat_id: ID of the chat
            user_id: ID of the user
            limit: Maximum number of messages to return
            
        Returns:
            List of recent ChatMessage objects
        """
        try:
            message_models = self.db.query(ChatMessageModel).filter(
                ChatMessageModel.chat_id == chat_id,
                ChatMessageModel.user_id == user_id
            ).order_by(ChatMessageModel.sequence_order.desc()).limit(limit).all()
            
            # Reverse to get chronological order
            message_models.reverse()
            
            return [self._model_to_schema(model) for model in message_models]
            
        except Exception as e:
            raise ValidationError(f"Failed to retrieve recent messages: {str(e)}")
    
    def delete_message(self, message_id: str, user_id: int) -> bool:
        """
        Delete a specific message
        
        Args:
            message_id: ID of the message to delete
            user_id: ID of the user
            
        Returns:
            True if deleted successfully, False if not found
        """
        try:
            message_model = self.db.query(ChatMessageModel).filter(
                ChatMessageModel.id == message_id,
                ChatMessageModel.user_id == user_id
            ).first()
            
            if not message_model:
                return False
            
            self.db.delete(message_model)
            self.db.commit()
            return True
            
        except Exception as e:
            self.db.rollback()
            raise ValidationError(f"Failed to delete message: {str(e)}")
    
    def update_message_metadata(self, message_id: str, user_id: int, metadata: Dict[str, Any]) -> bool:
        """
        Update message metadata
        
        Args:
            message_id: ID of the message
            user_id: ID of the user
            metadata: New metadata to set
            
        Returns:
            True if updated successfully, False if not found
        """
        try:
            message_model = self.db.query(ChatMessageModel).filter(
                ChatMessageModel.id == message_id,
                ChatMessageModel.user_id == user_id
            ).first()
            
            if not message_model:
                return False
            
            message_model.message_metadata = metadata
            self.db.commit()
            return True
            
        except Exception as e:
            self.db.rollback()
            raise ValidationError(f"Failed to update message metadata: {str(e)}")
    
    def _model_to_schema(self, message_model: ChatMessageModel) -> ChatMessage:
        """Convert database model to ChatMessage schema"""
        return ChatMessage(
            id=message_model.id,
            chat_id=message_model.chat_id,
            role=message_model.role,
            content=message_model.content,
            message_metadata=message_model.message_metadata or {},
            created_at=message_model.created_at,
            updated_at=message_model.created_at  # ChatMessage model doesn't have updated_at
        )


# Dependency injection function
async def get_chat_service(db: Session = Depends(get_db)) -> ChatService:
    """Get ChatService instance for dependency injection"""
    return ChatService(db) 