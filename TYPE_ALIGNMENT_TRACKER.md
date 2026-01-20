# Type Alignment Tracker

Tracking alignment between frontend TypeScript types (`frontend/src/types/`) and backend Pydantic schemas (`backend/schemas/`).

## Status Legend
- ✅ Aligned - Structure and section order match
- 🔄 In Progress - Currently being reviewed
- ⏳ Needs Review - Not yet examined
- ⚠️ Has Issues - Known problems to fix
- ❓ Possibly Unused - May be dead code

## Matched Pairs

| Frontend | Backend | Status | Notes |
|----------|---------|--------|-------|
| `research-stream.ts` | `research_stream.py` | ✅ Aligned | |
| `semantic-space.ts` | `semantic_space.py` | ✅ Aligned | |
| `report.ts` | `report.py` | ✅ Aligned | |
| `canonical_types.ts` | `canonical_types.py` | ✅ Aligned | Backend has extra types: CanonicalExtractedFeature, CanonicalPubMedExtraction, CanonicalScoredArticle |
| `user.ts` | `user.py` | ✅ Aligned | Frontend has AuthUser (client-only), backend has TokenData (server-only) |
| `article.ts` | `article.py` | ✅ Aligned | Simple single-type files |
| `llm.ts` | `llm.py` | ✅ Aligned | Backend has extra Message Types section |
| `organization.ts` | `organization.py` | ✅ Aligned | Fixed exports; re-exports UserRole/OrgMember from user.ts |
| `chat.ts` | `chat.py` | ✅ Aligned | Already well organized |
| `document_analysis.ts` | `document_analysis.py` | ✅ Aligned | Backend has extra LLM Response Schemas |
| `entity-extraction.ts` | `entity_extraction.py` | ✅ Aligned | Backend has extra StudyType, ArticleArchetype types |
| `workbench.ts` | `workbench.py` | 🗑️ Deleted | Was dead code - nothing imported these files |
| `canonical-study.ts` | `canonical_study.py` | ✅ Aligned | |

## Frontend Only (no backend match)
- `articleCollection.ts` - 🗑️ Deleted (was dead code)
- `base.ts`
- `result.ts`
- `unifiedSearch.ts`
- `smartsearch2.ts`
- `index.ts`

## Backend Only (no frontend match)
- `agent_responses.py`
- `archetype_config.py`
- `auth.py`
- `base.py`
- `features.py`
- `lab.py`
- `newsletter.py`
- `pattern_graph_config.py`
- `research_article_converters.py`
- `research_features.py`
- `resource.py`
- `schema_utils.py`
- `smart_search.py`
- `sources.py`
- `payloads.py`
- `stream_building.py`

## Work Log

### 2026-01-19
- ✅ Aligned `research-stream.ts` / `research_stream.py`
- ✅ Aligned `semantic-space.ts` / `semantic_space.py`
- ✅ Fixed ImportanceLevel enum mismatch
- ✅ Aligned `report.ts` / `report.py` - added section headers
- ✅ Aligned `canonical_types.ts` / `canonical_types.py` - standardized section headers
- ✅ Aligned `user.ts` / `user.py` - added section headers
- ✅ Aligned `article.ts` / `article.py` - added file header comments
- ✅ Fixed `organization.ts` - re-exports UserRole/OrgMember for backwards compatibility
- ✅ Aligned `organization.ts` / `organization.py` - standardized section headers
- ✅ Aligned `llm.ts` / `llm.py` - added cross-reference headers
- ✅ Aligned `chat.ts` / `chat.py` - added cross-reference headers
- ✅ Aligned `document_analysis.ts` / `document_analysis.py` - added cross-reference headers
- ✅ Aligned `entity-extraction.ts` / `entity_extraction.py` - added section headers
- 🗑️ Deleted `workbench.ts`, `workbench.py`, `articleCollection.ts` - dead code, nothing imported these
- ✅ Aligned `canonical-study.ts` / `canonical_study.py` - added cross-reference headers
