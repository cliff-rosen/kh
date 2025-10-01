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
    user_id: int = Field(description="User's unique identifier")
    email: str = Field(description="User's email address")

class TokenData(BaseModel):
    email: Optional[str] = Field(None, description="User's email from token")
    user_id: Optional[int] = Field(None, description="User's ID from token")
    username: Optional[str] = Field(None, description="User's username")
    role: Optional[UserRole] = Field(None, description="User's privilege level") 