from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Enum, TIMESTAMP, JSON, LargeBinary, Boolean, UniqueConstraint, Index, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, foreign, remote, validates
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.sql import text
from sqlalchemy.sql.schema import CheckConstraint, ForeignKeyConstraint
from uuid import uuid4
import json
from enum import Enum as PyEnum

Base = declarative_base()

# Define enums directly in models to break circular dependency
class MissionStatus(str, PyEnum):
    """Status of a mission"""
    AWAITING_APPROVAL = "awaiting_approval"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class HopStatus(str, PyEnum):
    """Status of a hop"""
    HOP_PLAN_STARTED = "hop_plan_started"
    HOP_PLAN_PROPOSED = "hop_plan_proposed"
    HOP_PLAN_READY = "hop_plan_ready"
    HOP_IMPL_STARTED = "hop_impl_started"
    HOP_IMPL_PROPOSED = "hop_impl_proposed"
    HOP_IMPL_READY = "hop_impl_ready"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class ToolExecutionStatus(str, PyEnum):
    """Status of a tool execution"""
    PROPOSED = "proposed"
    READY_TO_CONFIGURE = "ready_to_configure"
    READY_TO_EXECUTE = "ready_to_execute"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class AssetStatus(str, PyEnum):
    """Status of an asset"""
    PROPOSED = "proposed"       # Asset created in mission/hop proposal, awaiting user approval
    PENDING = "pending"         # User approved, asset ready to be worked on
    IN_PROGRESS = "in_progress" # Tool is currently processing this asset
    READY = "ready"            # Asset processing completed successfully
    ERROR = "error"            # Asset processing failed
    EXPIRED = "expired"        # Asset data is stale/invalid

class AssetRole(str, PyEnum):
    """Role of an asset in workflow"""
    INPUT = "input"
    OUTPUT = "output"
    INTERMEDIATE = "intermediate"

class AssetScopeType(str, PyEnum):
    """Scope type for asset"""
    MISSION = "mission"
    HOP = "hop"

