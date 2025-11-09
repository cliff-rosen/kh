# Implementation Config Flow Redesign *(Legacy)*
> **Status:** The channel-based implementation configuration workflow described below was fully removed on 2025-11-09 in favor of the retrieval group wizard. This document remains for historical context only.
## From Channel-Based to Category-Based Structure

## Legacy Flow (Channel-Based)

### Data Structure
```typescript
Channel {
  channel_id: string
  name: string
  focus: string              // "What this channel monitors"
  type: StreamType           // competitive/regulatory/clinical/market/scientific
  keywords: string[]         // ["keyword1", "keyword2", ...]
}

workflow_config.channel_configs[channel_id] {
  source_queries: {
    [source_id]: {
      query_expression: string
      enabled: boolean
    }
  }
  semantic_filter: {
    enabled: boolean
    criteria: string         // Natural language filter criteria
    threshold: number        // 0.0-1.0 confidence threshold
  }
}
```

### Configuration Workflow (Per Channel)
1. **Source Selection**
   - Select which sources to query (PubMed, Google Scholar, etc.)
   - Creates placeholder entries in `workflow_config.channel_configs[channel_id]`

2. **Query Definition** (for each selected source)
   - Generate query from: `channel.focus` + `channel.keywords`
   - AI generates source-specific query syntax
   - User reviews/edits query
   - Test query → get article count + sample articles
   - Confirm and move to next source

3. **Semantic Filter Definition**
   - Generate filter criteria from: `channel.focus` + `channel.type`
   - AI generates natural language filter criteria
   - User reviews/edits criteria
   - Set confidence threshold (default 0.7)
   - Test filter on sample articles

4. **Channel Testing**
   - Review test results showing:
     - Sample articles from each source
     - Filter acceptance/rejection for each article
     - Overall channel performance
   - Accept configuration → move to next channel

---

## New Flow (Category-Based)

### Data Structure
```typescript
Category {
  id: string                           // "medical_health"
  name: string                         // "Medical & Health Sciences"
  topics: string[]                     // ["Mesothelioma research", "Lung cancer research", ...]
  specific_inclusions: string[]        // ["Any peer-reviewed research on disease mechanisms"]
}

Stream {
  audience: string[]                   // Who uses this stream
  intended_guidance: string[]          // What decisions this informs
  global_inclusion: string[]           // Stream-wide inclusion criteria
  global_exclusion: string[]           // Stream-wide exclusion criteria
}

workflow_config.category_configs[category_id] {
  source_queries: {
    [source_id]: {
      query_expression: string
      enabled: boolean
    }
  }
  semantic_filter: {
    enabled: boolean
    criteria: string
    threshold: number
  }
}
```

### Configuration Workflow (Per Category)

The **workflow structure remains the same**, but **input data changes**:

#### 1. Source Selection
- **Same as before**: Select sources for this category
- No changes needed to UI

#### 2. Query Definition (for each selected source)
- **OLD Input**: `channel.focus` + `channel.keywords`
- **NEW Input**: `category.name` + `category.topics` + `stream.purpose`

**Query Generation Prompt Changes:**
```
OLD: "Generate a [source] query for monitoring [focus] using keywords: [keywords]"

NEW: "Generate a [source] query for the category '[category.name]'
     covering these topics: [topics].
     Stream purpose: [purpose]

     The query should retrieve research related to: [topics joined]"
```

**Example:**
```
Category: Medical & Health Sciences
Topics: ["Mesothelioma research", "Lung cancer research", "Diagnostic criteria"]
Purpose: "Enable comprehensive scientific awareness for asbestos litigation"

→ PubMed Query: (mesothelioma[Title/Abstract] OR lung cancer[Title/Abstract])
                AND asbestos[Title/Abstract]
                AND (diagnostic[Title/Abstract] OR pathology[Title/Abstract])
```

#### 3. Semantic Filter Definition
- **OLD Input**: `channel.focus` + `channel.type`
- **NEW Input**:
  - `category.specific_inclusions` (primary source)
  - `stream.global_inclusion` (context)
  - `stream.global_exclusion` (exclusions)
  - `category.topics` (additional context)

**Filter Generation Strategy:**
```typescript
semantic_filter.criteria = `
INCLUDE articles that match ANY of these category-specific criteria:
${category.specific_inclusions.map(c => `- ${c}`).join('\n')}

AND match ANY of these stream-wide inclusion criteria:
${stream.global_inclusion.map(c => `- ${c}`).join('\n')}

BUT EXCLUDE articles that match ANY of these stream-wide exclusions:
${stream.global_exclusion.map(c => `- ${c}`).join('\n')}

Category focus areas: ${category.topics.join(', ')}
`
```

**Example for "Medical & Health Sciences" category:**
```
INCLUDE articles that match:
- Any peer-reviewed research on asbestos-related disease mechanisms or outcomes

AND articles about:
- Asbestos or talc exposure assessment
- Health effects causally linked to asbestos
- Epidemiological studies of exposed populations
- [... other global_inclusion criteria]

BUT EXCLUDE:
- Legal case decisions, trial transcripts
- General occupational health unrelated to asbestos
- [... other global_exclusion criteria]

Category covers: Mesothelioma research, Lung cancer research, Diagnostic criteria, ...
```

#### 4. Category Testing
- **Same concept**: Test with sample articles
- Display shows category name instead of channel name
- Results show how articles align with category topics

---

## Key Differences Summary

