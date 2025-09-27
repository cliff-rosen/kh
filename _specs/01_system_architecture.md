# System Architecture - JAM Bot

## Core Design Philosophy

### 1. Dual Representation Pattern

The system operates on two complementary representations:

- **Essence Representation**: Simplified models for LLM processing (`AssetLite`, `MissionLite`, `HopLite`)
- **Full Implementation**: Complete models with relationships and metadata (`Asset`, `Mission`, `Hop`)

**Rationale**: LLMs work more effectively with clean, focused data structures, while the database requires comprehensive relational integrity.

### 2. Chat-First Interaction Model

All user interactions flow through a unified chat interface:

- **Direct Actions**: Simple approvals bypass chat → API → Database
- **AI Workflows**: Complex requests → Chat → Agent Processing → Database
- **Real-time Streaming**: Agent responses stream back through chat system
- **Context Preservation**: Full conversation history maintained across sessions

### 3. Asset Scoping Strategy

Assets are scoped to specific lifecycle contexts:

- **Mission-Scoped Assets**: Persist throughout mission lifecycle
  - Mission inputs/outputs (permanent deliverables)
  - Mission intermediates (working artifacts that persist)
- **Hop-Scoped Assets**: Temporary execution artifacts
  - Tool working data that doesn't need to persist beyond hop execution

### 4. State Machine Architecture

**Two-Level State Management**:
- **Mission Level**: Simple lifecycle states (`AWAITING_APPROVAL`, `IN_PROGRESS`, `COMPLETED`)
- **Hop Level**: Detailed workflow states when mission is active (9 distinct states)

**Atomic Transitions**: All state changes happen atomically with proper validation and rollback.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                        │
├─────────────────────────────────────────────────────────────────┤
│  AuthContext → SessionContext → JamBotContext → Chat UI        │
│      ↓             ↓              ↓              ↓             │
│  User Auth    Session State   Mission State   Chat Interface   │
└─────────────────────────────────────────────────────────────────┘
                            ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Services                          │
├─────────────────────────────────────────────────────────────────┤
│  Chat Router → Primary Agent → StateTransitionService         │
│      ↓             ↓                ↓                          │
│  Message Proc   AI Processing   Database Updates              │
│                     ↓                ↓                          │
│              Specialist Nodes   Entity Services               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL → SQLAlchemy Models → Pydantic Schemas            │
│      ↓             ↓                    ↓                      │
│  Persistence   ORM Mapping        Business Logic              │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### Frontend Architecture

**Context Hierarchy**:
1. **AuthContext**: User authentication and token management
2. **SessionContext**: Persistent user sessions across browser restarts
3. **JamBotContext**: Mission state and chat message management
4. **Chat UI**: Real-time interface with streaming responses

**Key Features**:
- **Session Recovery**: Automatic restoration of user context
- **Real-time Updates**: WebSocket-based streaming from agents
- **State Synchronization**: Frontend state stays in sync with backend
- **Offline Resilience**: Graceful handling of connection issues

### Backend Architecture

**Primary Agent System**:
- **LangGraph-based**: Stateful agent workflow management
- **Specialist Nodes**: Domain-specific AI processing (Mission Specialist, Hop Designer, Hop Implementer)
- **Streaming Responses**: Real-time communication with frontend
- **State Persistence**: Atomic database updates through StateTransitionService

**Service Layer**:
- **StateTransitionService**: Unified interface for all state changes
- **AssetService**: Asset lifecycle management
- **AssetMappingService**: Asset-to-entity relationship management
- **UserSessionService**: Session persistence and recovery

### Data Architecture

**Database Models** (SQLAlchemy):
- Core entities with `user_id` fields for security isolation
- Foreign key relationships for data integrity
- Mapping tables for asset relationships (`MissionAsset`, `HopAsset`)

**Business Schemas** (Pydantic):
- User context already established (no `user_id` fields)
- Loaded relationships for complete business objects
- Type-safe interfaces for all operations

## Integration Patterns

### Session Management Integration

**Automatic Linking**:
- New missions automatically link to active user session
- Chat messages persist within session context
- Session recovery loads full conversation and mission state

**Session Lifecycle**:
```
Login → Session Recovery → Active Session → Auto-save → Logout/Complete
```

### Asset Management Integration

**Creation Patterns**:
- **Mission Assets**: Created during mission proposal and hop planning
- **Hop Assets**: Created during tool execution for intermediate data
- **Mapping Tables**: Many-to-many relationships with role tracking

**Lifecycle Management**:
- Mission assets persist throughout mission lifecycle
- Hop assets are temporary and discarded after hop completion
- Asset promotion not needed (mission outputs created directly at mission scope)

### State Transition Integration

**Unified Interface**:
- Single `updateState(transaction_type, data)` method for all transitions
- Atomic database operations with automatic rollback on failure
- Consistent validation and error handling across all transitions

**Transaction Types**:
- Mission lifecycle: `PROPOSE_MISSION`, `ACCEPT_MISSION`, `COMPLETE_MISSION`
- Hop lifecycle: `PROPOSE_HOP_PLAN`, `ACCEPT_HOP_PLAN`, `PROPOSE_HOP_IMPL`, `ACCEPT_HOP_IMPL`, `EXECUTE_HOP`, `COMPLETE_HOP`
- Tool execution: `COMPLETE_TOOL_STEP`

## Security Architecture

### Authentication & Authorization
- **JWT-based**: Token validation on all backend endpoints
- **User Scoping**: All data operations automatically scoped to authenticated user
- **Session Security**: Sessions tied to user identity with automatic cleanup

### Data Protection
- **User Isolation**: Database queries automatically filtered by `user_id`
- **Asset Security**: Assets scoped to user through mission/hop ownership
- **Session Encryption**: Sensitive session metadata encrypted at rest

## Scalability Considerations

### Performance Patterns
- **Lazy Loading**: Session context loaded on-demand
- **Efficient Queries**: Optimized database relationships and indexes
- **Streaming Responses**: Real-time agent communication without blocking
- **Auto-save Optimization**: Debounced session updates to minimize database load

### Monitoring & Observability
- **Transaction Logging**: All state transitions logged with timestamps
- **Error Tracking**: Comprehensive error handling with rollback guarantees
- **Session Analytics**: Track user engagement patterns and session health

This architecture provides a robust foundation for complex AI-driven workflows while maintaining developer productivity, user experience quality, and system reliability.