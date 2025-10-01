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

# User session schemas removed - Knowledge Horizon uses simplified auth


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

# User Session schemas removed for Knowledge Horizon
]  