# Channel Migration - Remaining Work

## ✅ Completed

1. **Schema & Types**
   - Backend schemas updated (ResearchStream, Channel, StreamInProgress)
   - Frontend types updated (Channel, ChannelInProgress)
   - SQLAlchemy model updated
   - Workflow config spec updated for channel-based queries

2. **Database Migration**
   - Migration script created (`migrations/migrate_to_channel_structure.py`)
   - NOT YET RUN - still needs to be executed

3. **API Layer**
   - Router request/response types updated
   - Service layer `create_research_stream()` updated
   - Frontend API types updated

## 🚧 Remaining Work

### 1. Run Database Migration
**File:** `migrations/migrate_to_channel_structure.py`
**Command:** `python migrations/migrate_to_channel_structure.py`
**Risk:** Breaking change - backup database first!

### 2. Update Stream Creation Chat Workflow
**File:** `services/research_stream_creation_workflow.py`
**Changes needed:**
- Update state machine steps (remove business_goals, expected_outcomes, etc.)
- Add channel collection logic
- Update prompts to collect: name, focus, type, keywords per channel
- Generate proper StreamBuildChatPayload with channels

### 3. Update Stream Chat Service
**File:** `services/research_stream_chat_service.py`
**Changes needed:**
- Update `_parse_llm_response()` to handle channel data
- Update final stream creation to use channels
- Remove old field extraction logic

### 4. Update Manual Creation Form
**File:** `frontend/src/components/ResearchStreamForm.tsx`
**Changes needed:**
- Replace flat fields with channel builder UI
- Add/remove channel functionality
- For each channel: name, focus, type dropdown, keywords input
- Remove: description, business_goals, expected_outcomes, competitors

### 5. Update Stream Edit Form
**File:** `frontend/src/pages/StreamDetailPage.tsx`
**Changes needed:**
- Same as manual form
- Load existing channels for editing
- Allow adding/removing/editing channels

### 6. Update Context/State Management
**File:** `frontend/src/context/StreamChatContext.tsx`
**Changes needed:**
- Update `createStream()` call to use new API format
- Handle channel data in StreamInProgress state
- Update field updates to work with channels

### 7. Update Stream Config Preview
**File:** `frontend/src/components/StreamConfigPreview.tsx`
**Changes needed:**
- Display channels instead of flat fields
- Show each channel with its focus, type, keywords
- Remove old field displays

### 8. Testing & Verification
- Create new stream via chat interface
- Create new stream via manual form
- Edit existing stream
- Verify stream_type is computed correctly
- Verify workflow_config generation (Phase 2)

## Migration Strategy

**Recommended order:**
1. ✅ Backup database
2. ✅ Run migration script
3. Update chat workflow service (most complex)
4. Update manual form (simpler, good for testing)
5. Update edit form
6. Update context/preview components
7. Test end-to-end

## Breaking Changes Alert

⚠️ **After migration runs:**
- All API calls must use new channel structure
- Old streams will have channels auto-generated from focus_areas
- Frontend must be updated before users can access

## Rollback Plan

If migration fails:
1. Restore database from backup
2. Revert code changes
3. Redeploy previous version
