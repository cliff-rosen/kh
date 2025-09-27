"""
User Session Service

This service handles all business logic for user sessions including:
- Session creation and management
- Session lifecycle (active, completed, abandoned, archived)
- Integration with Chat and Mission entities
- Session persistence and recovery
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from uuid import uuid4
import re
from fastapi import Depends

from database import get_db
from models import UserSession, User, Chat, Mission, ChatMessage, UserSessionStatus
from schemas.user_session import UserSession as UserSessionSchema, CreateUserSessionResponse
from schemas.chat import Chat as ChatSchema
from schemas.workflow import Mission as MissionSchema
from exceptions import NotFoundError, ValidationError


class UserSessionService:
    """Service for managing user sessions"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def _generate_next_session_name(self, user_id: int) -> str:
        """Generate the next session name like 'Session 1', 'Session 2', etc."""
        # Get all existing session names for this user
        session_names = self.db.query(UserSession.name).filter(
            UserSession.user_id == user_id
        ).all()
        
        # Extract numbers from session names that match "Session N" pattern
        session_numbers = []
        for (name,) in session_names:
            if name:
                match = re.match(r'^Session (\d+)$', name)
                if match:
                    session_numbers.append(int(match.group(1)))
        
        # Find the next available number
        next_number = max(session_numbers) + 1 if session_numbers else 1
        
        return f"Session {next_number}"
    
    async def link_mission_to_session(self, user_id: int, mission_id: str, commit: bool = True) -> bool:
        """
        Link a mission to the user's active session
        
        Args:
            user_id: The user ID
            mission_id: The mission ID to link to the session
            commit: Whether to commit the transaction (default: True)
            
        Returns:
            bool: True if successful, False if no active session found
            
        Raises:
            ValidationError: If the operation fails
        """
        try:
            # Get the user's active session
            user_session = self.db.query(UserSession).filter(
                and_(
                    UserSession.user_id == user_id,
                    UserSession.status == UserSessionStatus.ACTIVE
                )
            ).order_by(desc(UserSession.last_activity_at)).first()
            
            if not user_session:
                raise ValidationError("No active session found to link mission to")
            
            # Update the session with the mission ID
            user_session.mission_id = mission_id
            user_session.updated_at = datetime.utcnow()
            user_session.last_activity_at = datetime.utcnow()
            
            if commit:
                self.db.commit()
            
            return True
            
        except Exception as e:
            if commit:
                self.db.rollback()
            raise ValidationError(f"Failed to link mission to session: {str(e)}")

    def create_user_session(self, user_id: int, request: any) -> CreateUserSessionResponse:
        """Create a new user session with associated chat"""
        try:
            # Mark all existing active sessions as completed
            self.db.query(UserSession).filter(
                and_(
                    UserSession.user_id == user_id,
                    UserSession.status == UserSessionStatus.ACTIVE
                )
            ).update({
                UserSession.status: UserSessionStatus.COMPLETED,
                UserSession.updated_at: datetime.utcnow()
            })
            
            # Generate session name if not provided
            session_name = request.name if request.name else self._generate_next_session_name(user_id)
            
            # Create chat first
            chat = Chat(
                id=str(uuid4()),
                user_id=user_id,
                title=session_name,
                context_data={}
            )
            self.db.add(chat)
            self.db.flush()  # Get the chat ID
            
            # Create user session
            user_session = UserSession(
                id=str(uuid4()),
                user_id=user_id,
                name=session_name,
                status=UserSessionStatus.ACTIVE,
                chat_id=chat.id,
                session_metadata=request.session_metadata or {},
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                last_activity_at=datetime.utcnow()
            )
            
            self.db.add(user_session)
            self.db.commit()
            
            # Convert to schemas
            chat_schema = ChatSchema(
                id=chat.id,
                user_session_id=user_session.id,
                title=chat.title,
                chat_metadata=chat.context_data,
                created_at=chat.created_at,
                updated_at=chat.updated_at,
                messages=[]
            )
            
            user_session_schema = self._convert_to_schema(user_session)
            user_session_schema.chat = chat_schema
            
            return CreateUserSessionResponse(
                user_session=user_session_schema,
                chat=chat_schema
            )
            
        except Exception as e:
            self.db.rollback()
            raise ValidationError(f"Failed to create user session: {str(e)}")
    
    def get_active_session(self, user_id: int) -> Optional[UserSession]:
        """Get the user's current active session - lightweight, no relationships"""
        user_session = self.db.query(UserSession).filter(
            and_(
                UserSession.user_id == user_id,
                UserSession.status == UserSessionStatus.ACTIVE
            )
        ).order_by(desc(UserSession.last_activity_at)).first()
        
        if not user_session:
            return None
        
        # Update last activity
        user_session.last_activity_at = datetime.utcnow()
        self.db.commit()
        
        return user_session  # Return model directly, no schema conversion
    
    def update_user_session_lightweight(self, user_id: int, session_id: str, 
                                      request: any) -> Optional[UserSession]:
        """Update an existing user session - lightweight version that returns model directly"""
        user_session = self.db.query(UserSession).filter(
            and_(
                UserSession.id == session_id,
                UserSession.user_id == user_id
            )
        ).first()
        
        if not user_session:
            return None
        
        # Update fields
        if request.name is not None:
            user_session.name = request.name
        if request.status is not None:
            user_session.status = request.status
        if request.mission_id is not None:
            user_session.mission_id = request.mission_id
        if request.session_metadata is not None:
            user_session.session_metadata = request.session_metadata
        
        user_session.updated_at = datetime.utcnow()
        user_session.last_activity_at = datetime.utcnow()
        
        self.db.commit()
        
        return user_session  # Return model directly
    
    def update_session_activity(self, user_id: int, session_id: str):
        """Update session activity timestamp"""
        user_session = self.db.query(UserSession).filter(
            and_(
                UserSession.id == session_id,
                UserSession.user_id == user_id
            )
        ).first()
        
        if user_session:
            user_session.last_activity_at = datetime.utcnow()
            self.db.commit()
    
    def _convert_to_schema(self, user_session: UserSession) -> UserSession:
        """Convert SQLAlchemy model to Pydantic schema"""
        from schemas.user_session import UserSession as UserSessionSchema
        
        return UserSessionSchema(
            id=user_session.id,
            user_id=user_session.user_id,
            name=user_session.name,
            status=user_session.status,
            chat_id=user_session.chat_id,
            mission_id=user_session.mission_id,
            session_metadata=user_session.session_metadata or {},
            created_at=user_session.created_at,
            updated_at=user_session.updated_at,
            last_activity_at=user_session.last_activity_at
        )


# Dependency function for FastAPI dependency injection
async def get_user_session_service(db: Session = Depends(get_db)) -> UserSessionService:
    """FastAPI dependency that provides UserSessionService instance"""
    return UserSessionService(db)