class MessageRole(str, PyEnum):
    """Role of a message in chat"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"
    STATUS = "status"

class UserSessionStatus(str, PyEnum):
    """Status of a user session"""
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    ARCHIVED = "archived"

class UserRole(str, PyEnum):
    """User privilege levels"""
    ADMIN = "admin"
    USER = "user"
    TESTER = "tester"

Base = declarative_base()

# Constants
ALL_TOPICS = -1  # Special value for chat threads to indicate "all topics" view

class User(Base):
    __tablename__ = "users"
    
    user_id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True)
    password = Column(String(255))
    is_active = Column(Boolean, default=True)
    role = Column(Enum(UserRole, name='userrole'), default=UserRole.USER, nullable=False)
    login_token = Column(String(255), nullable=True, index=True)  # One-time login token
    login_token_expires = Column(DateTime, nullable=True)  # Token expiration time
    registration_date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    # google_credentials = relationship("GoogleOAuth2Credentials", back_populates="user", uselist=False)
    assets = relationship("Asset", back_populates="user", cascade="all, delete-orphan")
    resource_credentials = relationship("ResourceCredentials", back_populates="user", cascade="all, delete-orphan")
    missions = relationship("Mission", back_populates="user", cascade="all, delete-orphan")
    user_sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    chats = relationship("Chat", back_populates="user", cascade="all, delete-orphan")

    hops = relationship("Hop", cascade="all, delete-orphan")
    article_groups = relationship("ArticleGroup", back_populates="user", cascade="all, delete-orphan")
    company_profile = relationship("UserCompanyProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")

class Asset(Base):
    __tablename__ = "assets"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    schema_definition = Column(JSON, nullable=False)  # Full schema definition from SchemaEntity
    subtype = Column(String(255), nullable=True)
    
    # Scope information - unified approach for mission and hop level assets
    scope_type = Column(Enum(AssetScopeType), nullable=False)
    scope_id = Column(String(255), nullable=False)   # mission_id or hop_id
    
    # Asset lifecycle
    status = Column(Enum(AssetStatus), nullable=False, default=AssetStatus.PROPOSED)
    role = Column(Enum(AssetRole), nullable=False)  # Role of asset in workflow: input, output, intermediate
    
    # Content strategy
    content = Column(JSON, nullable=True)            # Full content
    content_summary = Column(Text, nullable=True)    # For value_representation
    asset_metadata = Column(JSON, nullable=False, default=dict)
    db_entity_metadata = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="assets")
    
    # Indexes
    __table_args__ = (
        Index("idx_asset_scope", "scope_type", "scope_id"),
        Index("idx_asset_user_scope", "user_id", "scope_type", "scope_id"),
        Index("idx_asset_user_status", "user_id", "status"),
        Index("idx_asset_user_role", "user_id", "role"),
    )

class MissionAsset(Base):
    """Mission to Asset mapping table"""
    __tablename__ = "mission_assets"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    mission_id = Column(String(36), ForeignKey("missions.id"), nullable=False)
    asset_id = Column(String(36), ForeignKey("assets.id"), nullable=False)
    role = Column(Enum(AssetRole), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    mission = relationship("Mission", back_populates="mission_assets")
    asset = relationship("Asset")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint("mission_id", "asset_id", name="unique_mission_asset"),
        Index("idx_mission_asset_mission", "mission_id"),
        Index("idx_mission_asset_asset", "asset_id"),
        Index("idx_mission_asset_role", "mission_id", "role"),
    )

class HopAsset(Base):
    """Hop to Asset mapping table"""
    __tablename__ = "hop_assets"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hop_id = Column(String(36), ForeignKey("hops.id"), nullable=False)
    asset_id = Column(String(36), ForeignKey("assets.id"), nullable=False)
    role = Column(Enum(AssetRole), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    hop = relationship("Hop", back_populates="hop_assets")
    asset = relationship("Asset")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint("hop_id", "asset_id", name="unique_hop_asset"),
        Index("idx_hop_asset_hop", "hop_id"),
        Index("idx_hop_asset_asset", "asset_id"),
        Index("idx_hop_asset_role", "hop_id", "role"),
    )

class ResourceCredentials(Base):
    __tablename__ = "resource_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"))
    resource_id = Column(String(50))  # e.g. "gmail", "dropbox", etc.
    credentials = Column(JSON)  # Store all credentials as JSON
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    user = relationship("User", back_populates="resource_credentials")

    # Add unique constraint for user_id and resource_id combination
    __table_args__ = (
        UniqueConstraint('user_id', 'resource_id', name='uix_user_resource'),
    )

class Mission(Base):
    __tablename__ = "missions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    goal = Column(Text, nullable=True)
    status = Column(Enum(MissionStatus), nullable=False, default=MissionStatus.AWAITING_APPROVAL)
    
    # Current hop tracking
    current_hop_id = Column(String(36), ForeignKey("hops.id"), nullable=True)
    
    # JSON fields for complex data
    success_criteria = Column(JSON, nullable=True)  # List of strings
    mission_metadata = Column(JSON, nullable=True)  # Additional metadata
    
    # Assets are queried by scope: scope_type='mission' AND scope_id=mission.id
    # NO input_asset_ids or output_asset_ids fields needed
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="missions")
    session = relationship("UserSession", back_populates="mission", uselist=False)
    current_hop = relationship("Hop", foreign_keys=[current_hop_id], post_update=True)
    hops = relationship("Hop", back_populates="mission", cascade="all, delete-orphan", order_by="Hop.sequence_order", foreign_keys="Hop.mission_id")
    mission_assets = relationship("MissionAsset", back_populates="mission", cascade="all, delete-orphan")

class Hop(Base):
    __tablename__ = "hops"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    mission_id = Column(String(36), ForeignKey("missions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    sequence_order = Column(Integer, nullable=False)
    
    # Basic hop information
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    goal = Column(Text, nullable=True)
    success_criteria = Column(JSON, nullable=True)  # List of strings
    rationale = Column(Text, nullable=True)
    status = Column(Enum(HopStatus), nullable=False, default=HopStatus.HOP_PLAN_STARTED)
    
    # metadata
    is_final = Column(Boolean, nullable=False, default=False)
    is_resolved = Column(Boolean, nullable=False, default=False)
    error_message = Column(Text, nullable=True)
    hop_metadata = Column(JSON, nullable=True)  # Additional metadata
    
    # Assets are queried by scope: scope_type='hop' AND scope_id=hop.id
    # NO input_asset_ids or output_asset_ids fields needed
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    mission = relationship("Mission", foreign_keys=[mission_id], back_populates="hops")
    user = relationship("User", back_populates="hops")
    tool_steps = relationship("ToolStep", back_populates="hop", cascade="all, delete-orphan", order_by="ToolStep.sequence_order")
    hop_assets = relationship("HopAsset", back_populates="hop", cascade="all, delete-orphan")

class ToolStep(Base):
    __tablename__ = "tool_steps"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hop_id = Column(String(36), ForeignKey("hops.id"), nullable=False)
    tool_id = Column(String(255), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    sequence_order = Column(Integer, nullable=False)

    # Basic tool step information
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ToolExecutionStatus), nullable=False, default=ToolExecutionStatus.PROPOSED)
    
    parameter_mapping = Column(JSON, nullable=True)  # Dict of parameter mappings
    result_mapping = Column(JSON, nullable=True)  # Dict of result mappings
    resource_configs = Column(JSON, nullable=True)  # Resource configurations

    validation_errors = Column(JSON, nullable=True)  # List of validation errors
    execution_result = Column(JSON, nullable=True)  # Tool execution results
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    hop = relationship("Hop", back_populates="tool_steps")
    user = relationship("User")

class ToolExecution(Base):
    """Separate execution records from tool step definitions"""
    __tablename__ = "tool_executions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tool_step_id = Column(String(36), ForeignKey("tool_steps.id"), nullable=True)  # Optional link to tool step
    tool_id = Column(String(255), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    
    # Execution context
    hop_id = Column(String(36), ForeignKey("hops.id"), nullable=True)  # Optional hop context
    mission_id = Column(String(36), ForeignKey("missions.id"), nullable=True)  # Optional mission context
    
    # Execution details
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ToolExecutionStatus), nullable=False, default=ToolExecutionStatus.PROPOSED)
    
    # Input/Output data
    input_parameters = Column(JSON, nullable=True)  # Tool input parameters
    input_assets = Column(JSON, nullable=True)  # Asset references used as input
    output_results = Column(JSON, nullable=True)  # Tool execution results
    output_assets = Column(JSON, nullable=True)  # Asset references created as output
    
    # Execution metadata
    execution_config = Column(JSON, nullable=True)  # Tool-specific execution configuration
    error_details = Column(JSON, nullable=True)  # Detailed error information
    error_message = Column(Text, nullable=True)  # Human-readable error message
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    tool_step = relationship("ToolStep", foreign_keys=[tool_step_id])
    hop = relationship("Hop", foreign_keys=[hop_id])
    mission = relationship("Mission", foreign_keys=[mission_id])
    user = relationship("User")

class Chat(Base):
    __tablename__ = "chats"
    
    # Core fields
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    title = Column(String(255), nullable=True)  # Optional title for the conversation
    
    # Chat context
    context_data = Column(JSON, nullable=True)  # Dict[str, Any] - payload history, etc.
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="chats")
    session = relationship("UserSession", back_populates="chat", uselist=False)
    messages = relationship("ChatMessage", back_populates="chat", cascade="all, delete-orphan", 
                          order_by="ChatMessage.sequence_order")
    
    # Indexes
    __table_args__ = (
        Index('idx_chats_user_id', 'user_id'),
        Index('idx_chats_created_at', 'created_at'),
    )

class UserSession(Base):
    __tablename__ = "user_sessions"
    
    # Core fields
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    name = Column(String(255), nullable=True)  # Optional user-provided name
    status = Column(Enum(UserSessionStatus), nullable=False, default=UserSessionStatus.ACTIVE)
    
    # Relationships
    chat_id = Column(String(36), ForeignKey("chats.id"), nullable=False)
    mission_id = Column(String(36), ForeignKey("missions.id"), nullable=True)
    
    # Session metadata
    session_metadata = Column(JSON, nullable=True)  # Dict[str, Any]
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_activity_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="user_sessions")
    chat = relationship("Chat", back_populates="session")
    mission = relationship("Mission", back_populates="session")
    
    # Indexes
    __table_args__ = (
        Index('idx_user_sessions_user_id', 'user_id'),
        Index('idx_user_sessions_status', 'status'),
        Index('idx_user_sessions_last_activity', 'last_activity_at'),
    )

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    # Core fields
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    chat_id = Column(String(36), ForeignKey("chats.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    sequence_order = Column(Integer, nullable=False)
    
    # Message content
    role = Column(Enum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    
    # Message metadata
    message_metadata = Column(JSON, nullable=True)  # Dict[str, Any]
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    chat = relationship("Chat", back_populates="messages")
    user = relationship("User")
    
    # Indexes
    __table_args__ = (
        Index('idx_chat_messages_chat_id', 'chat_id'),
        Index('idx_chat_messages_sequence', 'chat_id', 'sequence_order'),
        Index('idx_chat_messages_role', 'role'),
        Index('idx_chat_messages_created_at', 'created_at'),
    )

class ArticleGroup(Base):
    """
    Article groups - collections of research articles with shared analysis context.
    
    Groups define feature extraction schemas and contain articles with contextual 
    feature data. Each group acts as an analytical workspace where articles can
    have different extracted features based on the research focus.
    """
    __tablename__ = "article_group"
    
    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    
    # Foreign keys
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    
    # Group metadata
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Search context (if group was created from search results)
    search_query = Column(Text, nullable=True)
    search_provider = Column(String(50), nullable=True)
    search_params = Column(JSON, nullable=True)
    
    # Feature definitions - what features can be extracted for articles in this group
    # Stores List[FeatureDefinition] as JSON array
    # Each FeatureDefinition has: {id: str, name: str, description: str, type: str, options: dict}
    feature_definitions = Column(JSON, nullable=False, default=list)
    
    # Statistics
    article_count = Column(Integer, nullable=False, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="article_groups")
    articles = relationship("ArticleGroupDetail", back_populates="group", cascade="all, delete-orphan")
    
    # Helper methods for working with feature definitions
    def get_feature_definition_by_id(self, feature_id: str):
        """Get a specific feature definition by its ID."""
        for feature_def in (self.feature_definitions or []):
            if isinstance(feature_def, dict) and feature_def.get('id') == feature_id:
                return feature_def
        return None
    
    def has_feature_definition(self, feature_id: str) -> bool:
        """Check if this group has a specific feature definition."""
        return self.get_feature_definition_by_id(feature_id) is not None
    
    # Indexes
    __table_args__ = (
        Index('idx_article_group_user_id', 'user_id'),
        Index('idx_article_group_created_at', 'created_at'),
        Index('idx_article_group_name', 'user_id', 'name'),
    )

class ArticleGroupDetail(Base):
    """
    Individual articles within an article group context - junction model.
    
    Represents the many-to-many relationship between articles and groups, storing
    contextual data that is specific to this article-group pairing. The same article
    can exist in multiple groups with different extracted features and metadata.
    """
    __tablename__ = "article_group_detail"
    
    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    
    # Foreign key
    article_group_id = Column(String(36), ForeignKey("article_group.id", ondelete="CASCADE"), nullable=False)
    
    # Article data - full CanonicalResearchArticle JSON embedded storage
    # Contains only canonical bibliographic data (title, authors, abstract, etc.)
    # Does NOT contain extracted_features - those are stored separately below
    article_data = Column(JSON, nullable=False)
    
    # Contextual data - all scoped to this article in this specific group
    notes = Column(Text, nullable=True, default='')  # User's research notes for this article in this group
    
    # Feature data - extracted features specific to this article-group relationship
    # Stores feature_data as {feature_id: extracted_value} where:
    # - Keys are FeatureDefinition.id (stable UUIDs like "feat_f47ac10b-58cc-4372-a567-0e02b2c3d479")
    # - Values are extracted feature values (strings: "yes"/"no" for boolean, text for text, numeric strings for scores)
    # - Keys must match feature definitions in the parent ArticleGroup.feature_definitions
    feature_data = Column(JSON, nullable=False, default=dict)
    
    # Article metadata - user annotations specific to this article in this group
    # Example: {tags: ["important", "methodology"], rating: 5, status: "read", priority: "high"}
    article_metadata = Column(JSON, nullable=False, default=dict)
    
    # Display order within the group
    position = Column(Integer, nullable=False, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    group = relationship("ArticleGroup", back_populates="articles")
    
    # Helper methods for working with feature data
    def get_feature_value(self, feature_id: str, default=None):
        """Get the value of a specific feature by its ID."""
        return (self.feature_data or {}).get(feature_id, default)
    
    def set_feature_value(self, feature_id: str, value):
        """Set the value of a specific feature by its ID."""
        if self.feature_data is None:
            self.feature_data = {}
        self.feature_data[feature_id] = value
    
    def has_feature_value(self, feature_id: str) -> bool:
        """Check if this article has a value for a specific feature."""
        return feature_id in (self.feature_data or {})
    
    def remove_feature_value(self, feature_id: str):
        """Remove a feature value by its ID."""
        if self.feature_data and feature_id in self.feature_data:
            del self.feature_data[feature_id]
    
    @property
    def article(self):
        """
        Get the embedded article data as a CanonicalResearchArticle.
        Note: This returns the raw JSON - you may want to validate it with the Pydantic model.
        """
        return self.article_data
    
    # Indexes
    __table_args__ = (
        Index('idx_article_group_detail_group_id', 'article_group_id'),
        Index('idx_article_group_detail_position', 'article_group_id', 'position'),
    )

# ================== FEATURE PRESET MODELS ==================

class FeaturePresetGroup(Base):
    """Feature preset group - a collection of features that can be applied together"""
    __tablename__ = 'feature_preset_groups'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text)
    category = Column(String(100))
    
    # Scope fields
    scope = Column(String(20), nullable=False)  # 'global' or 'user'
    scope_id = Column(Integer, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    features = relationship('FeaturePresetFeature', back_populates='preset_group', cascade='all, delete-orphan')
    user = relationship('User', foreign_keys=[scope_id])
    
    # Constraints
    __table_args__ = (
        CheckConstraint(
            "(scope = 'global' AND scope_id IS NULL) OR (scope = 'user' AND scope_id IS NOT NULL)",
            name='check_scope_consistency'
        ),
        CheckConstraint(
            "scope IN ('global', 'user')",
            name='check_valid_scope'
        ),
        Index('idx_preset_groups_scope', 'scope', 'scope_id'),
    )
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'id': str(self.id),
            'name': self.name,
            'description': self.description,
            'category': self.category,
            'scope': self.scope,
            'scope_id': self.scope_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'features': [f.to_dict() for f in sorted(self.features, key=lambda x: x.position)]
        }


class FeaturePresetFeature(Base):
    """Individual feature within a preset group"""
    __tablename__ = 'feature_preset_features'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    preset_group_id = Column(String(36), ForeignKey('feature_preset_groups.id', ondelete='CASCADE'), nullable=False)
    
    # Feature definition
    feature_id = Column(String(255), nullable=False)  # Unique identifier for the feature
    feature_name = Column(String(255), nullable=False)
    feature_description = Column(Text, nullable=False)
    feature_type = Column(String(20), nullable=False)  # 'boolean', 'text', 'score'
    feature_options = Column(JSON)  # Additional options like min/max for scores
    
    # Ordering
    position = Column(Integer, default=0)
    
    # Relationships
    preset_group = relationship('FeaturePresetGroup', back_populates='features')
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('preset_group_id', 'feature_id', name='unique_feature_per_preset'),
        Index('idx_preset_features_group', 'preset_group_id', 'position'),
    )
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'id': self.feature_id,
            'name': self.feature_name,
            'description': self.feature_description,
            'type': self.feature_type,
            'options': self.feature_options or {}
        }
    
    def to_feature_definition(self):
        """Convert to FeatureDefinition format used in workbench"""
        return {
            'id': self.feature_id,
            'name': self.feature_name,
            'description': self.feature_description,
            'type': self.feature_type,
            'options': self.feature_options or {}
        }


class ChatQuickAction(Base):
    """Quick actions for article chat functionality"""
    __tablename__ = 'chat_quick_actions'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False)  # Display name (e.g., "Palatin Relevance")
    prompt = Column(Text, nullable=False)  # The actual question/prompt to send
    description = Column(Text)  # Optional description for management UI
    
    # Scope management (global vs user-specific)
    scope = Column(String(20), nullable=False, default='user')  # 'global' or 'user'
    user_id = Column(Integer, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=True)
    
    # Ordering for display
    position = Column(Integer, default=0)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship('User', foreign_keys=[user_id])
    
    # Constraints
    __table_args__ = (
        CheckConstraint(
            "(scope = 'global' AND user_id IS NULL) OR (scope = 'user' AND user_id IS NOT NULL)",
            name='check_chat_scope_consistency'
        ),
        CheckConstraint(
            "scope IN ('global', 'user')",
            name='check_chat_valid_scope'
        ),
        Index('idx_chat_actions_scope', 'scope', 'user_id'),
        Index('idx_chat_actions_position', 'scope', 'position'),
    )
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'id': str(self.id),
            'name': self.name,
            'prompt': self.prompt,
            'description': self.description,
            'scope': self.scope,
            'user_id': self.user_id,
            'position': self.position,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class UserCompanyProfile(Base):
    """User's company/organization context for personalized AI responses"""
    __tablename__ = 'user_company_profiles'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(Integer, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False, unique=True)
    
    # Company Information
    company_name = Column(String(255), nullable=False, default='Your Company')
    company_description = Column(Text)
    
    # Business Focus
    business_focus = Column(Text, nullable=False, default='developing innovative solutions')
    research_interests = Column(Text)  # JSON array of research areas
    therapeutic_areas = Column(Text)   # JSON array of therapeutic focus areas
    
    # Research Context
    key_compounds = Column(Text)       # JSON array of key compounds/drugs
    pathways_of_interest = Column(Text) # JSON array of biological pathways
    competitive_landscape = Column(Text) # Information about competitors
    
    # AI Instruction Context
    research_agent_role = Column(Text, nullable=False, default='research agent')
    analysis_focus = Column(Text)      # What to focus on when analyzing articles
    
    # Metadata
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship('User', back_populates='company_profile')
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'company_name': self.company_name,
            'company_description': self.company_description,
            'business_focus': self.business_focus,
            'research_interests': self.research_interests,
            'therapeutic_areas': self.therapeutic_areas,
            'key_compounds': self.key_compounds,
            'pathways_of_interest': self.pathways_of_interest,
            'competitive_landscape': self.competitive_landscape,
            'research_agent_role': self.research_agent_role,
            'analysis_focus': self.analysis_focus,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def generate_company_context(self) -> str:
        """Generate dynamic company context for AI system instructions"""
        context_parts = [
            f"You are a {self.research_agent_role} for {self.company_name}, a company that is focused on {self.business_focus}."
        ]
        
        if self.company_description:
            context_parts.append(self.company_description)
        
        context_parts.append(
            "Your primary purpose is to alert company personnel to new scientific and medical literature "
            "that highlights risks and opportunities relevant to their business."
        )
        
        if self.research_interests:
            context_parts.append(f"The literature searches are focused on topics such as {self.research_interests}.")
        
        if self.therapeutic_areas:
            context_parts.append(f"{self.company_name} is highly interested in {self.therapeutic_areas}.")
        
        if self.key_compounds:
            context_parts.append(f"Key compounds of interest include {self.key_compounds}.")
        
        if self.pathways_of_interest:
            context_parts.append(f"Important biological pathways include {self.pathways_of_interest}.")
        
        context_parts.append(
            f"Overall, this research analysis plays an important role in keeping the {self.company_name} team "
            "up-to-date on the latest scientific and medical research, enabling them to make informed decisions "
            "about their research and development programs."
        )
        
        return " ".join(context_parts)
    
    def generate_analysis_instructions(self) -> str:
        """Generate dynamic analysis instructions for AI"""
        instructions = [
            f"1. Analyze this article through the lens of {self.company_name}'s business interests and research focus",
            f"2. Identify potential risks, opportunities, or competitive intelligence relevant to {self.company_name}"
        ]
        
        if self.pathways_of_interest:
            instructions.append(f"3. Highlight connections to {self.pathways_of_interest} when relevant")
        
        if self.therapeutic_areas:
            instructions.append(f"4. Assess relevance to {self.company_name}'s therapeutic areas ({self.therapeutic_areas})")
        
        instructions.extend([
            f"5. Provide strategic insights about how this research might impact {self.company_name}'s programs",
            "6. Answer questions about the methodology, findings, and implications",
            "7. Explain complex concepts in accessible language for company personnel"
        ])
        
        if self.analysis_focus:
            instructions.append(f"8. {self.analysis_focus}")
        
        return "\n".join(instructions)


