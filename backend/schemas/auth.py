from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any
from datetime import datetime
from models import UserRole

class UserBase(BaseModel):
    email: EmailStr = Field(description="User's email address")

class UserCreate(UserBase):
    password: str = Field(
        min_length=5,
        description="User's password",
        example="securepassword123"
    )

class UserResponse(UserBase):
    user_id: int = Field(description="Unique identifier for the user")
    registration_date: datetime = Field(description="When the user registered")
    role: UserRole = Field(description="User's privilege level")

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str = Field(description="JWT access token")
    token_type: str = Field(default="bearer", description="Type of token")
    username: str = Field(description="User's username")
    role: UserRole = Field(description="User's privilege level")
    
    # Session information included in login response
    session_id: str = Field(description="User's active session ID")
    session_name: Optional[str] = Field(None, description="User's session name")
    chat_id: str = Field(description="Associated chat conversation ID")
    mission_id: Optional[str] = Field(None, description="Associated mission ID if exists")
    session_metadata: Dict[str, Any] = Field(default_factory=dict, description="Session metadata")

class TokenData(BaseModel):
    email: Optional[str] = Field(None, description="User's email from token")
    user_id: Optional[int] = Field(None, description="User's ID from token")
    username: Optional[str] = Field(None, description="User's username")
    role: Optional[UserRole] = Field(None, description="User's privilege level") 