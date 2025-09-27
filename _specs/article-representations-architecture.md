# Article Representations Architecture

This document describes the article representation system in Jam Bot, explaining the different article classes, their purposes, and the conversion flow between them.

## Core Article Representations

### 1. Service-Level Article Classes (Source-Specific)
These classes handle parsing and abstracting external API responses:

- **`services.pubmed_service.Article`** - PubMed's raw article parser
  - Parses PubMed XML responses via `Article.from_xml()`
  - Handles complex PubMed date fields, author parsing, etc.
  - Owns all PubMed-specific parsing logic

- **`services.google_scholar_service.GoogleScholarArticle`** - Google Scholar's article parser
  - Parses SerpAPI responses via `GoogleScholarArticle.from_serpapi_result()`
  - Extracts DOI, journal, citation counts from Scholar data
  - Owns all Scholar-specific parsing logic

### 2. Domain Models (Smart Search)
These are the primary models used in Smart Search workflows:

- **`schemas.smart_search.FilteredArticle`** - Wraps CanonicalResearchArticle with filtering metadata
  - Adds confidence scores, filtering decisions  
  - Used after semantic filtering step
  - Now uses CanonicalResearchArticle instead of the deprecated SearchArticle

- **`schemas.smart_search.SearchPaginationInfo`** - Pagination information for search results

### 3. Canonical Types (Legacy Bridge)
These provide unified interfaces for the workbench and cross-source features:

- **`schemas.canonical_types.CanonicalPubMedArticle`** - Standardized PubMed format
- **`schemas.canonical_types.CanonicalScholarArticle`** - Standardized Scholar format
- **`schemas.canonical_types.CanonicalResearchArticle`** - Unified research format
  - Bridge format enabling workbench to work with any source
  - Prevents workbench features from needing source-specific handling

## Conversion Flow

The conversion chain is linear and predictable:

```
PubMed API → Article → CanonicalPubMedArticle → CanonicalResearchArticle → SearchArticle
Scholar API → GoogleScholarArticle → CanonicalResearchArticle → SearchArticle
```

### Converter Functions

Each source has exactly one converter function:

- **`pubmed_to_research_article()`** - Converts PubMed canonical to unified format
- **`scholar_to_research_article()`** - Converts GoogleScholarArticle to unified format

## Design Principles

### 1. Service Layer Owns Parsing ✅
- Each service (PubMed, Scholar) owns its external API parsing logic
- Complex data extraction is encapsulated in service-specific article classes
- No external code needs to understand source-specific formats

### 2. Single Converter Per Source ✅
- One conversion function per source
- No confusion about which converter to use
- Clear, predictable conversion paths

### 3. Smart Search Uses Simple Domain Models ✅
- `SearchArticle` provides clean, simple interface for Smart Search
- No canonical complexity exposed to end users
- Consistent experience regardless of source

### 4. Clean Separation of Concerns ✅
- **Services**: Handle external APIs and data parsing
- **Converters**: Handle format translation between layers
- **Smart Search**: Operates on simple, consistent domain models
- **Workbench**: Uses unified canonical format for cross-source features

## Why This Architecture Is Correct

1. **Not Overly Complicated**: Each layer has a clear, single purpose
2. **Predictable**: Linear conversion chain with no branching complexity
3. **Maintainable**: Source-specific logic is isolated to service classes
4. **Extensible**: New sources can be added by following the same pattern
5. **User-Friendly**: Smart Search users work with simple, consistent models

## Example Usage

```python
# PubMed flow
pubmed_articles = search_pubmed(query)  # Returns List[CanonicalResearchArticle]
search_articles = convert_to_search_articles(pubmed_articles)  # For Smart Search

# Scholar flow  
scholar_articles, metadata = scholar_service.search_articles(query)  # Returns List[GoogleScholarArticle]
research_articles = [scholar_to_research_article(a) for a in scholar_articles]
search_articles = convert_to_search_articles(research_articles)  # For Smart Search
```

The architecture successfully balances simplicity for end users with the complexity required to handle diverse external data sources.