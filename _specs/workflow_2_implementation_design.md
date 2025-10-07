# Workflow 2: Implementation Configuration Design

## Overview

This document captures the design decisions for extending the AI-assisted research stream creation workflow to include implementation configuration. This is a separate, optional workflow that launches after completing the requirements definition (Workflow 1).

## Key Design Principles

### Hard Separation Between Workflows
- **Workflow 1 (Requirements Definition)**: Conversational, flexible, guides user through defining stream name, purpose, channels, and report frequency
- **Workflow 2 (Implementation Configuration)**: Structured, validation-focused, configures and tests the actual data retrieval implementation
- These are **completely separate experiences** - no segue from one to the other
- Completing Workflow 1 is its own thing and should be established as such
- When Workflow 1 completes, user gets option to launch Workflow 2 (optional)

### UX Philosophy Differences

**Workflow 1 (Requirements):**
- Many degrees of freedom
- Guide the user but give them ability to choose their path
- Conversational AI assistant
- Flexible input methods

**Workflow 2 (Implementation):**
- Very specific ideas of what has to happen
- Structured, wizard-like progression
- Validation and testing at each step
- Per-channel configuration only

## Workflow 2 Requirements

### Scope
- Configure one channel at a time only
- Testing is **required** for all queries
- Skip scoring configuration (not included in Workflow 2)
- Must support iteration on generated queries regardless of test results

### Per-Channel Configuration Steps

1. **Source Selection**
   - Present available information sources from authoritative list
   - Allow user to select multiple sources for this channel
   - Show source metadata (type, description, query syntax, URL)

2. **Query Configuration**
   - For each selected source, generate keyword expression
   - Base on channel keywords but customize for source query syntax
   - Show side-by-side comparison of channel keywords vs. generated query
   - Allow manual editing before testing

3. **Query Testing (Required)**
   - Execute test query against actual source
   - Show results preview (article titles, abstracts, counts)
   - Display success/failure status
   - **Always allow iteration**: Even if test succeeds, user can refine query
   - If test fails, must iterate until satisfactory

4. **Semantic Filter Configuration**
   - Configure semantic discriminator for this channel
   - Define filter criteria (natural language description of relevance)
   - Set threshold (0-1 scale)
   - Enable/disable toggle

5. **Semantic Filter Testing**
   - Apply semantic filter to test query results
   - Show before/after comparison (which articles pass filter)
   - Display filter scores for each article
   - Allow iteration on filter criteria and threshold

### Implementation Details

#### State Management
- Each channel gets its own configuration state
- Track completion status per channel per step
- Preserve configuration when navigating between channels
- Support draft state (can save and resume later)

#### Progress Tracking
- Show overall progress: "Configuring Channel 2 of 4"
- Show per-channel progress: "Step 3 of 5: Query Testing"
- Visual progress indicator for each channel
- Summary view showing which channels are complete

#### Error Handling
- Query failures should not block progress (allow iteration)
- API errors should be surfaced clearly with retry options
- Validation errors prevent moving to next step
- Unsaved changes warning when navigating away

#### Navigation
- Linear progression through steps within a channel
- Can navigate back to previous steps within channel
- Can navigate between channels (preserves state)
- "Skip Configuration" option to exit and save as draft
- "Complete Configuration" button when all channels done

### UI Design Pattern

