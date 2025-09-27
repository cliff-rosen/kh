# Mission Representation Strategy

This document outlines the systematic approach for handling mission representations throughout the application. This replaces the previous ad hoc transformation functions scattered across the codebase.

## Overview

The application uses multiple representations of missions for different contexts and purposes. To maintain consistency and reduce code duplication, we've centralized all transformation logic into dedicated services.

## Mission Representations

### 1. Mission (Full Schema)
- **Location**: `schemas/workflow.py`
- **Purpose**: Complete business logic representation
- **Usage**: Primary working format for application logic
- **Features**: Full asset management, hop tracking, metadata

```python
from schemas.workflow import Mission

mission = Mission(
    id="mission-123",
    name="Data Analysis Mission",
    goal="Analyze customer data trends",
    mission_state={"asset-1": asset_obj},
    status=MissionStatus.PROPOSED
)
```

### 2. MissionModel (SQLAlchemy)
- **Location**: `models.py`
- **Purpose**: Database persistence representation
- **Usage**: Database operations only
- **Features**: ORM relationships, database constraints

```python
from models import Mission as MissionModel

mission_model = MissionModel(
    id="mission-123",
    user_id=user_id,
    name="Data Analysis Mission",
    status=MissionStatus.PROPOSED
)
```

### 3. MissionLite
- **Location**: `schemas/lite_models.py`
- **Purpose**: Simplified representation for LLM proposals
- **Usage**: Mission creation, LLM interactions
- **Features**: Essential fields only, simplified asset definitions

```python
from schemas.lite_models import MissionLite

mission_lite = MissionLite(
    name="Data Analysis Mission",
    goal="Analyze customer data trends",
    inputs=[asset_lite_1, asset_lite_2],
    outputs=[output_asset_lite]
)
```

### 4. SanitizedMission
- **Location**: `services/mission_transformer.py`
- **Purpose**: Lightweight representation for chat contexts
- **Usage**: Chat interfaces, user-facing displays
- **Features**: No large content values, summarized assets

### 5. SerializedMission
- **Location**: `services/mission_transformer.py`
- **Purpose**: JSON-serializable representation for state management
- **Usage**: Agent state, workflow persistence, API responses
- **Features**: Full JSON serialization, datetime strings

## Centralized Services

### MissionTransformer

Primary service for converting between mission representations.

```python
from services.mission_transformer import MissionTransformer
from services.asset_service import AssetService

# Initialize with asset service for full functionality
asset_service = AssetService(db)
transformer = MissionTransformer(asset_service)

# Convert between representations
mission_model = transformer.schema_to_model(mission_schema, user_id)
mission_schema = await transformer.model_to_schema(mission_model)
mission_lite = transformer.schema_to_lite(mission_schema)
sanitized = transformer.sanitize_for_chat(mission_schema)
serialized = transformer.serialize_for_state(mission_schema)
```

#### Available Transformations

| From | To | Method | Notes |
|------|----|---------| ------|
| Mission | MissionModel | `schema_to_model(mission, user_id)` | For database persistence |
| MissionModel | Mission | `model_to_schema(model, load_assets=True)` | Loads assets by default |
| Mission | MissionLite | `schema_to_lite(mission)` | For LLM proposals |
| MissionLite | Mission | `lite_to_schema(mission_lite)` | Creates full mission |
| Mission | SanitizedMission | `sanitize_for_chat(mission)` | For chat contexts |
| Mission | SerializedMission | `serialize_for_state(mission)` | For state management |

### MissionContextBuilder

Service for preparing missions for different application contexts.

```python
from services.mission_context_builder import MissionContextBuilder

# Initialize with services
context_builder = MissionContextBuilder(asset_service, mission_transformer)

# Prepare context for different use cases
chat_context = await context_builder.prepare_chat_context(mission, user_id, db)
api_context = await context_builder.prepare_api_context(mission, include_assets=True)
state_context = context_builder.prepare_state_context(mission)
agent_context = await context_builder.prepare_agent_context(mission, user_id, db)
frontend_context = context_builder.prepare_frontend_context(mission)
```

#### Context Types

| Context | Method | Purpose | Includes |
|---------|--------|---------|----------|
| Chat | `prepare_chat_context()` | Chat interfaces | Sanitized mission, asset summaries |
| API | `prepare_api_context()` | API responses | Full/filtered mission data, statistics |
| State | `prepare_state_context()` | State management | Serialized mission, metadata |
| Agent | `prepare_agent_context()` | Agent processing | Mission + analysis + tools |
| Frontend | `prepare_frontend_context()` | UI components | Mission + computed fields + UI metadata |

