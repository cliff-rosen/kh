"""
User Session Schema Definitions

This module contains all Pydantic models for managing user sessions
for persistence and API operations.
"""

from typing import Optional, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from .workflow import Mission


class UserSessionStatus(str, Enum):
    """Status of a user session"""
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    ARCHIVED = "archived"


# Core session persistence model
class UserSession(BaseModel):
    """User session representing a workspace/conversation container"""
    id: str = Field(description="Unique identifier for the session")
    user_id: int = Field(description="ID of the user who owns this session")
    name: str = Field(description="Name/title of the session")
    status: UserSessionStatus = Field(default=UserSessionStatus.ACTIVE, description="Current status of the session")
    
    # Relationships
    chat_id: str = Field(description="ID of the associated chat")
    mission_id: Optional[str] = Field(default=None, description="ID of the associated mission if created")
    
    # Metadata
    session_metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional session metadata")
    created_at: datetime = Field(description="When the session was created")
    updated_at: datetime = Field(description="When the session was last updated")
    last_activity_at: datetime = Field(description="When the session had its last activity")
    
    # Relationships (populated by services)
    chat: Optional['Chat'] = Field(default=None, description="Associated chat conversation")
    mission: Optional[Mission] = Field(default=None, description="Associated mission if created")


# Service Response models (used by service layer)
class CreateUserSessionResponse(BaseModel):
    """Response when creating a new user session - used by service layer"""
    user_session: UserSession = Field(description="Created user session")
    chat: 'Chat' = Field(description="Associated chat created with the session")

# Import Chat for forward references
from .chat import Chat 