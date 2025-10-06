# Channel-Based Stream Structure Migration - Summary

## Overview
Migrated research streams from flat field structure to hierarchical channel-based structure.

## Key Changes

### Conceptual Model
**Before:** Stream with flat fields (focus_areas[], keywords[], etc.)
**After:** Stream with channels, each channel = focus + type + keywords

### Stream Type Derivation
- Stream type is now **computed** from channels
- Homogeneous channels (all same type) → that type
- Heterogeneous channels (mixed types) → StreamType.MIXED
- No longer stored in database

### Field Consolidation
**Removed:**
- `description` (redundant with purpose)
- `business_goals` (vague, merged into purpose)
- `expected_outcomes` (redundant with purpose)
- `competitors` (not needed)
- `focus_areas` (became channels)
- `keywords` (moved into channels)
- `stream_type` (computed property)

**Kept:**
- `stream_name`
- `purpose` (why stream exists, what questions it answers)
- `report_frequency`
- `scoring_config`

**Added:**
- `channels` (JSONB array)
- `workflow_config` (JSONB for source retrieval)

## Data Structures

### Channel
```json
{
  "name": "Melanocortin Pathways",
  "focus": "Track competitive landscape in MC4R agonist development",
  "type": "competitive",
  "keywords": ["melanocortin", "MCR1", "MCR4", "MC4R"]
}
```

### Workflow Config
```json
{
  "sources": [
    {
      "source_type": "pubmed",
      "enabled": true,
      "channel_queries": [
        {
          "channel_name": "Melanocortin Pathways",
          "query": "melanocortin OR MCR1 OR MCR4"
        }
      ]
    }
  ],
  "semantic_filter": "...",
  "scoring": {...}
}
```

## Database Migration

**Migration file:** `migrations/migrate_to_channel_structure.py`

**Steps:**
1. Add `workflow_config` (JSONB, nullable)
2. Add `channels` (JSONB, nullable temporarily)
3. Migrate existing data → create channels from focus_areas + keywords
4. Make `channels` NOT NULL
5. Drop old columns (description, business_goals, expected_outcomes, competitors, keywords, focus_areas)

**Data Migration Logic:**
- If stream has focus_areas → create one channel per focus area
- Each channel gets: name=area, focus=purpose, type=stream_type, keywords=keywords
- If no focus_areas → create single channel from stream_name

## Type Updates

### Backend
- `schemas/research_stream.py` - Added Channel, updated ResearchStream with @computed_field
- `schemas/stream_building.py` - Added ChannelInProgress, simplified StreamBuildStep enum
- `models.py` - Updated ResearchStream SQLAlchemy model

### Frontend
- `types/research-stream.ts` - Added Channel, WorkflowConfig interfaces
- `types/stream-building.ts` - Added ChannelInProgress, simplified build steps

## Workflow Build Steps

**Old steps:**
exploration → purpose → business_goals → expected_outcomes → stream_name → stream_type → focus_areas → keywords → competitors → report_frequency → review

**New steps:**
exploration → stream_name → purpose → channels → report_frequency → review

## Next Steps (Not Yet Implemented)

1. **Update API endpoints** - Research stream CRUD to use channels
2. **Update chat workflow** - AI conversation to collect channels
3. **Update manual form** - UI for adding/editing channels
4. **Update edit form** - Edit existing stream channels
5. **Workflow config generation** - Auto-generate from channels
6. **Run migration** - Apply database changes

## Breaking Changes

⚠️ **API contract changes:**
- All create/update stream requests must use `channels` array
- Remove `focus_areas`, `keywords`, `competitors`, `description`, `business_goals`, `expected_outcomes`
- `stream_type` is now read-only computed field

⚠️ **Database schema changes:**
- Multiple columns dropped
- Data migration required for existing streams
