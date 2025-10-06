# Stream Workflow Configuration Spec

## Purpose
Define how streams retrieve, filter, and score content from multiple sources.

## Storage
- New JSON column: `research_streams.workflow_config`
- Nullable, defaults to auto-generated config based on stream fields

## Structure

```json
{
  "sources": [
    {
      "source_type": "pubmed",
      "enabled": true,
      "config": {
        "keywords": ["melanocortin", "MCR1", "MCR4"],
        "mesh_terms": ["Receptors, Melanocortin"],
        "date_range_days": 30,
        "max_results": 50,
        "filters": {
          "article_types": ["clinical_trial", "review"],
          "languages": ["eng"]
        }
      }
    },
    {
      "source_type": "clinicaltrials",
      "enabled": true,
      "config": {
        "keywords": ["melanocortin"],
        "conditions": ["obesity"],
        "interventions": [],
        "phases": ["phase_2", "phase_3"],
        "status": ["recruiting", "active"],
        "date_range_days": 90
      }
    },
    {
      "source_type": "patents",
      "enabled": false,
      "config": {
        "keywords": ["melanocortin receptor"],
        "ipc_classes": ["A61K"],
        "assignees": []
      }
    }
  ],
  "scoring": {
    "relevance_weight": 0.6,
    "evidence_weight": 0.4,
    "inclusion_threshold": 7.0,
    "max_items_per_report": 10,
    "dedup_similarity_threshold": 0.85
  },
  "filters": {
    "exclude_keywords": [],
    "require_any_keywords": [],
    "min_quality_score": 5.0
  }
}
```

## Source Types (Phase 1)
- `pubmed` - PubMed/MEDLINE
- `clinicaltrials` - ClinicalTrials.gov
- `patents` - Patent databases
- `news` - News articles
- `regulatory` - FDA/EMA filings

## Auto-Generation Logic
When `workflow_config` is NULL, generate from:
- `keywords` → all source keywords
- `focus_areas` → map to domain-specific filters
- `competitors` → assignees/sponsors filters
- `stream_type` → enable relevant sources

## Migration Strategy
1. Add `workflow_config` JSONB column (nullable)
2. Existing streams get NULL initially
3. On first report generation, auto-generate if NULL
4. UI for editing comes in Phase 2

## Source-Specific Config Fields

### PubMed
- `keywords`, `mesh_terms`, `article_types`, `languages`, `journals`

### ClinicalTrials
- `keywords`, `conditions`, `interventions`, `phases`, `status`, `sponsors`

### Patents
- `keywords`, `ipc_classes`, `assignees`, `jurisdictions`

### News
- `keywords`, `sources`, `categories`

### Regulatory
- `keywords`, `agencies`, `document_types`, `products`

## Scoring Pipeline
1. Retrieve from all enabled sources
2. Parse and normalize results
3. Apply filters (exclude keywords, quality threshold)
4. Score each item (relevance + evidence)
5. Deduplicate (similarity threshold)
6. Rank and trim (inclusion threshold, max items)

## Phase 1 Scope
- Define structure
- Auto-generate from existing stream fields
- Use in retrieval/scoring service
- No UI editing (hardcoded tweaks only)

## Phase 2 Scope
- UI for editing workflow config
- Per-source enable/disable toggles
- Advanced filters and scoring rules
- Source-specific parameter tuning
