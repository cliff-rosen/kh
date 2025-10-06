# Stream Workflow Configuration Spec

## Purpose
Define how streams retrieve, filter, and score content from multiple sources based on channels.

## Storage
- JSON column: `research_streams.workflow_config`
- Nullable, auto-generated from channels on first report generation

## Structure

```json
{
  "sources": [
    {
      "source_type": "pubmed",
      "enabled": true,
      "channel_queries": [
        {
          "channel_name": "Melanocortin Pathways",
          "query": "melanocortin OR MCR1 OR MCR4 OR MC4R"
        },
        {
          "channel_name": "Obesity Therapeutics",
          "query": "obesity OR weight loss OR appetite regulation"
        }
      ]
    },
    {
      "source_type": "google_scholar",
      "enabled": true,
      "channel_queries": [
        {
          "channel_name": "Melanocortin Pathways",
          "query": "\"melanocortin receptor\" OR \"MC4R\""
        },
        {
          "channel_name": "Obesity Therapeutics",
          "query": "obesity AND therapeutic"
        }
      ]
    }
  ],
  "semantic_filter": "Focus on novel therapeutic approaches affecting melanocortin pathways and obesity treatment. Prioritize clinical outcomes and drug development.",
  "scoring": {
    "relevance_weight": 0.6,
    "evidence_weight": 0.4,
    "inclusion_threshold": 7.0,
    "max_items_per_report": 10
  }
}
```

## Source Types
- `pubmed` - PubMed/MEDLINE
- `google_scholar` - Google Scholar

## Channel-Based Query Generation
- Each source has `channel_queries` array
- One query per channel built from channel's keywords
- Query format: Boolean expression (AND, OR, NOT, parentheses, quotes)
- Keywords joined with OR: `keyword1 OR keyword2 OR keyword3`

## Auto-Generation Logic
When `workflow_config` is NULL:
1. For each channel, generate query from channel keywords
2. Create `channel_queries` array for each source
3. Build `semantic_filter` from stream `purpose` + all channel `focus` texts
4. Both sources enabled by default

## Date Range
- Handled at stream level via `report_frequency`
- Not in source config

## Semantic Filter
- Single string describing what to include/exclude across ALL channels
- Built from stream purpose + channel focuses
- Used by LLM during relevance scoring

## Scoring Pipeline
1. For each source, retrieve using all channel queries
2. Tag results with originating channel
3. Parse and normalize results
4. Score each item using semantic filter + scoring weights
5. Rank and trim (inclusion threshold, max items)

## Phase 1 Scope
- Define structure
- Auto-generate from channels
- Use in retrieval/scoring service
- No UI editing

## Phase 2 Scope
- UI for editing per-channel queries
- Per-source enable/disable
- Semantic filter editing
- Scoring parameter tuning
