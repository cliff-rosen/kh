# Async SQLAlchemy Migration Tracker

## Overview

Migration from sync SQLAlchemy to async SQLAlchemy 2.0 with proper service class pattern.

**Target Pattern:**
- Service classes accept `Session | AsyncSession` in constructor
- Async methods defined on the service class (not standalone functions)
- Dependency injection via `Depends(get_async_<service>_service)`
- Routers use DI to get service instances

---

## Service Files

| Service File | Standalone Funcs | Class Async Methods | DI Provider | Standalone Removed | Status |
|--------------|------------------|---------------------|-------------|-------------------|--------|
| report_service.py | 0 | Yes (16) | Yes | Yes | **✅ Done** |
| chat_service.py | 5 | No | No | No | **Needs Refactor** |
| research_stream_service.py | 8 | No | No | No | **Needs Refactor** |
| operations_service.py | 4 | No | No | No | **Needs Refactor** |
| user_service.py | 0 | No | No | N/A | **Not Started** |
| wip_article_service.py | 0 | No | No | N/A | **Not Started** |
| chat_stream_service.py | 0 | No | No | N/A | **Not Started** |
| user_tracking_service.py | 0 | No | No | N/A | **Not Started** |

**Legend:**
- Standalone Funcs: Count of `async def async_*` standalone functions currently in file
- Class Async Methods: Async methods added to the service class
- DI Provider: `get_async_<name>_service()` dependency function created
- Standalone Removed: Old standalone functions deleted after refactor

---

## Router Files

| Router File | Total Endpoints | Using AsyncSession | Using Service DI | Fully Migrated | Status |
|-------------|-----------------|-------------------|------------------|----------------|--------|
| reports.py | 11 | 0 | 11 | Yes | **✅ Done** |
| chat.py | 4 | 4 | 0 | No | **Needs Refactor** |
| research_streams.py | 17 | 8 | 0 | No | **Partial** |
| operations.py | 8 | 4 | 0 | No | **Partial** |
| curation.py | 16 | 3 | 0 | No | **Partial** |
| auth.py | 7 | 0 | 0 | No | **Not Started** |
| chat_stream.py | 1 | 0 | 0 | No | **Not Started** |
| dashboard.py | 2 | 2 | 0 | No | **Needs Refactor** |

**Legend:**
- Total Endpoints: Number of route handlers in file
- Using AsyncSession: Endpoints using `AsyncSession = Depends(get_async_db)`
- Using Service DI: Endpoints using `service = Depends(get_async_*_service)`
- Fully Migrated: All endpoints use async + service DI pattern

---

## Detailed Endpoint Status

### chat.py (4 endpoints)
| Endpoint | Method | AsyncSession | Service DI | Status |
|----------|--------|--------------|------------|--------|
| list_chats | GET / | Yes | No | Needs DI |
| get_chat | GET /{id} | Yes | No | Needs DI |
| admin_list_chats | GET /admin/all | Yes | No | Needs DI |
| admin_get_chat | GET /admin/{id} | Yes | No | Needs DI |

### reports.py (11 endpoints) ✅ COMPLETE
| Endpoint | Method | AsyncSession | Service DI | Status |
|----------|--------|--------------|------------|--------|
| get_recent_reports | GET /recent | No | Yes | ✅ Done |
| get_reports_for_stream | GET /stream/{id} | No | Yes | ✅ Done |
| get_report_with_articles | GET /{id} | No | Yes | ✅ Done |
| delete_report | DELETE /{id} | No | Yes | ✅ Done |
| update_article_notes | PATCH /{id}/articles/{aid}/notes | No | Yes | ✅ Done |
| update_article_enrichments | PATCH /{id}/articles/{aid}/enrichments | No | Yes | ✅ Done |
| get_article_metadata | GET /{id}/articles/{aid}/metadata | No | Yes | ✅ Done |
| get_report_email | GET /{id}/email | No | Yes | ✅ Done |
| store_report_email | POST /{id}/email/store | No | Yes | ✅ Done |
| generate_report_email | POST /{id}/email/generate | No | Yes | ✅ Done |
| send_report_email | POST /{id}/email/send | No | Yes | ✅ Done |

