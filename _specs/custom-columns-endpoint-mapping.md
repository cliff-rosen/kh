# Custom Columns Database Transactions

## Methods That Impact Custom Columns

| Operation Description | Frontend API Method | Backend Router Method | Service Methods Called |
|----------------------|-------------------|---------------------|----------------------|
| Extract features and add custom columns - User clicks "Apply N Columns" button| `smartSearchApi.extractFeatures()` | `smart_search.py` `@router.post("/extract-features")` `extract_features()` | `SmartSearchService.extract_features_parallel()` → `SmartSearchSessionService.update_custom_columns_and_features()` |
| Remove a custom column - User clicks X button on a column header. Column is removed from fe only | Frontend state management only | N/A - handled in UI | N/A - no database operation |
| Load existing session - User resumes a previous session| `smartSearchApi.getSession()` | `smart_search.py` `@router.get("/sessions/{session_id}")` `get_session()` | `SmartSearchSessionService.get_session()` |

## File Locations

### Frontend
- **API Client**: `frontend/src/lib/api/smartSearchApi.ts`
- **Results Component**: `frontend/src/components/features/smartsearch/ResultsStep.tsx`
- **Main Page**: `frontend/src/pages/SmartSearchLab.tsx`

### Backend
- **Router**: `backend/routers/smart_search.py`
- **Session Service**: `backend/services/smart_search_session_service.py`
- **Search Service**: `backend/services/smart_search_service.py`
- **Model**: `backend/models.py` (SmartSearchSession)

## Database Transaction Summary

### Custom Column Operations
1. **Adding columns**: Single transaction updates both `filtering_metadata['custom_columns']` and `filtered_articles[*].article.extracted_features`
2. **Removing columns**: Handled in frontend UI only - cleanup occurs during next feature extraction operation
3. **All database operations**: Include proper error handling with rollback on failure