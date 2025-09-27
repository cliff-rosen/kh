"""
Schemas package for Fractal Bot API
"""

from .asset import Asset
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

from .asset import (
    Asset,
)

from .newsletter import (
    Newsletter,
    NewsletterExtractionRange,
    NewsletterSummary,
    TimePeriodType
)

from .workflow import (
    Mission,
    MissionStatus,
    HopStatus,
    ToolExecutionStatus,
    Hop,
    ToolStep
)

# Tool handler schema (kept in schemas package to avoid circular deps)
from .tool_handler_schema import (
    ToolHandlerInput,
    ToolHandlerResult,
    ToolExecutionHandler,
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
    'CreateUserSessionResponse',

    # Newsletter schemas
    'Newsletter',
    'NewsletterExtractionRange',
    'NewsletterSummary',
    'TimePeriodType',

    # Asset schemas
    'Asset',

    # Workflow schemas
    'Mission',
    'MissionStatus',
    'HopStatus',
    'ToolExecutionStatus',
    'Hop',
    'ToolStep',

    # Tool handler schemas
    'ToolHandlerInput',
    'ToolHandlerResult',
    'ToolExecutionHandler',
]  