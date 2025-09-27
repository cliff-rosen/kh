# Schema and Models Architecture - Source of Truth

## Design Philosophy

**Terminology:**
- **Logical Model** = Conceptual business entities and relationships
- **Database Model** = Relational implementation (SQLAlchemy)
- **Python Schema** = Business logic layer (Pydantic)
- **TypeScript Types** = Frontend representations

**Core Design Principles:**

1. **User Context Separation**:
   - **Database Models**: Include `user_id` fields everywhere for security/isolation
   - **Schemas**: User context is already established; `user_id` fields are optional/omitted
   - **Rationale**: Schemas operate after authentication in trusted business logic layer

2. **Parent/Child Context Management**:
   - **Database Models**: Child entities store parent IDs (foreign key relationships)
   - **Schemas**: Parent entities contain/manage child context (relationships loaded)
   - **Example**: DB has `hop.mission_id`, Schema has `mission.hops[]`
   - **Rationale**: Schemas represent fully-loaded business objects with resolved relationships

3. **Session-Based Persistence**:
   - **User Sessions**: Each user session contains a chat conversation and optionally a mission
   - **Full Context**: Chat messages, mission state, and hop progress all persisted
   - **Rationale**: Enable session recovery, context preservation, and historical analysis

## 1. Logical Model

### Core Entities

**UserSession**: A user working session containing chat and optional mission
- Top-level workspace container for user interactions
- Links chat conversations to missions
- Enables session recovery and persistence across app restarts
- Tracks session metadata, lifecycle, and activity timestamps
- Starts when user begins conversation, ends when completed/abandoned/archived

**Chat**: A conversation within a session
- Contains ordered sequence of messages
- Tracks conversation metadata and context
- Scoped to a specific session

**ChatMessage**: Individual messages in a conversation
- Supports multiple roles (user, assistant, system, tool, status)
- Contains content, metadata, and timestamps
- Preserves full conversation history

**Mission**: A high-level goal requiring multiple execution steps
- Tracks overall progress through status transitions
- Maintains current_hop_id for active hop tracking
- Contains hop_history for all hops in sequence
- Has relationships to mission-scoped assets only (persistent deliverables and working artifacts)

**Hop**: A single execution phase within a Mission
- Sequential execution unit with unique sequence_order
- Contains one or more tool_steps that execute as a chain
- Has relationships to BOTH mission-scoped assets (inherited access) AND hop-scoped assets (own working data)
- Tracks resolution and completion state
- Unique dual-scope asset access: can reference existing mission assets while creating temporary hop assets

**ToolStep**: An atomic unit of work using a specific tool
- References input and output assets directly by ID in parameter/result mappings
- Executes within hop context
- Creates/updates assets from both scopes based on tool outputs

**Asset**: Data/content with lifecycle management and value representation
- Explicitly scoped to either mission or hop via scope_type/scope_id fields
- Mission-scoped assets: Persistent throughout mission lifecycle, visible to mission and all its hops
- Hop-scoped assets: Temporary working data, visible only to the specific hop that created them
- Has status (pending/ready/error) and role (input/output/intermediate)
- Uses value representation strategy for efficient display/LLM consumption
- Stores full content plus generated summary

### Key Relationships

```
UserSession 1→1 Chat
UserSession 1→1 Mission (optional)
Chat 1→* ChatMessage
Mission 1→1 Hop (current_hop_id)
Mission 1→* Hop (hop_history via mission_id)

Asset Scoping:
Mission → Assets (scope_type='mission', scope_id=mission.id) [mission can only see mission-scoped]
Hop → Assets (scope_type='mission', scope_id=mission.id) [hop can see mission-scoped assets]
Hop → Assets (scope_type='hop', scope_id=hop.id) [hop can see hop-scoped assets]

Execution Context:
Hop 1→* ToolStep (hop_id)
ToolStep references Assets from both scopes (via parameter/result mappings)

Asset-Entity Mapping:
MissionAsset table: many-to-many Mission ↔ Asset (mission-scoped only)
HopAsset table: many-to-many Hop ↔ Asset (both mission-scoped and hop-scoped)
```

### Lite Representations

**Purpose**: Lite representations are simplified, LLM-friendly versions of core entities used for proposal workflows and agent communication. They reduce complexity while maintaining essential information for decision-making and creation processes.

**MissionLite**: Simplified mission specification for mission proposals
- Contains mission metadata (name, description, goal, success_criteria)
- Includes `assets: List[AssetLite]` for defining mission deliverables
- Used by agents when proposing missions to users
- Converted to full Mission + Asset entities upon user acceptance
- Eliminates complex database relationships for cleaner LLM interactions

