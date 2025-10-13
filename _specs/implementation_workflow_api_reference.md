# Implementation Workflow API Reference

**Document Purpose**: End-to-end mapping of UX interactions to API calls in the Implementation Configuration workflow (Workflow 2)

**Last Updated**: 2025-10-12

---

## Overview

This document maps every user interaction in the Implementation Configuration workflow to its corresponding API endpoint. The workflow consists of multiple steps that guide users through configuring sources, queries, and filters for each channel in a research stream.

---

## Workflow Steps & API Endpoints

### 1. Source Selection Step

**Component**: `SourceSelectionStep.tsx`

| User Action | API Method | API Endpoint | Frontend API Call | Request Payload | Response Type |
|-------------|------------|--------------|-------------------|-----------------|---------------|
| Select sources checkboxes → Click "Confirm Sources" | `PUT` | `/api/research-streams/{stream_id}` | `researchStreamApi.updateResearchStream()` | `{ workflow_config }` | `ResearchStream` |

**Details**:
- User selects which information sources (PubMed, arXiv, etc.) to use for the channel
- Frontend constructs `workflow_config.channel_configs[channel_id].source_queries` structure
- Saves to database and reloads stream

---

### 2. Query Definition Step

**Component**: `QueryConfigStep.tsx`

| User Action | API Method | API Endpoint | Frontend API Call | Request Payload | Response Type |
|-------------|------------|--------------|-------------------|-----------------|---------------|
| Click "Generate Query" button | `POST` | `/api/research-streams/{stream_id}/channels/{channel_name}/generate-query` | `researchStreamApi.generateChannelQuery()` | `{ source_id }` | `QueryGenerationResponse` |
| Edit query → Click "Save Query" | `PUT` | `/api/research-streams/{stream_id}/channels/{channel_id}/sources/{source_id}/query` | `researchStreamApi.updateChannelSourceQuery()` | `{ query_expression, enabled }` | `ResearchStream` |
| Click "Test Query" button | `POST` | `/api/research-streams/{stream_id}/channels/{channel_name}/test-query` | `researchStreamApi.testChannelQuery()` | `{ source_id, query_expression, max_results, start_date?, end_date?, date_type? }` | `QueryTestResponse` |

**Details**:
- AI generates source-specific query expressions based on channel keywords and focus
- User can edit and test queries before confirming
- Test returns article count and sample articles
- Process repeats for each selected source in the channel

**Sub-States**:
- `awaiting_generation`: Initial state, no query yet
- `query_generated`: Query generated, can edit/test
- `query_tested`: Query tested, ready to confirm

---

### 3. Semantic Filter Definition Step

**Component**: `SemanticFilterStep.tsx`

| User Action | API Method | API Endpoint | Frontend API Call | Request Payload | Response Type |
|-------------|------------|--------------|-------------------|-----------------|---------------|
| Click "Generate Filter" button | `POST` | `/api/research-streams/{stream_id}/channels/{channel_name}/generate-filter` | `researchStreamApi.generateChannelFilter()` | None | `SemanticFilterGenerationResponse` |
| Edit filter criteria → Auto-save on blur | `PUT` | `/api/research-streams/{stream_id}/channels/{channel_id}/semantic-filter` | `researchStreamApi.updateChannelSemanticFilter()` | `{ enabled, criteria, threshold }` | `ResearchStream` |
| Adjust threshold slider → Auto-save on change | `PUT` | `/api/research-streams/{stream_id}/channels/{channel_id}/semantic-filter` | `researchStreamApi.updateChannelSemanticFilter()` | `{ enabled, criteria, threshold }` | `ResearchStream` |

**Details**:
- AI generates semantic filter criteria describing what articles to accept/reject
- Filter automatically saved upon generation
- User can edit criteria (text) and adjust threshold (0.0-1.0)
- Changes auto-save to database

**Sub-States**:
- `awaiting_generation`: Initial state, no filter yet
- `filter_generated`: Filter generated and saved, ready to test

---

### 4. Channel Testing Step

**Component**: `ChannelTestingStep.tsx`

| User Action | API Method | API Endpoint | Frontend API Call | Request Payload | Response Type |
|-------------|------------|--------------|-------------------|-----------------|---------------|
| Click "Test Filter" button | `POST` | `/api/research-streams/{stream_id}/channels/{channel_name}/test-filter` | `researchStreamApi.testChannelFilter()` | `{ articles, filter_criteria, threshold }` | `SemanticFilterTestResponse` |

**Details**:
- Tests semantic filter on sample articles retrieved from query tests
- For each article, AI evaluates confidence (0-1) and provides reasoning
- Returns filtered articles with pass/fail status based on threshold
- Shows statistics: pass count, fail count, average confidence
- Test results stored in component state (not persisted to database)

**Response Structure**:
```typescript
{
  filtered_articles: Array<{
    article: CanonicalResearchArticle,
    confidence: number,
    reasoning: string,
    passed: boolean
  }>,
  pass_count: number,
  fail_count: number,
  average_confidence: number
}
```

---

### 5. Summary Report Step

**Component**: `SummaryReportStep.tsx`

| User Action | API Method | API Endpoint | Frontend API Call | Request Payload | Response Type |
|-------------|------------|--------------|-------------------|-----------------|---------------|
| Click "Generate Executive Summary" button | `POST` | `/api/research-streams/{stream_id}/generate-executive-summary` | `researchStreamApi.generateExecutiveSummary()` | `{ channel_test_data: Array<{ channel_id, channel_name, accepted_articles }> }` | `ExecutiveSummary` |

