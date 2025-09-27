# Workbench Multi-Provider Design Specification

## Overview

This document outlines the design for extending the Workbench feature to support multiple academic search providers (Google Scholar and PubMed initially), with a unified interface and canonical data representation.

## Goals

1. Support multiple search providers (Google Scholar, PubMed)
2. Maintain a single, unified user interface
3. Create canonical data structures that work across providers
4. Enable consistent feature extraction regardless of source
5. Allow for easy addition of new providers in the future

## Design Principles

- **Provider Agnostic UI**: Components should work with canonical data, not provider-specific formats
- **Adapter Pattern**: Each provider has an adapter that converts to/from canonical format
- **Extensibility**: Adding new providers should not require UI changes
- **Type Safety**: Strong TypeScript/Python typing throughout
- **Backward Compatibility**: Existing functionality should continue to work

## Canonical Data Structures

### CanonicalArticle

The core data structure that represents an article from any source:

```typescript
interface CanonicalArticle {
    // Core identifiers
    id: string;                      // Unique ID (PMID for PubMed, position for Scholar)
    source: 'pubmed' | 'scholar';    // Source of the article
    
    // Basic metadata
    title: string;
    authors: string[];
    abstract?: string;
    snippet?: string;                // Short excerpt (Scholar has this, PubMed might not)
    
    // Publication info
    journal?: string;
    publication_date?: string;        // YYYY-MM-DD format
    year?: number;
    volume?: string;
    issue?: string;
    pages?: string;
    
    // Links and identifiers
    link?: string;                   // URL to article
    pdf_link?: string;
    doi?: string;
    pmid?: string;                   // PubMed ID (if available)
    pmc_id?: string;                 // PubMed Central ID (if available)
    
    // Citation metrics
    cited_by_count?: number;
    cited_by_link?: string;
    related_pages_link?: string;
    
    // Search-specific metadata
    position?: number;               // Position in search results
    relevance_score?: number;        // Search engine relevance
    
    // Additional metadata
    keywords?: string[];
    mesh_terms?: string[];           // Medical Subject Headings (PubMed)
    publication_type?: string[];     // Article type (review, clinical trial, etc.)
    
    // Feature extraction results
    metadata?: {
        features?: ExtractedFeatures;
        feature_extraction_error?: string;
        raw_data?: any;              // Original data from source
    };
}
```

### Mapping Strategy

| Field | Google Scholar | PubMed |
|-------|---------------|---------|
| id | `scholar_{position}` | PMID |
| title | title | title |
| authors | authors array | authors array |
| abstract | N/A | abstract |
| snippet | snippet | First 200 chars of abstract |
| journal | publication_info | journal |
| year | year | Extract from publication_date |
| link | link | Build from PMID |
| pdf_link | pdf_link | PMC link if available |
| cited_by_count | cited_by_count | N/A |
| mesh_terms | N/A | mesh_terms |

## Provider Architecture

### SearchProvider Interface

```typescript
interface SearchProvider {
    name: string;
    id: 'pubmed' | 'scholar';
    search(params: UnifiedSearchParams): Promise<SearchResponse>;
    isAvailable(): Promise<boolean>;
}

interface UnifiedSearchParams {
    query: string;
    num_results?: number;
    sort_by?: 'relevance' | 'date';
    year_low?: number;
    year_high?: number;
    date_type?: 'completion' | 'publication';  // PubMed-specific
}

interface SearchResponse {
    articles: CanonicalArticle[];
    metadata: {
        total_results?: number;
        search_time?: number;
        provider: 'pubmed' | 'scholar';
        query_translation?: string;
        [key: string]: any;
    };
}
```

### Provider Adapters

Each provider will have an adapter class that:
1. Implements the SearchProvider interface
2. Converts provider-specific parameters to API calls
3. Transforms results to canonical format
4. Handles provider-specific errors

```
frontend/src/lib/api/searchProviders/
├── types.ts              # Common interfaces
├── scholarAdapter.ts     # Google Scholar adapter
├── pubmedAdapter.ts      # PubMed adapter
└── index.ts             # Export registry
```

## UI Components Updates

### Provider Selection

Add a provider selector component:
- Toggle between Google Scholar and PubMed
- Show availability status
- Remember user preference

### Search Controls

Update SearchControls to:
- Show/hide provider-specific options
- Adapt labels (e.g., "Results" vs "Max Results")
- Handle provider-specific validation

### Results Display

ArticleCard component updates:
- Display provider badge
- Show provider-specific fields conditionally
- Handle missing fields gracefully

## Backend Updates

### API Endpoints

1. **Existing endpoints remain unchanged**:
   - `/api/google-scholar/search` - Google Scholar search
   - `/api/pubmed/search` - PubMed search (new)

2. **Feature extraction accepts canonical format**:
   - `/api/extract/features` - Works with CanonicalArticle[]

### Canonical Types (Python)

```python
class CanonicalArticle(BaseModel):
    id: str
    source: Literal['pubmed', 'scholar']
    title: str
    authors: List[str]
    abstract: Optional[str] = None
    snippet: Optional[str] = None
    # ... mirror TypeScript interface
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Create canonical types (TypeScript & Python)
2. Implement SearchProvider interface
3. Create GoogleScholarAdapter
4. Update existing components to use canonical types

### Phase 2: PubMed Integration
1. Create PubMed API client
2. Implement PubMedAdapter
3. Add backend PubMed endpoints
4. Test feature extraction with PubMed articles

### Phase 3: UI Enhancements
1. Add provider selector component
2. Update SearchControls for multi-provider
3. Enhance ArticleCard for provider-specific display
4. Add provider-specific help text

### Phase 4: Polish & Testing
1. Add provider availability checks
2. Implement error handling
3. Add loading states
4. Create integration tests

## Migration Strategy

1. **Backward Compatibility**: Existing CanonicalScholarArticle continues to work
2. **Gradual Migration**: Components updated one at a time
3. **Type Aliases**: Use type aliases during transition
4. **Feature Flags**: Optional - enable PubMed via feature flag

## Future Extensibility

The design supports adding new providers:
1. Create new adapter implementing SearchProvider
2. Add provider ID to union types
3. Register in provider registry
4. No UI component changes needed

Potential future providers:
- Semantic Scholar
- arXiv
- bioRxiv
- CrossRef
- Microsoft Academic

## Technical Considerations

### Performance
- Lazy load provider adapters
- Cache provider availability status
- Implement request debouncing

### Error Handling
- Provider-specific error messages
- Fallback to available providers
- Clear user feedback

### State Management
- Store selected provider in WorkbenchState
- Persist provider preference
- Clear results on provider switch

## Testing Strategy

1. **Unit Tests**:
   - Adapter transformation logic
   - Canonical type conversions
   - Provider availability checks

2. **Integration Tests**:
   - End-to-end search flows
   - Feature extraction with mixed sources
   - Provider switching

3. **Type Tests**:
   - Canonical type completeness
   - Provider interface compliance 