| Aspect | Old (Channel) | New (Category) |
|--------|--------------|----------------|
| **Query Input** | focus + keywords | name + topics + purpose |
| **Query Strategy** | Keyword-driven | Topic-driven |
| **Filter Input** | focus + type | specific_inclusions + global inclusion/exclusion |
| **Filter Strategy** | Single-level | Multi-level (category + stream) |
| **Terminology** | "Channel" | "Category" |
| **Structure** | Flat (each channel independent) | Hierarchical (categories within stream scope) |

---

## Implementation Changes Needed

### 1. Frontend Components (Minimal Changes)

**ImplementationConfigContext.tsx:**
- Replace `currentChannel` → `currentCategory`
- Replace `currentChannelIndex` → `currentCategoryIndex`
- Replace `channel_configs` → `category_configs`
- Update type imports: `Channel` → `Category`

**UI Components:**
- `SourceSelectionStep.tsx` - Change labels "channel" → "category"
- `QueryConfigStep.tsx` - Update query generation API call
- `SemanticFilterStep.tsx` - Update filter generation API call
- `ChannelTestingStep.tsx` → `CategoryTestingStep.tsx` - Update labels
- `WorkflowProgressSidebar.tsx` - Display categories instead of channels

### 2. Backend API Changes

**Query Generation Endpoint:**
```python
# OLD
POST /api/research-streams/{stream_id}/channels/{channel_id}/generate-query
{
  "source_id": "pubmed",
  "focus": "Track competitor drug development",
  "keywords": ["melanocortin", "MCR1", "MCR4"]
}

# NEW
POST /api/research-streams/{stream_id}/categories/{category_id}/generate-query
{
  "source_id": "pubmed",
  "category_name": "Medical & Health Sciences",
  "topics": ["Mesothelioma research", "Lung cancer research"],
  "purpose": "Enable comprehensive scientific awareness..."
}
```

**Filter Generation Endpoint:**
```python
# OLD
POST /api/research-streams/{stream_id}/channels/{channel_id}/generate-filter
{
  "focus": "Track competitor research",
  "type": "competitive"
}

# NEW
POST /api/research-streams/{stream_id}/categories/{category_id}/generate-filter
{
  "category_name": "Medical & Health Sciences",
  "specific_inclusions": ["Any peer-reviewed research..."],
  "global_inclusion": ["Asbestos exposure assessment", ...],
  "global_exclusion": ["Legal case decisions", ...],
  "topics": ["Mesothelioma", "Lung cancer", ...]
}
```

### 3. Backend Prompt Updates

**Query Generation Prompt (services/query_generation_service.py):**
```python
# OLD
system_prompt = f"""
Generate a {source.name} query for monitoring: {focus}
Keywords: {', '.join(keywords)}
Query syntax: {source.query_syntax}
"""

# NEW
system_prompt = f"""
Generate a {source.name} query for the research category: {category_name}
This category covers these topics: {', '.join(topics)}
Stream purpose: {purpose}

Query syntax: {source.query_syntax}

Generate a query that will retrieve research articles related to these topics.
"""
```

**Filter Generation Prompt (services/semantic_filter_service.py):**
```python
# OLD
system_prompt = f"""
Generate semantic filter criteria for monitoring {focus}
Channel type: {channel_type}
"""

# NEW
system_prompt = f"""
Generate semantic filter criteria for this research category.

Category: {category_name}
Topics: {', '.join(topics)}

CATEGORY-SPECIFIC INCLUSION CRITERIA:
{chr(10).join(f'- {c}' for c in specific_inclusions)}

STREAM-WIDE INCLUSION CRITERIA (context):
{chr(10).join(f'- {c}' for c in global_inclusion[:5])}  # Show top 5 for context

STREAM-WIDE EXCLUSION CRITERIA:
{chr(10).join(f'- {c}' for c in global_exclusion[:5])}  # Show top 5

Generate natural language criteria that will accept articles matching the
category-specific and stream-wide inclusion criteria, while excluding articles
that match the exclusion criteria.
"""
```

---

## Migration Strategy

### Phase 1: Backend Updates
1. ✅ Update database schema (`channels` → `categories`)
2. ✅ Update Pydantic schemas
3. ✅ Update TypeScript types
4. Update API endpoints:
   - `/channels/{channel_id}/...` → `/categories/{category_id}/...`
   - Update request/response schemas
5. Update prompt templates for query/filter generation
6. Update service layer to use category data

### Phase 2: Frontend Updates
1. Update ImplementationConfigContext:
   - Replace all `channel` references with `category`
   - Update type imports
2. Update UI components:
   - Change labels and copy
   - Update API calls
3. Test full workflow with new structure

### Phase 3: Testing
1. Test query generation with topics
2. Test filter generation with multi-level criteria
3. Test end-to-end category configuration
4. Verify backward compatibility (if needed)

---

## Benefits of New Approach

1. **More Precise Filtering**
   - Multi-level criteria (category + stream)
   - Explicit inclusion/exclusion rules
   - Better alignment with user intent

2. **Better Query Generation**
   - Topics are more semantic than keywords
   - Context from stream purpose
   - More natural for AI to work with

3. **Clearer Structure**
   - Categories are organized topic areas
   - Stream-level rules apply globally
   - Easier to understand and maintain

4. **Scalability**
   - Can add more categories without cluttering
   - Global rules reduce redundancy
   - Easier to audit what's in/out of scope
