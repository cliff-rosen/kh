"""
Schemas package for Fractal Bot API
"""

from .auth import (
    UserBase,
    UserCreate,
    UserResponse,
    Token,
    TokenData
)

from .chat import (
    MessageRole,
    AssetReference,
    Chat,
    ChatMessage,
    CreateChatMessageRequest,
    CreateChatMessageResponse
 )

from .user_session import (
    UserSession,
    UserSessionStatus,
    CreateUserSessionResponse
)


__all__ = [
    # Auth schemas
    'UserBase',
    'UserCreate',
    'UserResponse',
    'Token',
    'TokenData',
    
    # Chat schemas
    'MessageRole',
    'AssetReference',
    'Chat',
    'ChatMessage',
    'CreateChatMessageRequest',
    'CreateChatMessageResponse',

    # User Session schemas
    'UserSession',
    'UserSessionStatus',
    'CreateUserSessionResponse'
]  