**AssetLite**: Simplified asset specification for asset creation
- Contains core asset information (name, description, schema_definition, role)
- Includes `content: Optional[Any]` for initial asset content
- Used within MissionLite and HopLite for asset definitions
- Converted to full Asset entities with proper scoping and metadata
- Provides agent-friendly format for specifying data requirements

**HopLite**: Simplified hop specification for hop planning
- Contains hop metadata (name, description, rationale, is_final)
- Includes `inputs: List[str]` for referencing existing mission assets by ID
- Includes `output: OutputAssetSpec` for defining hop deliverables
- Used by agents when proposing hop plans to users
- Converted to full Hop + ToolStep entities during implementation
- Bridges planning phase with execution phase complexity

**OutputAssetSpec**: Union type for hop output specifications
- `NewAssetOutput`: Creates new mission-scoped asset from AssetLite
- `ExistingAssetOutput`: References existing mission asset by ID
- Provides flexibility for hops to create new deliverables or update existing ones
- Enables proper asset lifecycle management during hop execution

**Design Rationale**:
- **Agent Simplicity**: Reduces cognitive load for LLM agents during proposal generation
- **User Clarity**: Presents clean, understandable proposals without implementation details
- **Conversion Pipeline**: Maintains clear mapping from lite → full entities
- **Validation Layer**: Lite representations can be validated before full entity creation
- **Backward Compatibility**: Changes to full entities don't break agent workflows

**Usage Flow**:
1. **Agent Planning**: Uses MissionLite/HopLite for proposals
2. **User Review**: Lite representations displayed in UI for approval
3. **System Conversion**: Lite entities converted to full entities upon acceptance
4. **Execution**: Full entities used for workflow execution and database operations

## 2. Database Models (SQLAlchemy)

### Required Enums

```python
class MessageRole(str, PyEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"
    STATUS = "status"

class UserSessionStatus(str, PyEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    ARCHIVED = "archived"

class MissionStatus(str, PyEnum):
    AWAITING_APPROVAL = "awaiting_approval"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class HopStatus(str, PyEnum):
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
    PROPOSED = "proposed"
    READY_TO_CONFIGURE = "ready_to_configure"
    READY_TO_EXECUTE = "ready_to_execute"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class AssetStatus(str, PyEnum):
    PROPOSED = "proposed"       # Asset created in mission/hop proposal, awaiting user approval
    PENDING = "pending"         # User approved, asset ready to be worked on
    IN_PROGRESS = "in_progress" # Tool is currently processing this asset
    READY = "ready"            # Asset processing completed successfully
    ERROR = "error"            # Asset processing failed
    EXPIRED = "expired"        # Asset data is stale/invalid

class AssetRole(str, PyEnum):
    INPUT = "input"
    OUTPUT = "output"
    INTERMEDIATE = "intermediate"

class AssetScopeType(str, PyEnum):
    MISSION = "mission"
    HOP = "hop"
```

### UserSession Model

```python
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
```

### Chat Model

```python
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
```

### ChatMessage Model

```python
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
```

### Mission Model

```python
class Mission(Base):
    __tablename__ = "missions"
    
    # Core fields
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    goal = Column(Text, nullable=True)
    success_criteria = Column(JSON, nullable=True)  # List[str]
    status = Column(Enum(MissionStatus), nullable=False, default=MissionStatus.AWAITING_APPROVAL)
    
    # Current hop tracking
    current_hop_id = Column(String(36), ForeignKey("hops.id"), nullable=True)
    
    # Mission data
    mission_metadata = Column(JSON, nullable=True)  # Dict[str, Any]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="missions")
    session = relationship("UserSession", back_populates="mission", uselist=False)
    current_hop = relationship("Hop", foreign_keys=[current_hop_id], post_update=True)
    hops = relationship("Hop", back_populates="mission", cascade="all, delete-orphan", 
                       order_by="Hop.sequence_order", foreign_keys="Hop.mission_id")
    
    # Asset mapping relationships
    mission_assets = relationship("MissionAsset", back_populates="mission", cascade="all, delete-orphan")
    
    # Asset relationships for mission_asset_map access
    assets = relationship("Asset", 
                         primaryjoin="and_(Mission.id == foreign(Asset.scope_id), Asset.scope_type == 'mission')",
                         viewonly=True)
```

### Hop Model

