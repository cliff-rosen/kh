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
    ChatMessage
)

# User session schemas removed - Knowledge Horizon uses simplified auth
# Chat persistence model removed - not used (only ChatMessage for LLM interactions)


__all__ = [
    # Auth schemas
    'UserBase',
    'UserCreate',
    'UserResponse',
    'Token',
    'TokenData',

    # Core chat schemas (for LLM interactions)
    'MessageRole',
    'AssetReference',
    'ChatMessage',
]  