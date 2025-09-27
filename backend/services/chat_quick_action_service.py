"""
Chat Quick Action Service

Handles all database operations for individual chat quick actions.
Manages both global (system) and user-specific quick actions.
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import datetime
import uuid

from models import ChatQuickAction


class ChatQuickActionService:
    """Service for managing individual chat quick actions"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_available_actions(self, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get all quick actions available to a user (global + their own).
        If user_id is None, only return global actions.
        """
        if user_id:
            # Get global actions and user's own actions
            actions = self.db.query(ChatQuickAction).filter(
                or_(
                    ChatQuickAction.scope == 'global',
                    and_(
                        ChatQuickAction.scope == 'user',
                        ChatQuickAction.user_id == user_id
                    )
                )
            ).order_by(
                ChatQuickAction.scope,  # Global first
                ChatQuickAction.position,
                ChatQuickAction.name
            ).all()
        else:
            # Only global actions
            actions = self.db.query(ChatQuickAction).filter(
                ChatQuickAction.scope == 'global'
            ).order_by(
                ChatQuickAction.position,
                ChatQuickAction.name
            ).all()
        
        return [action.to_dict() for action in actions]
    
    def get_action_by_id(self, action_id: str, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Get a specific action by ID.
        Verifies user has access (global or owns it).
        """
        action = self.db.query(ChatQuickAction).filter(
            ChatQuickAction.id == action_id
        ).first()
        
        if not action:
            return None
        
        # Check access
        if action.scope == 'global':
            return action.to_dict()
        elif action.scope == 'user' and action.user_id == user_id:
            return action.to_dict()
        else:
            return None  # No access
    
    def create_action(
        self, 
        user_id: int,
        name: str,
        prompt: str,
        description: Optional[str] = None,
        position: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create a new user action"""
        
        # If no position specified, put at end
        if position is None:
            max_position = self.db.query(ChatQuickAction).filter(
                ChatQuickAction.scope == 'user',
                ChatQuickAction.user_id == user_id
            ).count()
            position = max_position
        
        action = ChatQuickAction(
            name=name,
            prompt=prompt,
            description=description,
            scope='user',
            user_id=user_id,
            position=position
        )
        self.db.add(action)
        self.db.commit()
        self.db.refresh(action)
        
        return action.to_dict()
    
    def update_action(
        self,
        action_id: str,
        user_id: int,
        name: Optional[str] = None,
        prompt: Optional[str] = None,
        description: Optional[str] = None,
        position: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """Update an action (user's own or system action - any user can edit system actions)"""
        
        # Get action and verify access (user owns it OR it's a global action)
        action = self.db.query(ChatQuickAction).filter(
            and_(
                ChatQuickAction.id == action_id,
                or_(
                    # User owns this action
                    and_(
                        ChatQuickAction.scope == 'user',
                        ChatQuickAction.user_id == user_id
                    ),
                    # Or it's a global action (any user can edit)
                    ChatQuickAction.scope == 'global'
                )
            )
        ).first()
        
        if not action:
            return None
        
        # Update fields if provided
        if name is not None:
            action.name = name
        if prompt is not None:
            action.prompt = prompt
        if description is not None:
            action.description = description
        if position is not None:
            action.position = position
        
        action.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(action)
        
        return action.to_dict()
    
    def delete_action(self, action_id: str, user_id: int) -> bool:
        """Delete a user's action (system actions cannot be deleted)"""
        
        # Verify ownership
        action = self.db.query(ChatQuickAction).filter(
            and_(
                ChatQuickAction.id == action_id,
                ChatQuickAction.scope == 'user',
                ChatQuickAction.user_id == user_id
            )
        ).first()
        
        if not action:
            return False
        
        self.db.delete(action)
        self.db.commit()
        return True
    
    def duplicate_action(
        self,
        action_id: str,
        user_id: int,
        new_name: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Duplicate an action (global or user's own) as a new user action.
        Useful for customizing system actions.
        """
        
        # Get source action
        source_action = self.get_action_by_id(action_id, user_id)
        if not source_action:
            return None
        
        return self.create_action(
            user_id=user_id,
            name=new_name or f"Copy of {source_action['name']}",
            prompt=source_action['prompt'],
            description=source_action.get('description')
        )
    
    def create_global_action(
        self,
        name: str,
        prompt: str,
        description: Optional[str] = None,
        position: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a global (system) action.
        Should only be used for seeding or admin operations.
        """
        
        # If no position specified, put at end of global actions
        if position is None:
            max_position = self.db.query(ChatQuickAction).filter(
                ChatQuickAction.scope == 'global'
            ).count()
            position = max_position
        
        action = ChatQuickAction(
            name=name,
            prompt=prompt,
            description=description,
            scope='global',
            user_id=None,
            position=position
        )
        self.db.add(action)
        self.db.commit()
        self.db.refresh(action)
        
        return action.to_dict()


def get_chat_quick_action_service(db: Session) -> ChatQuickActionService:
    """Dependency injection for ChatQuickActionService"""
    return ChatQuickActionService(db)