```python
class Hop(Base):
    __tablename__ = "hops"
    
    # Core fields
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    mission_id = Column(String(36), ForeignKey("missions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    sequence_order = Column(Integer, nullable=False)
    
    # Hop information
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    goal = Column(Text, nullable=True)
    success_criteria = Column(JSON, nullable=True)  # List[str]
    rationale = Column(Text, nullable=True)
    status = Column(Enum(HopStatus), nullable=False, default=HopStatus.HOP_PLAN_STARTED)
    
    # Hop state
    is_final = Column(Boolean, nullable=False, default=False)
    is_resolved = Column(Boolean, nullable=False, default=False)
    error_message = Column(Text, nullable=True)
    hop_metadata = Column(JSON, nullable=True)  # Dict[str, Any]
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    mission = relationship("Mission", back_populates="hops")
    user = relationship("User", back_populates="hops")
    tool_steps = relationship("ToolStep", back_populates="hop", cascade="all, delete-orphan", 
                            order_by="ToolStep.sequence_order")
    
    # Asset mapping relationships
    hop_assets = relationship("HopAsset", back_populates="hop", cascade="all, delete-orphan")
    
    # Asset relationships for hop_asset_map access
    assets = relationship("Asset",
                         primaryjoin="and_(Hop.id == foreign(Asset.scope_id), Asset.scope_type == 'hop')",
                         viewonly=True)
```

### ToolStep Model

```python
class ToolStep(Base):
    __tablename__ = "tool_steps"
    
    # Core fields
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hop_id = Column(String(36), ForeignKey("hops.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    tool_id = Column(String(255), nullable=False)
    sequence_order = Column(Integer, nullable=False)
    
    # Tool step information
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ToolExecutionStatus), nullable=False, default=ToolExecutionStatus.PROPOSED)
    
    # Tool configuration
    parameter_mapping = Column(JSON, nullable=True)  # Dict[str, ParameterMapping]
    result_mapping = Column(JSON, nullable=True)     # Dict[str, ResultMapping]
    resource_configs = Column(JSON, nullable=True)   # Dict[str, Resource]
    
    # Execution data
    validation_errors = Column(JSON, nullable=True)  # List[str]
    execution_result = Column(JSON, nullable=True)   # Dict[str, Any]
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    hop = relationship("Hop", back_populates="tool_steps")
    user = relationship("User")
```

### Asset Model (Value Representation Strategy)

```python
class Asset(Base):
    __tablename__ = "assets"
    
    # Core fields
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
        Index('idx_assets_scope', 'scope_type', 'scope_id'),
        Index('idx_assets_role', 'role'),
        Index('idx_assets_status', 'status'),
    )
```

### MissionAsset Model

```python
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
```

### HopAsset Model

```python
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
```

## 3. Python Schema (Pydantic)

### UserSession Schema

```python
class UserSession(BaseModel):
    # Core fields
    id: str
    name: Optional[str] = None
    status: UserSessionStatus = UserSessionStatus.ACTIVE
    
    # Relationships
    chat_id: str
    mission_id: Optional[str] = None
    
    # Session metadata
    session_metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships (populated by services) - Parent manages child context
    chat: Optional['Chat'] = None
    mission: Optional['Mission'] = None
```

### Chat Schema

```python
class Chat(BaseModel):
    # Core fields
    id: str
    title: Optional[str] = None
    
    # Chat context
    context_data: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships (populated by services) - Parent manages child context
    messages: List['ChatMessage'] = Field(default_factory=list)
```

### ChatMessage Schema

```python
class ChatMessage(BaseModel):
    # Core fields
    id: str
    sequence_order: int
    role: MessageRole
    content: str
    
    # Message metadata
    message_metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### Mission Schema

```python
class Mission(BaseModel):
    # Core fields
    id: str
    name: str
    description: Optional[str] = None
    goal: Optional[str] = None
    success_criteria: List[str] = Field(default_factory=list)
    status: MissionStatus = MissionStatus.AWAITING_APPROVAL
    
    # Current hop tracking
    current_hop_id: Optional[str] = None
    
    # Metadata
    mission_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships (populated by services) - Parent manages child context
    current_hop: Optional['Hop'] = None
    hops: List['Hop'] = Field(default_factory=list)  # hop_history
    
    # Asset collection - unified approach (populated from MissionAsset mapping table)
    mission_asset_map: Dict[str, AssetRole] = Field(default_factory=dict)  # asset_id -> role mapping
    
    @property
    def asset_summary(self) -> AssetMapSummary:
        """Get summary of mission assets by role"""
        return AssetMapSummary.from_asset_map(self.mission_asset_map)
    
    def get_input_ids(self) -> List[str]:
        """Get all input asset IDs from mission_asset_map"""
        return [aid for aid, role in self.mission_asset_map.items() if role == AssetRole.INPUT]
    
    def get_output_ids(self) -> List[str]:
        """Get all output asset IDs from mission_asset_map"""
        return [aid for aid, role in self.mission_asset_map.items() if role == AssetRole.OUTPUT]
    
    def get_intermediate_ids(self) -> List[str]:
        """Get all intermediate asset IDs from mission_asset_map"""
        return [aid for aid, role in self.mission_asset_map.items() if role == AssetRole.INTERMEDIATE]
