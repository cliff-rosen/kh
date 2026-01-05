# Backend Practices Specification

This document defines the required practices for all backend code. These are not guidelines - they are requirements.

---

## 1. Architecture Layers

### Layer Responsibilities

```
┌─────────────────────────────────────────────────────────────┐
│  ROUTERS (routers/*.py)                                     │
│  - HTTP request/response handling                           │
│  - Input validation (via Pydantic schemas)                  │
│  - Authentication/authorization checks                      │
│  - Logging request entry and exit                           │
│  - Delegating ALL business logic to services                │
│  - NEVER access database directly                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVICES (services/*.py)                                   │
│  - Business logic                                           │
│  - Data transformation                                      │
│  - Orchestrating multiple operations                        │
│  - Access control logic                                     │
│  - Database queries (via SQLAlchemy)                        │
│  - External API calls                                       │
│  - Logging business operations and errors                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  MODELS (models/*.py)                                       │
│  - SQLAlchemy model definitions                             │
│  - Relationships                                            │
│  - Model-level validation                                   │
└─────────────────────────────────────────────────────────────┘
```

### What Routers MUST NOT Do

```python
# WRONG - Direct database access in router
@router.get("/{stream_id}")
async def get_stream(stream_id: int, db: Session = Depends(get_db)):
    stream = db.query(ResearchStream).filter(...).first()  # NO!
    return stream

# CORRECT - Delegate to service
@router.get("/{stream_id}")
async def get_stream(stream_id: int, db: Session = Depends(get_db)):
    service = ResearchStreamService(db)
    return service.get_stream(stream_id, current_user.user_id)
```

---

## 2. Logging Requirements

### Every Router MUST Have

```python
import logging

logger = logging.getLogger(__name__)
```

### Endpoint Logging Pattern

Every endpoint MUST log:
1. **Entry** - When the endpoint is called (INFO level)
2. **Exit** - When returning successfully (INFO level)
3. **Errors** - Any exceptions (ERROR level with exc_info)

```python
@router.post("/analyze")
async def analyze_document(
    request: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """Endpoint docstring."""
    # 1. Log entry
    logger.info(f"analyze_document called - user_id={current_user.user_id}")

    try:
        # 2. Delegate to service
        service = AnalysisService(db)
        result = await service.analyze(request.document_id)

        # 3. Log success
        logger.info(f"analyze_document complete - user_id={current_user.user_id}, doc_id={request.document_id}")
        return result

    except HTTPException:
        # Re-raise HTTP exceptions (already logged by service or intentional)
        raise
    except Exception as e:
        # 4. Log unexpected errors
        logger.error(f"analyze_document failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}"
        )
```

### What to Log

| Level | When | Example |
|-------|------|---------|
| DEBUG | Detailed diagnostic info | `logger.debug(f"Token expires in {seconds}s")` |
| INFO | Normal operations | `logger.info(f"Report generated - report_id={id}")` |
| WARNING | Recoverable issues | `logger.warning(f"Stream not found for user {user_id}")` |
| ERROR | Failures with exc_info | `logger.error(f"DB query failed: {e}", exc_info=True)` |

### Log Message Format

Always include context that helps debugging:
- `user_id` - Who made the request
- `resource_id` - What resource was affected (stream_id, report_id, etc.)
- `operation` - What was being attempted

```python
# GOOD
logger.info(f"delete_report - user_id={user_id}, report_id={report_id}")
logger.error(f"delete_report failed - user_id={user_id}, report_id={report_id}: {e}", exc_info=True)

# BAD
logger.info("Deleting report")
logger.error(str(e))
```

---

## 3. Exception Handling

### The Standard Pattern

```python
@router.post("/operation", response_model=ResponseSchema)
async def operation(
    request: RequestSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    logger.info(f"operation called - user_id={current_user.user_id}")

    try:
        service = MyService(db)
        result = service.do_operation(request, current_user.user_id)

        logger.info(f"operation complete - user_id={current_user.user_id}")
        return result

    except HTTPException:
        # Let HTTP exceptions pass through (service already decided the status code)
        raise
    except ValueError as e:
        # Known business logic errors
        logger.warning(f"operation validation failed - user_id={current_user.user_id}: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        # Unexpected errors
        logger.error(f"operation failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Operation failed: {str(e)}"
        )
```

### Service-Level Exceptions

Services should raise:
- `HTTPException` with appropriate status codes for client errors (400, 404, 403)
- Regular exceptions for unexpected errors (router converts to 500)

```python
# In service
class ReportService:
    def get_report(self, report_id: int, user_id: int) -> Report:
        report = self.db.query(Report).filter(Report.id == report_id).first()

        if not report:
            logger.warning(f"Report not found - report_id={report_id}, user_id={user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        if report.user_id != user_id:
            logger.warning(f"Unauthorized report access - report_id={report_id}, user_id={user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,  # Don't reveal existence
                detail="Report not found"
            )

        return report
```