class SmartSearchSession(Base):
    """
    Model for tracking smart search sessions with complete history
    """
    __tablename__ = "smart_search_sessions"

    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    
    # User tracking
    user_id = Column(String(255), nullable=False, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'), server_default=text('CURRENT_TIMESTAMP'))
    
    # Step 1: Initial Question
    original_question = Column(Text, nullable=False)
    
    # Step 2: Evidence Specification
    generated_evidence_spec = Column(Text)  # AI-generated evidence specification
    submitted_evidence_spec = Column(Text)  # User-submitted evidence specification
    
    # Step 3: Search Keywords Generation
    generated_search_keywords = Column(Text)  # AI-generated search keywords
    submitted_search_keywords = Column(Text)  # User-submitted search keywords
    
    # Step 4: Search Execution
    search_metadata = Column(JSON)  # Stores pagination info, sources searched, etc.
    
    # Step 5: Article Curation
    articles_retrieved_count = Column(Integer, default=0)
    articles_selected_count = Column(Integer, default=0)  # How many user selected for filtering
    
    # Step 6: Discriminator Generation
    generated_discriminator = Column(Text)
    submitted_discriminator = Column(Text)  # What user actually submitted (may be edited)
    filter_strictness = Column(String(20))  # low, medium, high
    
    # Step 7: Filtering Results
    filtering_metadata = Column(JSON)
    filtered_articles = Column(JSON)  # Store the actual filtered articles results
    
    # Session Status
    status = Column(String(50), default="in_progress")  # in_progress, completed, abandoned
    last_step_completed = Column(String(100))  # Track where user stopped
    
    # Additional Metrics
    session_duration_seconds = Column(Integer)  # Total time from start to completion
    total_api_calls = Column(Integer, default=0)  # Track API usage
    
    # Token Usage Tracking
    total_prompt_tokens = Column(Integer, default=0)  # Total input tokens used
    total_completion_tokens = Column(Integer, default=0)  # Total output tokens generated
    total_tokens = Column(Integer, default=0)  # Total tokens used across all LLM calls
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "original_question": self.original_question,
            "generated_evidence_spec": self.generated_evidence_spec,
            "submitted_evidence_spec": self.submitted_evidence_spec,
            "generated_search_keywords": self.generated_search_keywords,
            "submitted_search_keywords": self.submitted_search_keywords,
            "search_metadata": self.search_metadata,
            "articles_retrieved_count": self.articles_retrieved_count,
            "articles_selected_count": self.articles_selected_count,
            "generated_discriminator": self.generated_discriminator,
            "submitted_discriminator": self.submitted_discriminator,
            "filter_strictness": self.filter_strictness,
            "filtering_metadata": self.filtering_metadata,
            "filtered_articles": self.filtered_articles,
            "status": self.status,
            "last_step_completed": self.last_step_completed,
            "session_duration_seconds": self.session_duration_seconds,
            "total_api_calls": self.total_api_calls,
            "total_prompt_tokens": self.total_prompt_tokens,
            "total_completion_tokens": self.total_completion_tokens,
            "total_tokens": self.total_tokens
        }