```

### Hop Schema

```python
class Hop(BaseModel):
    # Core fields
    id: str
    sequence_order: int
    name: str
    description: Optional[str] = None
    goal: Optional[str] = None
    success_criteria: List[str] = Field(default_factory=list)
    rationale: Optional[str] = None
    status: HopStatus = HopStatus.HOP_PLAN_STARTED
    
    # Hop state
    is_final: bool = False
    is_resolved: bool = False
    error_message: Optional[str] = None
    hop_metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships (populated by services) - Parent manages child context
    tool_steps: List['ToolStep'] = Field(default_factory=list)
    
    # Asset collections (populated from HopAsset mapping table)
    hop_asset_map: Dict[str, AssetRole] = Field(default_factory=dict)  # asset_id -> role mapping
    
    # Intended asset tracking for hop proposal (references to mission assets)
    intended_input_asset_ids: List[str] = Field(default_factory=list)  # Mission asset IDs this hop will use
    intended_output_asset_ids: List[str] = Field(default_factory=list)  # Mission asset IDs this hop will update/create
    intended_output_asset_specs: List[OutputAssetSpec] = Field(default_factory=list)  # New mission assets this hop will create
    
    @property
    def asset_summary(self) -> AssetMapSummary:
        """Get summary of hop assets by role"""
        return AssetMapSummary.from_asset_map(self.hop_asset_map)
    
    def get_hop_input_ids(self) -> List[str]:
        """Get all input asset IDs from hop_asset_map"""
        return [aid for aid, role in self.hop_asset_map.items() if role == AssetRole.INPUT]
    
    def get_hop_output_ids(self) -> List[str]:
        """Get all output asset IDs from hop_asset_map"""
        return [aid for aid, role in self.hop_asset_map.items() if role == AssetRole.OUTPUT]
    
    def get_hop_intermediate_ids(self) -> List[str]:
        """Get all intermediate asset IDs from hop_asset_map"""
        return [aid for aid, role in self.hop_asset_map.items() if role == AssetRole.INTERMEDIATE]
```

### ToolStep Schema

```python
class ToolStep(BaseModel):
    # Core fields
    id: str
    tool_id: str
    sequence_order: int
    name: str
    description: Optional[str] = None
    status: ToolExecutionStatus = ToolExecutionStatus.PROPOSED
    
    # Tool configuration
    parameter_mapping: Dict[str, ParameterMappingValue] = Field(default_factory=dict)
    result_mapping: Dict[str, ResultMappingValue] = Field(default_factory=dict)
    resource_configs: Dict[str, Resource] = Field(default_factory=dict)
    
    # Execution data
    validation_errors: List[str] = Field(default_factory=list)
    execution_result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    async def execute(self, hop_assets: Dict[str, Asset], user_id: Optional[int] = None, db: Optional[Any] = None) -> Dict[str, Any]:
        """
        Execute this tool step and return the results.
        
        Args:
            hop_assets: Current state of the hop containing all assets by asset_id
            user_id: User ID for asset persistence (optional)
            db: Database session for asset persistence (optional)
            
        Returns:
            Dict containing the execution results
            
        Raises:
            ToolExecutionError: If tool execution fails
        """

```

### Asset Schema (Value Representation)

```python
class Asset(SchemaEntity):
    """Asset with metadata and value representation (no full content)"""
    # Inherits from SchemaEntity: id, name, description, schema_definition
    # Note: Database model includes these fields as columns for storage
    
    # Additional fields beyond SchemaEntity
    subtype: Optional[str] = None
    
    # Scope information
    scope_type: AssetScopeType
    scope_id: str
    
    # Asset lifecycle
    status: AssetStatus = AssetStatus.PROPOSED
    role: AssetRole
    
    # Value representation (generated from content_summary)
    value_representation: str
    
    # Metadata
    asset_metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AssetWithContent(Asset):
    """Asset with full content for tool execution"""
    content: Any  # Full content included
```

#### Asset Collection Philosophy

**Core Principle**: Mission and Hop state are represented as unified asset collections. Since each Asset has a `role` field (input/output/intermediate), we do NOT maintain separate `inputs` and `outputs` collections.

**Database Layer**: `MissionAsset` and `HopAsset` mapping tables provide proper many-to-many relationships with role tracking for database integrity and performance.

**Schema Layer**: `mission_asset_map` and `hop_asset_map` provide business logic access to asset role mappings, populated from the mapping tables by services.

**Why This Approach:**
- **Single Source of Truth**: Asset role is stored once in the Asset.role field
- **No Duplication**: Eliminates redundant storage of asset references
- **Dynamic Filtering**: Can derive inputs/outputs on-demand by filtering assets by role
- **Database Integrity**: Mapping tables ensure proper relationships and constraints
- **Maintainability**: Changes to asset roles automatically reflected in all queries

**Usage Pattern:**
```python
# Get input asset IDs from mission_asset_map
input_asset_ids = mission.get_input_ids()