**Details**:
- Aggregates accepted articles across all tested channels
- AI analyzes articles to generate executive summary with:
  - Overview (2-3 sentence high-level summary)
  - Key themes (3-5 main topics identified)
  - Channel highlights (notable findings per channel)
  - Recommendations (suggested next steps)
- Summary not persisted to database (generated on-demand)

**Request Payload Example**:
```typescript
{
  channel_test_data: [
    {
      channel_id: "ch_123",
      channel_name: "Cancer Immunotherapy",
      accepted_articles: [/* articles that passed filter */]
    },
    // ... more channels
  ]
}
```

**Response Structure**:
```typescript
{
  overview: string,
  key_themes: string[],
  channel_highlights: Array<{
    channel_name: string,
    highlight: string
  }>,
  generated_at: string (ISO datetime)
}
```

---

### 6. Workflow Completion

**Component**: `ImplementationConfigContext.tsx` (automatic)

| User Action | API Method | API Endpoint | Frontend API Call | Request Payload | Response Type |
|-------------|------------|--------------|-------------------|-----------------|---------------|
| After all channels tested → Click "Complete Configuration" | `POST` | `/api/research-streams/{stream_id}/implementation-config/complete` | `researchStreamApi.completeImplementationConfig()` | None | `ResearchStream` |

**Details**:
- Marks implementation configuration as complete
- Updates stream status
- User can now proceed to run the stream

---

## Context Initialization & Helpers

**Component**: `ImplementationConfigContext.tsx`

### On Mount

| Action | API Method | Endpoint | Frontend Call | Response Type |
|--------|------------|----------|---------------|---------------|
| Load stream data | `GET` | `/api/research-streams/{stream_id}` | `researchStreamApi.getResearchStream()` | `ResearchStream` |
| Load available sources | `GET` | `/api/research-streams/metadata/sources` | `researchStreamApi.getInformationSources()` | `InformationSource[]` |

### Helper Functions

| Action | Trigger | API Method | Endpoint | Frontend Call |
|--------|---------|------------|----------|---------------|
| Update stream metadata | Name/purpose edit | `PUT` | `/api/research-streams/{stream_id}` | `researchStreamApi.updateResearchStream()` |
| Update channel metadata | Channel edit | `PUT` | `/api/research-streams/{stream_id}` | `researchStreamApi.updateResearchStream()` |

---

## API Response Types Summary

### Core Types

```typescript
// Research Stream
interface ResearchStream {
  stream_id: number;
  stream_name: string;
  purpose: string;
  channels: Channel[];
  workflow_config: WorkflowConfig;
  // ... other fields
}

// Query Generation
interface QueryGenerationResponse {
  query_expression: string;
  reasoning: string;
}

// Query Testing
interface QueryTestResponse {
  success: boolean;
  article_count: number;
  sample_articles: CanonicalResearchArticle[];
  error_message?: string;
}

// Semantic Filter Generation
interface SemanticFilterGenerationResponse {
  filter_criteria: string;
  reasoning: string;
}

// Semantic Filter Testing
interface SemanticFilterTestResponse {
  filtered_articles: FilteredArticle[];
  pass_count: number;
  fail_count: number;
  average_confidence: number;
}

// Executive Summary
interface ExecutiveSummary {
  overview: string;
  key_themes: string[];
  channel_highlights: ChannelHighlight[];
  generated_at: string;
}

interface ChannelHighlight {
  channel_name: string;
  highlight: string;
}
```

---

## State Management Notes

### Persisted State (Database)
- Source selection → `workflow_config.channel_configs[channel_id].source_queries`
- Query expressions → `workflow_config.channel_configs[channel_id].source_queries[source_id].query_expression`
- Semantic filters → `workflow_config.channel_configs[channel_id].semantic_filter`

### Temporary State (Component/Context)
- Sample articles from query tests → Context state
- Filter test results → Context state (`channelTestResults`)
- Executive summary → Component state (SummaryReportStep)
- UI sub-states → Context state (`querySubState`, `filterSubState`)

### Workflow Position State (Context)
- `currentChannelIndex`: Which channel we're configuring
- `currentStep`: Which workflow step we're on
- `currentSourceIndex`: Which source we're configuring (query definition step)
- `isViewingSummary`: Whether we're viewing summary report

---

## Service Layer

All endpoints are implemented in:
- **Router**: `backend/routers/research_streams.py`
- **Service**: `backend/services/implementation_config_service.py`

### Service Methods

| Endpoint Handler | Service Method |
|------------------|----------------|
| `generate_channel_query` | `ImplementationConfigService.generate_channel_query()` |
| `test_channel_query` | `ImplementationConfigService.test_channel_query()` |
| `update_channel_source_query` | `ResearchStreamService.update_research_stream()` |
| `generate_channel_filter` | `ImplementationConfigService.generate_channel_filter()` |
| `test_channel_filter` | `ImplementationConfigService.test_channel_filter()` |
| `update_channel_semantic_filter` | `ResearchStreamService.update_research_stream()` |
| `generate_executive_summary` | `ImplementationConfigService.generate_executive_summary()` |
| `complete_implementation_config` | `ImplementationConfigService.complete_implementation_config()` |

---

## Error Handling

All endpoints follow standard FastAPI error handling:
- `404 NOT_FOUND`: Stream, channel, or source not found
- `400 BAD_REQUEST`: Invalid request payload or validation errors
- `500 INTERNAL_SERVER_ERROR`: Service errors (LLM failures, external API errors, etc.)

Frontend handles errors with try-catch blocks and displays user-friendly error messages.

---

## Related Documentation

- `workflow_2_implementation_design.md`: Overall workflow design and architecture
- `stream config and impl.md`: Stream configuration concepts
- `type_definition_practices.md`: TypeScript/Python type patterns