# ============================================================================
# SmartSearch2 Event-Based Tracking Model
# ============================================================================

class EventType(str, PyEnum):
    """Event types for SmartSearch2 user journey tracking"""

    # Journey lifecycle
    JOURNEY_START = "journey_start"
    JOURNEY_COMPLETE = "journey_complete"

    # Search operations
    SEARCH_EXECUTE = "search_execute"
    SEARCH_LOAD_MORE = "search_load_more"
    SOURCE_CHANGE = "source_change"

    # AI Keyword Helper flow
    KEYWORD_HELPER_START = "keyword_helper_start"
    KEYWORD_HELPER_EVIDENCE_SPEC = "keyword_helper_evidence_spec"
    KEYWORD_HELPER_CONCEPTS = "keyword_helper_concepts"
    KEYWORD_HELPER_EXPRESSIONS = "keyword_helper_expressions"
    KEYWORD_HELPER_COMPLETE = "keyword_helper_complete"

    # Google Scholar enrichment
    SCHOLAR_ENRICH_START = "scholar_enrich_start"
    SCHOLAR_ENRICH_COMPLETE = "scholar_enrich_complete"

    # Filtering
    FILTER_APPLY = "filter_apply"
    FILTER_ACCEPT = "filter_accept"
    FILTER_REJECT = "filter_reject"
    FILTER_UNDO = "filter_undo"

    # Feature extraction (AI columns)
    COLUMNS_ADD = "columns_add"
    COLUMNS_EXTRACT = "columns_extract"

    # User interactions
    ARTICLE_VIEW = "article_view"
    ARTICLE_EXPORT = "article_export"

    # Coverage testing
    COVERAGE_TEST = "coverage_test"


class UserEvent(Base):
    """Event-based tracking for SmartSearch2 user actions"""
    __tablename__ = "user_events"

    # Composite primary key
    user_id = Column(String(255), nullable=False, primary_key=True)
    journey_id = Column(String(36), nullable=False, primary_key=True)
    event_id = Column(String(36), nullable=False, primary_key=True, default=lambda: str(uuid4()))

    # Event metadata
    event_type = Column(Enum(EventType), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    # Event data (flexible JSON)
    event_data = Column(JSON, default=dict)  # All event-specific data

    # Indexes for efficient querying
    __table_args__ = (
        Index('idx_journey_events', 'journey_id', 'timestamp'),
        Index('idx_user_events_time', 'user_id', 'timestamp'),
        Index('idx_event_type_time', 'event_type', 'timestamp'),
        Index('idx_user_journey', 'user_id', 'journey_id'),
    )