# Get output asset IDs from hop_asset_map  
output_asset_ids = hop.get_hop_output_ids()

# Get all asset IDs for a mission
all_mission_asset_ids = list(mission.mission_asset_map.keys())

# Get asset summary
mission_summary = mission.asset_summary
hop_summary = hop.asset_summary
```


#### Mapping Type Definitions

```python
class AssetFieldMapping(BaseModel):
    """Maps a tool parameter to a specific asset by ID."""
    type: Literal["asset_field"] = "asset_field"
    state_asset: str

class LiteralMapping(BaseModel):
    """Provides a literal value directly to a tool parameter."""
    type: Literal["literal"] = "literal"
    value: Any

class DiscardMapping(BaseModel):
    """Indicates that a tool output should be discarded."""
    type: Literal["discard"] = "discard"

ParameterMappingValue = Union[AssetFieldMapping, LiteralMapping]
ResultMappingValue = Union[AssetFieldMapping, DiscardMapping]

class AssetMapSummary(BaseModel):
    """Summary of assets organized by role"""
    input_count: int = 0
    output_count: int = 0
    intermediate_count: int = 0
    input_ids: List[str] = Field(default_factory=list)
    output_ids: List[str] = Field(default_factory=list)
    intermediate_ids: List[str] = Field(default_factory=list)
    total_count: int = 0
    
    @classmethod
    def from_asset_map(cls, asset_map: Dict[str, AssetRole]) -> 'AssetMapSummary':
        """Create summary from asset_id -> role mapping"""
        input_ids = [aid for aid, role in asset_map.items() if role == AssetRole.INPUT]
        output_ids = [aid for aid, role in asset_map.items() if role == AssetRole.OUTPUT]
        intermediate_ids = [aid for aid, role in asset_map.items() if role == AssetRole.INTERMEDIATE]
        
        return cls(
            input_count=len(input_ids),
            output_count=len(output_ids),
            intermediate_count=len(intermediate_ids),
            input_ids=input_ids,
            output_ids=output_ids,
            intermediate_ids=intermediate_ids,
            total_count=len(asset_map)
        )
```

### Hop Output Types

```python
class NewAssetOutput(BaseModel):
    """Specification for creating a new asset as hop output"""
    type: Literal["new_asset"] = "new_asset"
    asset: Dict[str, Any]  # Asset specification including name, schema_definition, etc.

class ExistingAssetOutput(BaseModel):
    """Reference to existing mission asset as hop output"""
    type: Literal["existing_asset"] = "existing_asset"
    mission_asset_id: str

OutputAssetSpec = Union[NewAssetOutput, ExistingAssetOutput]
```

### Lite Representations

```python
class HopLite(BaseModel):
    """Simplified hop structure for hop planning operations"""
    name: str
    description: Optional[str] = None
    goal: Optional[str] = None
    rationale: Optional[str] = None
    success_criteria: List[str] = Field(default_factory=list)
    is_final: bool = False
    inputs: List[str]  # List of mission asset IDs to use as inputs
    output: OutputAssetSpec  # Either new asset specification or existing asset reference
    hop_metadata: Dict[str, Any] = Field(default_factory=dict)

class AssetLite(BaseModel):
    """Simplified asset structure for creation and LLM processing"""
    name: str
    description: Optional[str] = None
    schema_definition: Dict[str, Any]  # Schema type definition
    role: AssetRole
    subtype: Optional[str] = None
    content: Optional[Any] = None  # Initial content if any
    asset_metadata: Dict[str, Any] = Field(default_factory=dict)

class MissionLite(BaseModel):
    """Simplified mission structure for creation and LLM processing"""
    name: str
    description: Optional[str] = None
    goal: Optional[str] = None
    success_criteria: List[str] = Field(default_factory=list)
    mission_metadata: Dict[str, Any] = Field(default_factory=dict)
    assets: List[AssetLite] = Field(default_factory=list)  # Asset specifications to be created

class ToolStepLite(BaseModel):
    """Simplified tool step structure for implementation proposals"""
    tool_id: str
    name: str
    description: Optional[str] = None
    sequence_order: int
    parameter_mapping: Dict[str, ParameterMappingValue] = Field(default_factory=dict)
    result_mapping: Dict[str, ResultMappingValue] = Field(default_factory=dict)
    tool_metadata: Dict[str, Any] = Field(default_factory=dict)
```


## 4. TypeScript Types

### Enums

```typescript
export enum MessageRole {
    USER = "user",
    ASSISTANT = "assistant",
    SYSTEM = "system",
    TOOL = "tool",
    STATUS = "status"
}