## Usage Patterns

### 1. Creating a Mission

```python
# From LLM proposal
mission_lite = MissionLite(...)
mission = transformer.lite_to_schema(mission_lite)
mission_id = await mission_service.create_mission(user_id, mission)

# Direct creation
mission = Mission(...)
mission_id = await mission_service.create_mission(user_id, mission)
```

### 2. Loading a Mission

```python
# Load with assets
mission = await mission_service.get_mission(mission_id, user_id)

# Load without assets (faster)
mission_model = db.query(MissionModel).filter(...).first()
mission = await transformer.model_to_schema(mission_model, load_assets=False)
```

### 3. Preparing Chat Context

```python
# Use centralized context builder
context_builder = MissionContextBuilder(asset_service)
chat_payload = await context_builder.prepare_chat_context(
    mission=mission,
    user_id=user_id,
    db=db,
    additional_payload={"custom_data": "value"}
)

# Legacy approach (deprecated)
from utils.mission_utils import prepare_chat_context
chat_payload = await prepare_chat_context(mission, user_id, db)
```

### 4. API Responses

```python
# Full mission data
api_context = await context_builder.prepare_api_context(mission)

# Lightweight mission data
api_context = await context_builder.prepare_api_context(
    mission, 
    include_assets=False,
    include_hops=False
)
```

### 5. State Management

```python
# Serialize for agent state
state_context = context_builder.prepare_state_context(mission)
agent_state = {
    "messages": messages,
    **state_context
}

# Direct serialization
serialized = transformer.serialize_for_state(mission)
```

## Migration Guide

### Replacing Ad Hoc Functions

| Old Function | New Approach | Location |
|--------------|--------------|----------|
| `_model_to_mission()` | `transformer.model_to_schema()` | MissionTransformer |
| `sanitize_mission_for_chat()` | `transformer.sanitize_for_chat()` | MissionTransformer |
| `prepare_chat_context()` | `context_builder.prepare_chat_context()` | MissionContextBuilder |
| `enrich_chat_context_with_assets()` | Included in `prepare_chat_context()` | MissionContextBuilder |
| Status mapping functions | `transformer._map_*_status()` | MissionTransformer |

### Example Migration

**Before:**
```python
# Ad hoc transformation
def _model_to_mission(self, mission_model):
    # Manual conversion logic...
    return mission

# Ad hoc sanitization
def sanitize_mission_for_chat(mission):
    # Manual sanitization logic...
    return sanitized_dict

# Ad hoc context preparation
async def prepare_chat_context(mission, user_id, db):
    # Manual context building...
    return payload
```

**After:**
```python
# Centralized approach
transformer = MissionTransformer(asset_service)
context_builder = MissionContextBuilder(asset_service, transformer)

# Use centralized services
mission = await transformer.model_to_schema(mission_model)
sanitized = transformer.sanitize_for_chat(mission)
chat_context = await context_builder.prepare_chat_context(mission, user_id, db)
```

## Error Handling

The centralized services provide consistent error handling:

```python
from services.mission_transformer import MissionTransformationError

try:
    mission = await transformer.model_to_schema(mission_model)
except MissionTransformationError as e:
    logger.error(f"Failed to transform mission: {e}")
    # Handle transformation error
except Exception as e:
    logger.error(f"Unexpected error: {e}")
    # Handle general error
```

## Best Practices

### 1. Service Initialization
- Initialize services once per request/operation
- Pass AssetService for full functionality
- Reuse transformer instances when possible

### 2. Context Selection
- Use appropriate context type for each use case
- Chat contexts for user interfaces
- API contexts for external integrations
- State contexts for agent processing

### 3. Asset Loading
- Load assets when needed for business logic
- Skip asset loading for lightweight operations
- Use sanitized representations for display

### 4. Error Handling
- Catch MissionTransformationError specifically
- Provide fallback behavior for failed transformations
- Log errors with context for debugging

### 5. Performance
- Reuse transformer instances
- Skip unnecessary asset loading
- Use appropriate context granularity

## Future Enhancements

### Planned Features
1. Caching layer for expensive transformations
2. Validation layer for transformation integrity
3. Metrics and monitoring for transformation performance
4. Batch transformation operations
5. Configuration-driven transformation rules

### Extension Points
- Custom transformation strategies
- Plugin-based context builders
- Dynamic representation formats
- Conditional asset loading strategies 