---

## 4. Service Patterns

### Service Constructor

Services receive the database session in their constructor:

```python
class ReportService:
    def __init__(self, db: Session):
        self.db = db
        self.logger = logging.getLogger(__name__)
```

### Service Method Pattern

```python
def get_reports_for_user(self, user_id: int, limit: int = 50) -> List[Report]:
    """
    Get reports accessible to a user.

    Args:
        user_id: The user requesting reports
        limit: Maximum number of reports to return

    Returns:
        List of Report objects

    Raises:
        HTTPException: If user not found (404)
    """
    self.logger.info(f"get_reports_for_user - user_id={user_id}, limit={limit}")

    reports = self.db.query(Report).filter(
        Report.user_id == user_id
    ).limit(limit).all()

    self.logger.info(f"get_reports_for_user complete - user_id={user_id}, count={len(reports)}")
    return reports
```

---

## 5. Schemas and Models

### Where Schemas Live

| Schema Type | Location | Example |
|-------------|----------|---------|
| Endpoint request/response schemas | In the router file | `CreateReportRequest`, `ReportListResponse` |
| Domain objects | `schemas/{domain}.py` | `Report`, `ResearchStream`, `Article` |
| Shared/reusable schemas | `schemas/{domain}.py` | `PaginatedResponse`, `ArticleInfo` |
| Database models | `models/*.py` | SQLAlchemy ORM models |

### Router-Specific Schemas

Request and response schemas that are specific to a single endpoint or router should be defined in the router file itself:

```python
# routers/reports.py

from pydantic import BaseModel
from typing import Optional, List

# --- Request/Response Schemas (router-specific) ---

class UpdateReportNotesRequest(BaseModel):
    """Request to update notes on a report."""
    notes: Optional[str] = None


class ReportSummaryResponse(BaseModel):
    """Abbreviated report info for list views."""
    id: int
    title: str
    article_count: int
    created_at: str


class ReportsListResponse(BaseModel):
    """Paginated list of reports."""
    reports: List[ReportSummaryResponse]
    total: int


# --- Endpoints ---

@router.get("", response_model=ReportsListResponse)
async def list_reports(...):
    ...
```

### Domain Schemas

Schemas representing domain objects that are used across multiple routers or services belong in `schemas/`:

```python
# schemas/report.py

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ReportArticle(BaseModel):
    """An article within a report."""
    id: int
    pmid: str
    title: str
    abstract: Optional[str]
    relevance_score: float

class Report(BaseModel):
    """Full report domain object."""
    id: int
    stream_id: int
    title: str
    articles: List[ReportArticle]
    created_at: datetime

    class Config:
        from_attributes = True  # Allows creating from ORM models
```

### Models vs Schemas

- **Models** (`models/*.py`): SQLAlchemy ORM classes that map to database tables
- **Schemas** (`schemas/*.py`): Pydantic classes for validation and serialization

```python
# models/report.py - Database model
class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True)
    stream_id = Column(Integer, ForeignKey("research_streams.stream_id"))
    title = Column(String(255))
    # ... database-specific stuff

# schemas/report.py - API schema
class Report(BaseModel):
    id: int
    stream_id: int
    title: str
    # ... API-specific stuff, no SQLAlchemy dependencies
```

---

## 6. Typing Requirements

### Endpoint Response Models

Every endpoint MUST specify a `response_model`:

```python
# CORRECT - response_model specified
@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(report_id: int, ...):
    ...

@router.get("", response_model=List[ReportSummary])
async def list_reports(...):
    ...

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(report_id: int, ...):  # No response body, so no response_model needed
    ...

# WRONG - missing response_model
@router.get("/{report_id}")
async def get_report(report_id: int, ...):
    ...
```

### Service Method Typing

All service methods MUST have:
- Typed parameters
- Return type annotation
- Docstring describing the method

```python
# CORRECT - Fully typed
class ReportService:
    def __init__(self, db: Session):
        self.db = db

    def get_report(self, report_id: int, user_id: int) -> Report:
        """
        Get a report by ID.

        Args:
            report_id: The report to retrieve
            user_id: The requesting user (for access control)

        Returns:
            The Report object

        Raises:
            HTTPException: 404 if not found or not accessible
        """
        ...

    def get_reports_for_user(
        self,
        user_id: int,
        limit: int = 50,
        offset: int = 0
    ) -> List[Report]:
        """Get paginated reports for a user."""
        ...

    def create_report(
        self,
        stream_id: int,
        user_id: int,
        title: str,
        article_ids: List[int]
    ) -> Report:
        """Create a new report."""
        ...

# WRONG - No types, no docstring
class ReportService:
    def get_report(self, report_id, user_id):
        ...
```