export enum UserSessionStatus {
    ACTIVE = "active",
    COMPLETED = "completed",
    ABANDONED = "abandoned",
    ARCHIVED = "archived"
}

export enum MissionStatus {
    AWAITING_APPROVAL = "awaiting_approval",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}

export enum HopStatus {
    HOP_PLAN_STARTED = "hop_plan_started",
    HOP_PLAN_PROPOSED = "hop_plan_proposed",
    HOP_PLAN_READY = "hop_plan_ready",
    HOP_IMPL_STARTED = "hop_impl_started",
    HOP_IMPL_PROPOSED = "hop_impl_proposed",
    HOP_IMPL_READY = "hop_impl_ready",
    EXECUTING = "executing",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}

export enum ToolExecutionStatus {
    PROPOSED = "proposed",
    READY_TO_CONFIGURE = "ready_to_configure",
    READY_TO_EXECUTE = "ready_to_execute",
    EXECUTING = "executing",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}

export enum AssetStatus {
    PROPOSED = "proposed",
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    READY = "ready",
    ERROR = "error",
    EXPIRED = "expired"
}

export enum AssetRole {
    INPUT = "input",
    OUTPUT = "output",
    INTERMEDIATE = "intermediate"
}

export enum AssetScopeType {
    MISSION = "mission",
    HOP = "hop"
}
```

### Lite Type Definitions

```typescript
export interface AssetLite {
    name: string;
    description?: string;
    schema_definition: Record<string, any>;
    role: AssetRole;
    subtype?: string;
    content?: any;
    asset_metadata?: Record<string, any>;
}

export interface MissionLite {
    name: string;
    description?: string;
    goal?: string;
    success_criteria?: string[];
    mission_metadata?: Record<string, any>;
    assets?: AssetLite[];
}

export interface HopLite {
    name: string;
    description?: string;
    goal?: string;
    rationale?: string;
    success_criteria?: string[];
    is_final?: boolean;
    inputs: string[];
    output: OutputAssetSpec;
    hop_metadata?: Record<string, any>;
}

export interface ToolStepLite {
    tool_id: string;
    name: string;
    description?: string;
    sequence_order: number;
    parameter_mapping?: Record<string, ParameterMappingValue>;
    result_mapping?: Record<string, ResultMappingValue>;
    tool_metadata?: Record<string, any>;
}
```

### Hop Output Types

```typescript
export interface NewAssetOutput {
    type: "new_asset";
    asset: Record<string, any>;
}

export interface ExistingAssetOutput {
    type: "existing_asset";
    mission_asset_id: string;
}

export type OutputAssetSpec = NewAssetOutput | ExistingAssetOutput;
```

### UserSession Interface

```typescript
export interface UserSession {
    // Core fields
    id: string;
    name?: string;
    status: UserSessionStatus;
    
    // Relationships
    chat_id: string;
    mission_id?: string;
    
    // Session metadata
    session_metadata: Record<string, any>;
    
    // Timestamps
    created_at: string;
    updated_at: string;
    last_activity_at: string;
    
    // Relationships - Parent manages child context
    chat?: Chat;
    mission?: Mission;
}
```

### Chat Interface

```typescript
export interface Chat {
    // Core fields
    id: string;
    title?: string;
    
    // Chat context
    context_data: Record<string, any>;
    
    // Timestamps
    created_at: string;
    updated_at: string;
    
    // Relationships - Parent manages child context
    messages: ChatMessage[];
}
```

### ChatMessage Interface

```typescript
export interface ChatMessage {
    // Core fields
    id: string;
    sequence_order: number;
    role: MessageRole;
    content: string;
    
    // Message metadata
    message_metadata: Record<string, any>;
    
    // Timestamps
    created_at: string;
}
```

### Mission Interface

```typescript
export interface Mission {
    // Core fields
    id: string;
    name: string;
    description?: string;
    goal?: string;
    status: MissionStatus;
    success_criteria: string[];
    
    // Current hop tracking
    current_hop_id?: string;
    
    // Metadata
    mission_metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
    
    // Relationships - Parent manages child context
    current_hop?: Hop;
    hops: Hop[];  // hop_history
    
    // Asset collection - unified approach (asset_id -> role mapping)
    mission_asset_map: Record<string, AssetRole>;  // asset_id -> role mapping
}
```

### Hop Interface

```typescript
export interface Hop {
    // Core fields
    id: string;
    sequence_order: number;
    name: string;
    description?: string;
    goal?: string;
    success_criteria: string[];
    rationale?: string;
    status: HopStatus;
    
    // Hop state
    is_final: boolean;
    is_resolved: boolean;
    error_message?: string;
    hop_metadata: Record<string, any>;
    
    // Timestamps
    created_at: string;
    updated_at: string;
    
