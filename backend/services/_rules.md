# Services Layer Rules & Best Practices

## Database Dependency Injection Pattern

### Standard Approach: Dependency Functions
Use **dependency functions** instead of manual service instantiation to maintain consistency with FastAPI patterns.

#### ✅ PREFERRED Pattern
```python
# In service file
async def get_user_session_service(db: Session = Depends(get_db)) -> UserSessionService:
    return UserSessionService(db)

async def get_mission_service(db: Session = Depends(get_db)) -> MissionService:
    return MissionService(db)

# In router
@router.post("/endpoint")
async def endpoint(
    session_service: UserSessionService = Depends(get_user_session_service),
    mission_service: MissionService = Depends(get_mission_service)
):
    # Use services directly - no DB injection needed
    session = session_service.get_active_session(user_id)
```

#### ❌ AVOID Pattern
```python
# In router - DON'T DO THIS
@router.post("/endpoint")
async def endpoint(
    db: Session = Depends(get_db)  # Manual DB injection
):
    session_service = UserSessionService(db)  # Manual instantiation
    mission_service = MissionService(db)     # Manual instantiation
```

### Benefits of Dependency Functions
1. **Consistency**: Matches FastAPI's dependency injection philosophy
2. **Cleaner routers**: No manual service instantiation
3. **Easier testing**: Can mock individual services
4. **Better separation**: Services don't leak database concerns to callers

## Service Class Design

### Constructor Pattern
```python
class MyService:
    def __init__(self, db: Session):
        self.db = db
    
    async def my_method(self, param: str) -> Result:
        # Use self.db for database operations
        return self.db.query(...).first()
```

### Dependency Function Pattern
```python
async def get_my_service(db: Session = Depends(get_db)) -> MyService:
    return MyService(db)
```

## Error Handling

### Service Methods Should
- Raise domain-specific exceptions (ValidationError, NotFoundError)
- Log errors appropriately
- Handle database transaction rollbacks
- Return well-typed results

### Example
```python
async def create_resource(self, data: CreateRequest) -> Resource:
    try:
        resource = Resource(...)
        self.db.add(resource)
        self.db.commit()
        return resource
    except Exception as e:
        self.db.rollback()
        logger.error(f"Failed to create resource: {str(e)}")
        raise ValidationError(f"Resource creation failed: {str(e)}")
```

## Testing

### Mock Services in Tests
```python
# Test setup
def mock_user_session_service():
    mock_service = Mock(spec=UserSessionService)
    mock_service.get_active_session.return_value = mock_session
    return mock_service

# In test
app.dependency_overrides[get_user_session_service] = mock_user_session_service
```

## State Transition Service

### Tool Step Completion for Testing

The StateTransitionService now supports tool step completion for testing purposes through the `COMPLETE_TOOL_STEP` transaction type.

#### Features
- Simulates successful tool step execution without running actual tools
- Generates realistic output data based on result_mapping
- Creates output assets in the hop scope
- Tracks hop progress and completion status
- Updates tool step status to COMPLETED with timestamps

#### Usage
```python
# Via API endpoint
POST /state-transitions/execute
{
    "transaction_type": "complete_tool_step",
    "data": {
        "tool_step_id": "step-123",
        "simulated_output": {
            "custom_output": "Override default simulation"
        }
    }
}

# Via service directly
result = await state_transition_service.updateState(
    TransactionType.COMPLETE_TOOL_STEP,
    {
        "tool_step_id": tool_step_id,
        "user_id": user_id,
        "simulated_output": {"custom_data": "test"}
    }
)
```

#### Output Generation
- Analyzes result_mapping to determine expected outputs
- Creates realistic simulated data based on output name patterns
- Supports text, JSON, file, URL, and numeric outputs
- Allows custom output via `simulated_output` parameter

#### Asset Creation
- Creates output assets in hop scope based on result_mapping
- Determines asset type automatically from output data
- Includes metadata marking assets as simulated
- Links assets to generating tool step

## Migration Strategy

When refactoring existing services:
1. Keep existing service class unchanged
2. Add dependency function
3. Update routers to use dependency function
4. Remove manual DB injection from routers
5. Update tests to use dependency overrides 