"""
Schemas package for Knowledge Horizon API.

Core types are in schemas/user.py.
Request schemas are defined in the routers where they're used.
"""

# User schemas - core types
from .user import (
    UserRole,
    User,
    UserSummary,
    Token,
    TokenData,
    UserList,
    OrgMember,
)

# Chat schemas (for LLM interactions)
from .chat import (
    MessageRole,
    AssetReference,
    ChatMessage,
)

# Legacy alias - UserResponse maps to User
UserResponse = User


__all__ = [
    # User schemas
    'UserRole',
    'User',
    'UserSummary',
    'UserResponse',  # Legacy alias
    'Token',
    'TokenData',
    'UserList',
    'OrgMember',

    # Chat schemas
    'MessageRole',
    'AssetReference',
    'ChatMessage',
]