    // Relationships - Parent manages child context
    tool_steps: ToolStep[];
    
    // Asset collections (asset_id -> role mapping)
    hop_asset_map: Record<string, AssetRole>;
    
    // Intended asset tracking for hop proposal
    intended_input_asset_ids: string[];
    intended_output_asset_ids: string[];
    intended_output_asset_specs: OutputAssetSpec[];
}
```

### Mapping Type Definitions

```typescript
// Tool parameter mapping types
export interface AssetFieldMapping {
    type: "asset_field";
    state_asset: string;
}

export interface LiteralMapping {
    type: "literal";
    value: any;
}

export interface DiscardMapping {
    type: "discard";
}

export type ParameterMappingValue = AssetFieldMapping | LiteralMapping;
export type ResultMappingValue = AssetFieldMapping | DiscardMapping;

export interface AssetMapSummary {
    input_count: number;
    output_count: number;
    intermediate_count: number;
    input_ids: string[];
    output_ids: string[];
    intermediate_ids: string[];
    total_count: number;
}
```

### ToolStep Interface

```typescript
export interface ToolStep {
    // Core fields
    id: string;
    tool_id: string;
    sequence_order: number;
    name: string;
    description?: string;
    status: ToolExecutionStatus;
    
    // Tool configuration
    parameter_mapping: Record<string, ParameterMappingValue>;
    result_mapping: Record<string, ResultMappingValue>;
    resource_configs: Record<string, Resource>;
    
    // Execution data
    validation_errors: string[];
    execution_result?: Record<string, any>;
    error_message?: string;
    
    // Timestamps
    created_at: string;
    updated_at: string;
    started_at?: string;
    completed_at?: string;
}
```

### Asset Interface (Value Representation)

```typescript
export interface Asset {
    // Inherited from SchemaEntity: id, name, description, schema_definition
    id: string;
    name: string;
    description: string;
    schema_definition: SchemaType;
    
    // Additional fields beyond SchemaEntity
    subtype?: string;
    
    // Scope information
    scope_type: AssetScopeType;
    scope_id: string;
    
    // Asset lifecycle
    status: AssetStatus;
    role: AssetRole;
    
    // Value representation (generated from content_summary)
    value_representation: string;
    
    // Metadata
    asset_metadata: Record<string, any>;
    
    // Timestamps
    created_at: string;
    updated_at: string;
}

export interface AssetWithContent extends Asset {
    content: any;  // Full content for tool execution
}
```

## 5. Query Patterns

### User Session Queries
```sql
-- Get user's active sessions
SELECT * FROM user_sessions WHERE user_id=? AND status='active' ORDER BY last_activity_at DESC;

-- Get session with chat and mission
SELECT us.*, c.title, m.name as mission_name 
FROM user_sessions us 
LEFT JOIN chats c ON us.chat_id = c.id 
LEFT JOIN missions m ON us.mission_id = m.id 
WHERE us.id=?;

-- Get session messages
SELECT cm.* FROM chat_messages cm 
JOIN chats c ON cm.chat_id = c.id 
JOIN user_sessions us ON c.id = us.chat_id 
WHERE us.id=? 
ORDER BY cm.sequence_order;
```

### Mission Assets
```sql
-- Get mission inputs
SELECT * FROM assets WHERE scope_type='mission' AND scope_id=? AND role='input';

-- Get mission outputs  
SELECT * FROM assets WHERE scope_type='mission' AND scope_id=? AND role='output';
```

### Hop Assets
```sql
-- Get hop state assets
SELECT * FROM assets WHERE scope_type='hop' AND scope_id=?;

-- Get hop intermediates
SELECT * FROM assets WHERE scope_type='hop' AND scope_id=? AND role='intermediate';
```

### Current Hop
```sql
-- Get current hop
SELECT * FROM hops WHERE id = (SELECT current_hop_id FROM missions WHERE id=?);
```

## 6. Status Sequences

### UserSession Status Flow
```
ACTIVE → COMPLETED (mission completed successfully)
      → ABANDONED (user stops interacting after 24+ hours)
      → ARCHIVED (user manually archives or system cleanup after 7+ days)
```

### Mission Status Flow
```
PROPOSED → READY_FOR_NEXT_HOP → BUILDING_HOP → HOP_READY_TO_EXECUTE → EXECUTING_HOP → [loop or end]
                                                                                     ↓
                                                                              COMPLETED/FAILED/CANCELLED