### research_streams.py (17 endpoints)
| Endpoint | Method | AsyncSession | Service DI | Status |
|----------|--------|--------------|------------|--------|
| get_research_streams | GET / | Yes | No | Needs DI |
| get_research_stream | GET /{id} | Yes | No | Needs DI |
| create_research_stream | POST / | Yes | No | Needs DI |
| update_research_stream | PUT /{id} | Yes | No | Needs DI |
| delete_research_stream | DELETE /{id} | Yes | No | Needs DI |
| toggle_status | PATCH /{id}/status | Yes | No | Needs DI |
| update_broad_query | PATCH /{id}/retrieval-config/queries/{idx} | Yes | No | Needs DI |
| update_semantic_filter | PATCH /{id}/.../semantic-filter | Yes | No | Needs DI |
| propose_concepts | POST /{id}/retrieval/propose-concepts | No | No | Not Started |
| propose_broad_search | POST /{id}/retrieval/propose-broad-search | No | No | Not Started |
| generate_broad_filter | POST /{id}/retrieval/generate-broad-filter | No | No | Not Started |
| generate_concept_query | POST /{id}/retrieval/generate-concept-query | No | No | Not Started |
| generate_concept_filter | POST /{id}/retrieval/generate-concept-filter | No | No | Not Started |
| validate_concepts | POST /{id}/retrieval/validate-concepts | No | No | Not Started |
| test_source_query | POST /{id}/test-query | No | No | Not Started |
| execute_pipeline | POST /{id}/execute-pipeline | No | No | Not Started |
| compare_report | POST /reports/{id}/compare | No | No | Not Started |

### operations.py (8 endpoints)
| Endpoint | Method | AsyncSession | Service DI | Status |
|----------|--------|--------------|------------|--------|
| get_execution_queue | GET /executions | Yes | No | Needs DI |
| get_execution_detail | GET /executions/{id} | Yes | No | Needs DI |
| get_scheduled_streams | GET /streams/scheduled | Yes | No | Needs DI |
| update_stream_schedule | PATCH /streams/{id}/schedule | Yes | No | Needs DI |
| trigger_run | POST /runs | N/A | N/A | Done (no DB) |
| get_run_status | GET /runs/{id} | N/A | N/A | Done (no DB) |
| stream_run_status | GET /runs/{id}/stream | N/A | N/A | Done (no DB) |
| cancel_run | DELETE /runs/{id} | N/A | N/A | Done (no DB) |

### curation.py (16 endpoints)
| Endpoint | Method | AsyncSession | Service DI | Status |
|----------|--------|--------------|------------|--------|
| get_curation_view | GET /{id}/curation | No | No | Not Started |
| get_curation_history | GET /{id}/curation/history | Yes | No | Needs DI |
| get_pipeline_analytics | GET /{id}/pipeline-analytics | No | No | Not Started |
| exclude_article | POST /{id}/articles/{aid}/exclude | No | No | Not Started |
| include_article | POST /{id}/articles/include | No | No | Not Started |
| reset_curation | POST /{id}/articles/{wid}/reset | No | No | Not Started |
| update_wip_notes | PATCH /{id}/wip-articles/{wid}/notes | No | No | Not Started |
| update_article | PATCH /{id}/articles/{aid} | No | No | Not Started |
| update_content | PATCH /{id}/content | No | No | Not Started |
| send_approval_request | POST /{id}/request-approval | No | No | Not Started |
| approve_report | POST /{id}/approve | Yes | No | Needs DI |
| reject_report | POST /{id}/reject | Yes | No | Needs DI |
| regen_exec_summary | POST /{id}/regenerate/executive-summary | No | No | Not Started |
| regen_cat_summary | POST /{id}/regenerate/category-summary/{cid} | No | No | Not Started |
| regen_article_summary | POST /{id}/articles/{aid}/regenerate-summary | No | No | Not Started |

### auth.py (7 endpoints)
| Endpoint | Method | AsyncSession | Service DI | Status |
|----------|--------|--------------|------------|--------|
| login | POST /login | No | No | Not Started |
| register | POST /register | No | No | Not Started |
| me | GET /me | No | No | Not Started |
| refresh | POST /refresh | No | No | Not Started |
| logout | POST /logout | No | No | Not Started |
| change_password | POST /change-password | No | No | Not Started |
| get_admins | GET /admins | No | No | Not Started |

### chat_stream.py (1 endpoint)
| Endpoint | Method | AsyncSession | Service DI | Status |
|----------|--------|--------------|------------|--------|
| chat_stream | POST /stream | No | No | Not Started (Complex) |

### dashboard.py (2 endpoints)
| Endpoint | Method | AsyncSession | Service DI | Status |
|----------|--------|--------------|------------|--------|
| get_dashboard | GET / | Yes | No | Needs DI |
| get_dashboard_reports | GET /reports | Yes | No | Needs DI |

---

## Migration Order (Recommended)

1. **operations_service.py** - Smallest, good to establish pattern
2. **chat_service.py** - Small, straightforward
3. **research_stream_service.py** - Medium complexity
4. **report_service.py** - Largest, most complex
5. **user_service.py** - Needed for auth.py
6. **wip_article_service.py** - Needed for curation.py
7. **chat_stream_service.py** - Complex, do last

---

## Progress Summary

| Category | Total | Completed | In Progress | Not Started |
|----------|-------|-----------|-------------|-------------|
| Service Files | 8 | 1 | 3 | 4 |
| Router Files | 8 | 1 | 4 | 3 |
| Total Endpoints | 66 | 15 | 22 | 29 |

**Last Updated:** 2025-01-18