**Card-Based Wizard Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Configure Implementation: [Stream Name]                      │
│ Channel 2 of 4: [Channel Name]                      [Exit]  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ● Source Selection  ● Query Config  ○ Query Testing  ○ ... │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                         │ │
│  │  [Current Step Content]                                │ │
│  │                                                         │ │
│  │  - Source selection checkboxes                         │ │
│  │  - Query configuration inputs                          │ │
│  │  - Test results display                                │ │
│  │  - Semantic filter configuration                       │ │
│  │                                                         │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                               │
│  [< Previous Step]              [Test Query] [Next Step >]   │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ Progress: 6 of 12 steps complete across all channels        │
└─────────────────────────────────────────────────────────────┘
```

### Entry Points

**After Workflow 1 Completes:**
```
┌─────────────────────────────────────────────────────────┐
│  ✓ Research Stream Created Successfully!                 │
│                                                           │
│  Your stream "XYZ" has been created with 3 channels.    │
│                                                           │
│  Next Steps:                                             │
│  • Configure sources and test queries (Recommended)      │
│  • Skip for now and configure later                      │
│                                                           │
│  [Configure Implementation]  [View Stream]  [Dashboard]  │
└─────────────────────────────────────────────────────────┘
```

**From Stream Detail Page:**
```
Stream Detail > Workflow & Scoring Tab
[Configure Implementation Workflow] button
(Disabled if already configured, with "Edit Configuration" option)
```

### Data Model Changes

#### New Fields
- `ResearchStream.implementation_config_status`: `null | 'draft' | 'complete'`
- `ResearchStream.implementation_config_progress`: JSON tracking per-channel completion

#### Configuration Storage
Store in existing `workflow_config` structure:
```typescript
interface WorkflowConfig {
  sources: WorkflowSource[];
  article_limit_per_week?: number;
  implementation_config_status?: 'draft' | 'complete';
  configuration_history?: {
    channel_name: string;
    completed_steps: string[];
    test_results: QueryTestResult[];
    last_updated: string;
  }[];
}
```

### Testing Infrastructure

#### Query Testing Service
```python
class QueryTestService:
    async def test_query(
        self,
        source_id: str,
        query_expression: str,
        limit: int = 10
    ) -> QueryTestResult:
        """
        Execute test query against source and return results

        Returns:
            - success: bool
            - article_count: int
            - sample_articles: List[Article]
            - error_message: Optional[str]
        """
```

#### Semantic Filter Testing Service
```python
class SemanticFilterTestService:
    async def test_filter(
        self,
        articles: List[Article],
        filter_criteria: str,
        threshold: float
    ) -> FilterTestResult:
        """
        Apply semantic filter to articles and return scored results

        Returns:
            - filtered_articles: List[ArticleWithScore]
            - pass_count: int
            - fail_count: int
        """
```

### API Endpoints

```python
# Test query against source
POST /api/research-streams/{stream_id}/channels/{channel_name}/test-query
Body: {
    "source_id": "pubmed",
    "query_expression": "melanocortin AND receptor",
    "limit": 10
}

# Test semantic filter
POST /api/research-streams/{stream_id}/channels/{channel_name}/test-filter
Body: {
    "article_ids": ["pmid:12345", "pmid:67890"],
    "filter_criteria": "Focus on receptor binding mechanisms",
    "threshold": 0.7
}

# Save implementation config progress (draft)
PATCH /api/research-streams/{stream_id}/implementation-config
Body: {
    "channel_name": "Channel 1",
    "completed_steps": ["source_selection", "query_config"],
    "configuration_data": { ... }
}

# Mark implementation config as complete
POST /api/research-streams/{stream_id}/implementation-config/complete
```

## Out of Scope (For Now)

- Scoring configuration (explicitly excluded)
- AI-assisted query refinement (manual only for now)
- Bulk configuration (one channel at a time only)
- Schedule configuration (use report_frequency only)
- Advanced query syntax helpers
- Source-specific query builders

## Future Considerations

- AI assistance for query refinement based on test results
- Multi-channel bulk operations (select all, copy from channel)
- Query templates library
- Integration with external query builders
- Historical query performance analytics
- A/B testing different query expressions

## Technical Dependencies

### Backend
- Query execution services for each source type
- Semantic filter evaluation service (LLM-based)
- Rate limiting for test queries
- Caching for test results

### Frontend
- New route: `/research-streams/:id/configure-implementation`
- New context: `ImplementationConfigContext`
- New components:
  - `ImplementationConfigWizard`
  - `SourceSelectionStep`
  - `QueryConfigStep`
  - `QueryTestingStep`
  - `SemanticFilterConfigStep`
  - `SemanticFilterTestingStep`
  - `ProgressTracker`

### External Services
- API wrappers for each information source (PubMed, Google Scholar, etc.)
- LLM service for semantic filtering
- Article fetching and parsing services

## Success Criteria

A channel's implementation configuration is considered complete when:
1. At least one source has been selected
2. All selected sources have query expressions configured
3. All query expressions have been tested (regardless of pass/fail)
4. User has explicitly confirmed queries are satisfactory
5. Semantic filter has been configured (can be disabled)
6. If semantic filter is enabled, it has been tested

The entire Workflow 2 is complete when:
- All channels in the stream have completed implementation configuration
- User has clicked "Complete Configuration"
- Configuration has been saved to the database
- `implementation_config_status` is set to `'complete'`

## Migration Path

For existing streams created before Workflow 2:
- `implementation_config_status` defaults to `null`
- Show "Configuration Recommended" banner on stream detail page
- Allow launching Workflow 2 at any time
- Pre-populate with any existing workflow_config data