```

### Hop Status Flow
```
PROPOSED → READY_TO_RESOLVE → READY_TO_EXECUTE → EXECUTING → COMPLETED/FAILED/CANCELLED
```

### Asset Status Flow
```
PROPOSED → PENDING → IN_PROGRESS → READY → [ERROR/EXPIRED]
```

## 7. Value Representation Strategy

### Content Summary Generation
- **Small assets (< 1KB)**: Full content used directly for `value_representation`
- **Large arrays**: "Array of N items, preview: [first 3 items]"
- **Large objects**: "Object with N fields: [key names]"
- **Large text**: "Text (N chars): [first 150 chars]..."

### Asset Loading Strategy
- **Default**: Asset with `value_representation` only (lightweight)
- **Tool execution**: AssetWithContent with full `content` loaded
- **Frontend**: Progressive disclosure - value_representation first, full content on demand

### Asset Collection Access Patterns

**Mission Assets:**
```python
# All mission assets
all_asset_ids = list(mission.mission_asset_map.keys())

# Filter by role using helper methods
input_asset_ids = mission.get_input_ids()
output_asset_ids = mission.get_output_ids()
intermediate_asset_ids = mission.get_intermediate_ids()

# Get asset summary
summary = mission.asset_summary
```

**Hop Assets:**
```python
# All hop assets
all_asset_ids = list(hop.hop_asset_map.keys())

# Filter by role using helper methods
input_asset_ids = hop.get_hop_input_ids()
output_asset_ids = hop.get_hop_output_ids()
intermediate_asset_ids = hop.get_hop_intermediate_ids()

# Get asset summary
summary = hop.asset_summary
```

This architecture provides efficient asset management with rich metadata while maintaining a single source of truth for asset roles and eliminating redundant collections.

## 8. Session-Based Architecture

### UserSession Lifecycle Management

**When a UserSession Starts:**
```python
# User opens app or starts new conversation
chat = Chat.create(user_id=user_id)
user_session = UserSession.create(
    user_id=user_id,
    chat_id=chat.id,
    status=UserSessionStatus.ACTIVE,
    mission_id=None  # No mission initially
)
```

**UserSession Progression:**
1. **Pure Chat Phase**: User chats, messages accumulate in `chat.messages`
2. **Mission Proposal**: Bot proposes mission, stored in chat messages
3. **Mission Acceptance**: Mission created and linked via `user_session.mission_id`
4. **Active Work**: User progresses through mission hops while chat continues
5. **Session Updates**: `last_activity_at` updated on every interaction

**When a UserSession Ends:**
- **COMPLETED**: Mission completes successfully
- **ABANDONED**: No activity for 24+ hours (background job)
- **ARCHIVED**: User manually archives or system cleanup after 7+ days

### Session Management Strategy

**Key Benefits:**
- **Full Context Recovery**: Users can resume conversations exactly where they left off
- **Historical Analysis**: Complete record of user interactions and decision-making
- **Session Isolation**: Each session maintains its own chat and mission context
- **Scalable Storage**: Efficient storage with proper indexing and cleanup strategies

### Session Access Patterns

**Frontend Context Loading:**
```python
# Load complete session context
session = get_user_session(user_id, session_id)
chat_messages = session.chat.messages
mission_asset_map = session.mission.mission_asset_map if session.mission else {}
```

**Real-time Updates:**
```python
# Update session activity
session.last_activity_at = datetime.utcnow()
session.save()

# Add new message
new_message = ChatMessage(
    chat_id=session.chat_id,
    sequence_order=len(session.chat.messages) + 1,
    role=MessageRole.USER,
    content=message_content
)
```

**Session Cleanup Strategy:**
```python
# Daily cleanup job
def cleanup_user_sessions():
    # Mark abandoned sessions after 24 hours of inactivity
    UserSession.query.filter(
        UserSession.status == UserSessionStatus.ACTIVE,
        UserSession.last_activity_at < (datetime.now() - timedelta(hours=24))
    ).update({UserSession.status: UserSessionStatus.ABANDONED})
    
    # Archive abandoned sessions after 7 days
    UserSession.query.filter(
        UserSession.status == UserSessionStatus.ABANDONED,
        UserSession.updated_at < (datetime.now() - timedelta(days=7))
    ).update({UserSession.status: UserSessionStatus.ARCHIVED})
    
    # Delete archived sessions after 90 days
    UserSession.query.filter(
        UserSession.status == UserSessionStatus.ARCHIVED,
        UserSession.updated_at < (datetime.now() - timedelta(days=90))
    ).delete()
```

### User Experience Flow

**Starting**: User opens app → New UserSession + Chat created automatically
**Working**: User chats → Messages saved, mission created if accepted
**Leaving**: User closes app → UserSession remains ACTIVE, can resume later
**Returning**: User opens app → Can resume existing session or start new one
**Completing**: Mission finishes → UserSession marked COMPLETED
**Cleanup**: System manages session lifecycle automatically

This session-based architecture ensures complete persistence of user interactions while maintaining efficient access patterns and enabling seamless resumption of work across app sessions.