### Use Optional and Union Correctly

```python
from typing import Optional, List, Union

# Optional = can be None
def get_user(self, user_id: int) -> Optional[User]:
    """Returns User or None if not found."""
    ...

# Use concrete types when None isn't valid
def get_user_or_raise(self, user_id: int) -> User:
    """Returns User or raises HTTPException."""
    ...

# List types
def get_articles(self, pmids: List[str]) -> List[Article]:
    ...
```

---

## 7. Access Control

### User ID Must Come From JWT

The `user_id` used for access control MUST come from the authenticated JWT token, never from request parameters:

```python
# CORRECT - user_id from JWT via dependency
@router.get("/{report_id}")
async def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)  # <-- user_id from JWT
):
    service = ReportService(db)
    return service.get_report(report_id, current_user.user_id)  # <-- use JWT user_id

# WRONG - user_id from request parameter (security vulnerability!)
@router.get("/{report_id}")
async def get_report(
    report_id: int,
    user_id: int,  # <-- NEVER DO THIS
    db: Session = Depends(get_db)
):
    service = ReportService(db)
    return service.get_report(report_id, user_id)  # <-- attacker can spoof any user_id
```

### Always Check User Access

Never trust that a resource belongs to a user just because they provided an ID:

```python
# WRONG - No access check
def get_stream(self, stream_id: int) -> ResearchStream:
    return self.db.query(ResearchStream).filter(
        ResearchStream.stream_id == stream_id
    ).first()

# CORRECT - Verify user access
def get_stream(self, stream_id: int, user_id: int) -> ResearchStream:
    stream = self.db.query(ResearchStream).filter(
        ResearchStream.stream_id == stream_id
    ).first()

    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    # Check access (user owns it, or it's shared with their org, etc.)
    if not self._user_can_access_stream(user_id, stream):
        raise HTTPException(status_code=404, detail="Stream not found")

    return stream
```

### Use 404 for Unauthorized Access

When a user tries to access a resource they don't own, return 404 (not 403) to avoid revealing the resource exists:

```python
# CORRECT - Don't reveal existence
raise HTTPException(status_code=404, detail="Report not found")

# WRONG - Reveals that the report exists
raise HTTPException(status_code=403, detail="Not authorized to access this report")
```

---

## 8. Admin Endpoints

Admin endpoints have different rules since admins legitimately need cross-user access:

```python
@router.get("/admin/streams")
async def admin_list_streams(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    # 1. Always verify admin role first
    if current_user.role != UserRole.PLATFORM_ADMIN:
        logger.warning(f"Unauthorized admin access attempt - user_id={current_user.user_id}")
        raise HTTPException(status_code=403, detail="Admin access required")

    logger.info(f"admin_list_streams - admin_user_id={current_user.user_id}")

    # 2. Admin can access all resources
    service = AdminService(db)
    return service.list_all_streams()
```

---

## 9. Checklist for New Endpoints

Before merging any new endpoint:

### Logging & Error Handling
- [ ] Router has `import logging` and `logger = logging.getLogger(__name__)`
- [ ] Endpoint logs entry with user_id and key parameters
- [ ] Endpoint logs successful completion
- [ ] Try/except block catches and logs unexpected exceptions
- [ ] HTTPExceptions are re-raised without modification

### Architecture
- [ ] All database access is through a service, not direct queries
- [ ] Endpoint-specific schemas defined in router file
- [ ] Domain schemas in `schemas/*.py`

### Typing
- [ ] `response_model` specified on endpoint (unless 204 No Content)
- [ ] All service methods have typed parameters and return types
- [ ] Service methods have docstrings

### Security
- [ ] **user_id comes from JWT (`current_user.user_id`), never from request parameters**
- [ ] User access is verified for any resource access
- [ ] Admin endpoints verify admin role before any operations
- [ ] Unauthorized access returns 404 (not 403) to avoid revealing existence

---

## 10. Existing Code Violations

The following files need to be updated to comply with these practices:

### Missing Logging (Priority 1)
- `routers/reports.py` - No logger, 9 endpoints
- `routers/chat.py` - No logger, 5 endpoints
- `routers/admin.py` - Has logger but missing entry/exit logs
- `routers/research_streams.py` - Has logger but inconsistent usage

### Direct Database Access (Priority 2)
- `routers/admin.py` - 16 direct queries
- `routers/auth.py` - 2 direct queries
- `routers/research_streams.py` - 3 direct queries

### Missing Exception Handling (Priority 1)
- `routers/reports.py` - 8 endpoints without try/except
- `routers/chat.py` - 5 endpoints without try/except
