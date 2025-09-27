# Article-Group Data Architecture Specification

## Overview

This document defines the complete data architecture for articles and groups, from database models through frontend state management. The core principle is **contextual feature ownership**: extracted features belong to article-group relationships, not to articles globally.

## Core Design Principles

1. **Clean Article Separation**: Articles contain only canonical bibliographic data
2. **Contextual Features**: Extracted features are specific to article-group relationships  
3. **Single Source of Truth**: Each piece of data has one authoritative location
4. **Consistent Naming**: Same entity names across database, API, and frontend
5. **Clear Data Flow**: Explicit patterns for search vs. group operations

## Database Models

### feature_data Record Semantics

The `feature_data` field is a JSONB column that stores key-value pairs where:
- **Key**: Feature ID (string) - matches `FeatureDefinition.id` (NOT name, which can change)
- **Value**: Extracted value (any type) - conforms to `FeatureDefinition.type`

#### Structure
```json
{
  "feature_id_uuid_1": extracted_value,
  "feature_id_uuid_2": another_value
}
```

#### Example: Research Paper Analysis Group
```json
{
  "feat_f47ac10b-58cc-4372-a567-0e02b2c3d479": "yes",
  "feat_6ba7b810-9dad-11d1-80b4-00c04fd430c8": "systematic review", 
  "feat_6ba7b811-9dad-11d1-80b4-00c04fd430c8": "no",
  "feat_f47ac10c-58cc-4372-a567-0e02b2c3d479": "156",
  "feat_550e8400-e29b-41d4-a716-446655440000": "7.5"
}
```

#### Value Type Mapping
| FeatureDefinition.type | Example Value | Validation Rules |
|----------------------|---------------|------------------|
| `'boolean'` | `"yes"` or `"no"` | Must be exactly "yes" or "no" (string) |
| `'text'` | `"systematic review"` | String, max 100 chars, descriptive |
| `'score'` | `"7.5"` | Numeric string within min/max range |

#### Key Constraints
1. **Keys must exist in group.feature_definitions**: Every key in feature_data must match a FeatureDefinition.id
2. **Values must match type**: Boolean features store "yes"/"no", scores store numeric strings
3. **Complete coverage**: All features defined in group should have values (use defaults for missing)
4. **Immutable after extraction**: Values don't change unless re-extracted
5. **Group-scoped**: Same article can have different features in different groups
6. **ID-based mapping**: Never rely on feature names for mapping, always use stable feature IDs

#### Lifecycle
```
Group Creation → feature_data: {} (empty)
    ↓
Feature Extraction → feature_data: {"feat_id1": "value1", ...}
    ↓  
Re-extraction → feature_data: {"feat_id1": "new_value1", ...} (replaces)
```

#### Real-World Example
For a research paper titled "Machine Learning in Healthcare: A Systematic Review":

**Group**: "Healthcare AI Papers"
**Feature Definitions**:
- ID: `feat_f47ac10b-58cc-4372-a567-0e02b2c3d479`, Name: `has_methodology_section` (boolean)
- ID: `feat_6ba7b810-9dad-11d1-80b4-00c04fd430c8`, Name: `primary_research_method` (text)
- ID: `feat_f47ac10c-58cc-4372-a567-0e02b2c3d479`, Name: `sample_size` (text)
- ID: `feat_550e8400-e29b-41d4-a716-446655440000`, Name: `clinical_validation` (boolean)
- ID: `feat_6ba7b811-9dad-11d1-80b4-00c04fd430c8`, Name: `novelty_score` (score, 1-10)

**Feature Data**:
```json
{
  "feat_f47ac10b-58cc-4372-a567-0e02b2c3d479": "yes",
  "feat_6ba7b810-9dad-11d1-80b4-00c04fd430c8": "systematic review and meta-analysis",
  "feat_f47ac10c-58cc-4372-a567-0e02b2c3d479": "47 studies analyzed",
  "feat_550e8400-e29b-41d4-a716-446655440000": "no", 
  "feat_6ba7b811-9dad-11d1-80b4-00c04fd430c8": "6.5"
}
```

**Same article in different group**:
**Group**: "Meta-Analysis Papers"
**Feature Definitions**:
- ID: `feat_123e4567-e89b-12d3-a456-426614174000`, Name: `study_count` (text)
- ID: `feat_987fcdeb-51a2-43d7-8f9e-123456789abc`, Name: `quality_assessment` (boolean)
- ID: `feat_456789ab-cdef-1234-5678-90abcdef1234`, Name: `heterogeneity_reported` (boolean)

**Feature Data**:
```json
{
  "feat_123e4567-e89b-12d3-a456-426614174000": "47",
  "feat_987fcdeb-51a2-43d7-8f9e-123456789abc": "yes",
  "feat_456789ab-cdef-1234-5678-90abcdef1234": "yes"
}
```

This demonstrates how the same article has completely different contextual features depending on which analytical group it belongs to.

### Core Tables (Existing - Minimal Changes)

```sql
-- Article groups (analytical collections) - EXISTING TABLE
CREATE TABLE article_group (
    id VARCHAR(36) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    search_query TEXT,
    search_provider VARCHAR(50),
    search_params JSON,
    columns JSON NOT NULL DEFAULT '[]', -- Stores FeatureDefinition[] 
    article_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Articles within groups (embedded storage) - EXISTING TABLE  
CREATE TABLE article_group_detail (
    id VARCHAR(36) PRIMARY KEY,
    article_group_id VARCHAR(36) NOT NULL REFERENCES article_group(id),
    article_data JSON NOT NULL, -- Full CanonicalResearchArticle JSON
    extracted_features JSON NOT NULL DEFAULT '{}', -- Feature data keyed by feature.id
    notes TEXT DEFAULT '',
    article_metadata JSON NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- NO separate articles table - articles embedded in article_group_detail
-- This avoids complex ID matching across different sources (PubMed, Scholar, etc.)
```

### Data Ownership Rules

| Data Type | Owner | Storage Location | Scope |
|-----------|-------|------------------|-------|
| Bibliographic data | Article-Group relationship | `article_group_detail.article_data` | Contextual |
| Feature definitions | Group | `article_group.columns` | Group-specific |
| Feature data | Article-Group relationship | `article_group_detail.extracted_features` | Contextual |
| Article ordering | Group context | `article_group_detail.position` | Group-specific |

## Backend Models (Python/Pydantic)

### Existing Models (Minimal Changes Required)

```python
# CanonicalResearchArticle already exists in schemas/canonical_types.py
class CanonicalResearchArticle(BaseModel):
    """Unified canonical schema for research articles - EXISTING"""
    id: str
    title: str
    abstract: Optional[str] = None
    authors: List[str] = []
    publication_year: Optional[int] = None
    doi: Optional[str] = None
    # ... other fields ...
    extracted_features: Optional[Dict[str, Any]] = None  # Already exists!

# NEW - Added to schemas/workbench.py
class FeatureDefinition(BaseModel):
    """Definition of an extractable feature"""
    id: str  # Stable UUID for mapping feature_data
    name: str  # Display name (can change)
    description: str
    type: Literal['boolean', 'text', 'score']
    options: Optional[Dict[str, Any]] = {}

# UPDATED - Modified in schemas/workbench.py  
class ArticleGroupDetail(BaseModel):
    """Junction model: article within a group context"""
    id: str
    article_id: str
    group_id: str
    article: CanonicalResearchArticle  # Full embedded article
    feature_data: Dict[str, Any] = {}  # Feature data keyed by feature.id
    position: Optional[int] = None
    added_at: str

# UPDATED - Modified in schemas/workbench.py
class ArticleGroup(BaseModel):
    """Complete group with articles and their contextual features"""
    id: str
    name: str
    description: Optional[str] = None
    feature_definitions: List[FeatureDefinition] = []  # Was 'columns'
    articles: List[ArticleGroupDetail] = []
    user_id: int
    created_at: str
    updated_at: str
```

## API Contracts

### Search Operations
```python
# GET /api/search/articles
class SearchResponse(BaseModel):
    articles: List[CanonicalResearchArticle]  # Clean articles only
    metadata: SearchMetadata
    
# POST /api/search/articles  
class SearchRequest(BaseModel):
    query: str
    page: int = 1
    page_size: int = 20
```

### Group Operations
```python
# GET /api/workbench/groups/{group_id}
class GroupDetailResponse(BaseModel):
    group: ArticleGroup  # Includes articles with contextual features

# POST /api/workbench/groups
class CreateGroupRequest(BaseModel):
    name: str
    description: Optional[str] = None
    article_ids: List[str]  # From search results
    
# POST /api/workbench/extract
class ExtractRequest(BaseModel):
    group_id: str
    features: List[FeatureDefinition]
    
class ExtractResponse(BaseModel):
    updated_articles: List[ArticleGroupDetail]  # With new features
```

## Frontend Data Architecture

### Unified Collection Model

**Core Insight**: A search result IS a group - both are containers for articles with metadata and decorators (columns/features).

Instead of separate `searchResults` and `currentGroup` state, we use a unified `ArticleCollection` model that can represent:
- **Search collections**: Articles from search with search metadata  
- **Saved groups**: Persisted articles with extracted features
- **Modified collections**: Groups that have been edited/filtered

```typescript
enum CollectionSource {
  SEARCH = 'search',        // From search API
  SAVED_GROUP = 'saved',    // From saved group API  
  MODIFIED = 'modified'     // Edited/filtered from original
}

interface ArticleCollection {
  // Identity
  id: string;                                    // UUID for all collections
  source: CollectionSource;                      // How this collection was created
  name: string;                                  // Display name
  
  // Articles with contextual data
  articles: ArticleGroupDetail[];                // Always wrapped, may have empty features
  
  // Feature definitions  
  feature_definitions: FeatureDefinition[];      // What features this collection extracts
  
  // Source metadata
  search_params?: SearchParams;                  // If source=SEARCH
  saved_group_id?: string;                       // If source=SAVED_GROUP  
  parent_collection_id?: string;                 // If source=MODIFIED
  
  // State
  is_saved: boolean;                            // Whether persisted to backend
  is_modified: boolean;                         // Whether changed since load/create
  created_at: string;
  updated_at: string;
}

interface SearchParams {
  query: string;
  filters: Record<string, any>;
  page: number;
  page_size: number;
}
```

#### Collection Creation Patterns

**1. Search Collection**
```typescript
// User performs search
const searchResponse = await searchArticles(query, params);

// Create collection from search results
const searchCollection: ArticleCollection = {
  id: generateUUID(),
  source: CollectionSource.SEARCH,
  name: `Search: "${query}"`,
  articles: searchResponse.articles.map(article => ({
    id: generateUUID(),
    article_id: article.id,
    group_id: '', // Not persisted yet
    article: article,
    feature_data: {}, // Empty initially
    added_at: new Date().toISOString()
  })),
  feature_definitions: [], // No features yet
  search_params: params,
  is_saved: false,
  is_modified: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};
```

**2. Saved Group Collection**  
```typescript
// User loads saved group
const groupResponse = await loadGroup(groupId);

// Already comes as complete collection
const savedCollection: ArticleCollection = {
  id: groupResponse.group.id,
  source: CollectionSource.SAVED_GROUP,
  name: groupResponse.group.name,
  articles: groupResponse.group.articles, // Has feature_data
  feature_definitions: groupResponse.group.feature_definitions,
  saved_group_id: groupResponse.group.id,
  is_saved: true,
  is_modified: false,
  created_at: groupResponse.group.created_at,
  updated_at: groupResponse.group.updated_at
};
```

**3. Modified Collection**
```typescript
// User filters/edits existing collection
const modifiedCollection: ArticleCollection = {
  ...originalCollection,
  id: generateUUID(), // New ID for modified version
  source: CollectionSource.MODIFIED,
  name: `${originalCollection.name} (filtered)`,
  articles: filteredArticles,
  parent_collection_id: originalCollection.id,
  is_saved: false,
  is_modified: true,
  updated_at: new Date().toISOString()
};
```

#### Unified Frontend State

```typescript
interface WorkbenchState {
  // SINGLE COLLECTION STATE
  currentCollection: ArticleCollection | null;   // The active collection
  collectionLoading: boolean;
  
  // UI STATE  
  selectedArticleIds: Set<string>;               // For operations on articles
  
  // NO separate search/group state
  // NO data duplication
}
```

#### Collection Operations & State Transitions

**1. Search → Collection**
```typescript
async function performSearch(query: string, params: SearchParams) {
  const searchResponse = await searchArticles(query, params);
  
  const collection: ArticleCollection = {
    id: generateUUID(),
    source: CollectionSource.SEARCH,
    name: `Search: "${query}"`,
    articles: searchResponse.articles.map(article => ({
      id: generateUUID(),
      article_id: article.id,
      group_id: '',
      article: article,
      extracted_features: {},
      added_at: new Date().toISOString()
    })),
    column_definitions: [],
    search_params: params,
    is_saved: false,
    is_modified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  setCurrentCollection(collection);
}
```

**2. Collection → Save as Group**
```typescript
async function saveCollection(collection: ArticleCollection, name: string) {
  const articleIds = collection.articles.map(a => a.article_id);
  const savedGroup = await createGroup(name, articleIds, collection.feature_definitions);
  
  const savedCollection: ArticleCollection = {
    ...collection,
    id: savedGroup.id,
    source: CollectionSource.SAVED_GROUP,
    name: savedGroup.name,
    saved_group_id: savedGroup.id,
    is_saved: true,
    is_modified: false,
    updated_at: savedGroup.updated_at
  };
  
  setCurrentCollection(savedCollection);
}
```

**3. Collection → Extract Features**
```typescript  
async function extractFeaturesFromCollection(
  collection: ArticleCollection, 
  features: FeatureDefinition[]
) {
  // Update feature definitions
  const updatedCollection = {
    ...collection,
    feature_definitions: [...collection.feature_definitions, ...features],
    is_modified: true,
    updated_at: new Date().toISOString()
  };
  
  // Extract features (same for all collection types)
  const extractResponse = await extractFeatures(
    collection.saved_group_id || 'temp', 
    features
  );
  
  // Update articles with new features
  updatedCollection.articles = updatedCollection.articles.map(articleDetail => {
    const updatedFeatures = extractResponse.find(r => r.article_id === articleDetail.article_id);
    return {
      ...articleDetail,
      feature_data: {
        ...articleDetail.feature_data,
        ...updatedFeatures?.feature_data
      }
    };
  });
  
  setCurrentCollection(updatedCollection);
}
```

#### Unified Component Data Access

**Single Article Table Component**
```typescript
// Works with ANY collection type
interface ArticleTableProps {
  collection: ArticleCollection;
  onExtractFeatures: (features: FeatureDefinition[]) => void;
  onSaveCollection: (name: string) => void;
  onModifyCollection: (filter: ArticleFilter) => void;
}

// Displays:
// - Core article columns: title, abstract, authors, etc.
// - Feature columns from: collection.feature_definitions
// - Feature values from: collection.articles[].feature_data[feature.id]
// - Collection metadata: source, is_saved, is_modified states
```

**Collection Header Component**
```typescript
interface CollectionHeaderProps {
  collection: ArticleCollection;
}

// Shows context-aware information:
// - Search collections: query, result count, search params
// - Saved groups: group name, save date, modification status  
// - Modified collections: parent collection, filter info
```

#### Unified Table Rendering

```typescript
// Single table component that works with any collection
function renderTableColumns(collection: ArticleCollection) {
  const columns = [
    // Core article columns (always present)
    { id: 'title', header: 'Title', accessorFn: (item: ArticleGroupDetail) => item.article.title },
    { id: 'authors', header: 'Authors', accessorFn: (item: ArticleGroupDetail) => item.article.authors.join(', ') },
    { id: 'year', header: 'Year', accessorFn: (item: ArticleGroupDetail) => item.article.publication_year },
    
    // Feature columns (dynamic based on collection.feature_definitions)
    ...collection.feature_definitions.map(feature => ({
      id: feature.id,
      header: feature.name,  // Display name
      accessorFn: (item: ArticleGroupDetail) => 
        item.feature_data[feature.id] || getDefaultValue(feature.type),
      cell: ({ getValue }) => formatCellValue(getValue(), feature.type)
    }))
  ];
  
  return columns;
}

// Works for search collections (no feature columns) and saved groups (with features)
function ArticleTable({ collection }: { collection: ArticleCollection }) {
  const columns = renderTableColumns(collection);
  
  return (
    <div>
      <CollectionHeader collection={collection} />
      <Table 
        data={collection.articles} 
        columns={columns}
        // Show collection-specific actions based on source
        actions={getCollectionActions(collection)}
      />
    </div>
  );
}
```

#### Collection Action Patterns

```typescript
function getCollectionActions(collection: ArticleCollection) {
  const actions = [];
  
  // Always available
  actions.push('extract_features', 'export_csv', 'filter_articles');
  
  // Source-specific actions
  switch (collection.source) {
    case CollectionSource.SEARCH:
      actions.push('save_as_group', 'refine_search');
      break;
      
    case CollectionSource.SAVED_GROUP:
      if (collection.is_modified) {
        actions.push('save_changes', 'revert_changes');
      }
      actions.push('duplicate_group', 'delete_group');
      break;
      
    case CollectionSource.MODIFIED:
      actions.push('save_as_new_group', 'apply_to_parent');
      break;
  }
  
  return actions;
}
```

#### Data Integrity Rules

**Unified Collection Rules**:
1. Every collection MUST have a unique `id` and `source`
2. `articles` array always contains `ArticleGroupDetail[]` (even for search results)
3. `feature_data` may be empty `{}` but must exist
4. Feature keys MUST match `collection.feature_definitions[].id`
5. `is_saved` and `is_modified` flags control available actions

**State Management Rules**:
1. Only one `currentCollection` at a time (no separate search/group state)
2. Collection source determines available operations
3. Feature extraction works the same regardless of source
4. Saving transforms collection source from SEARCH/MODIFIED → SAVED_GROUP

**UI Consistency Rules**:
1. Same table component works for all collection types
2. Feature columns appear when `feature_definitions` exist
3. Collection header shows context-appropriate information
4. Actions menu adapts to collection source and state

This unified approach eliminates the artificial distinction between "search results" and "groups" - they're all just collections of articles with different sources and states.

### TypeScript Types

```typescript
// Core types (match backend exactly)
interface CanonicalResearchArticle {
  id: string;
  title: string;
  abstract?: string;
  authors: string[];
  publication_year?: number;
  doi?: string;
  arxiv_id?: string;
  created_at?: string;
  updated_at?: string;
  // NO extracted_features
}

interface FeatureDefinition {
  id: string;  // Stable UUID for mapping feature_data
  name: string;  // Display name (can change)
  description: string;
  type: 'boolean' | 'text' | 'score';
  options?: Record<string, any>;
}

interface ArticleGroupDetail {
  id: string;
  article_id: string;
  group_id: string;
  article: CanonicalResearchArticle;
  feature_data: Record<string, any>;
  position?: number;
  added_at: string;
}

interface ArticleGroup {
  id: string;
  name: string;
  description?: string;
  feature_definitions: FeatureDefinition[];
  articles: ArticleGroupDetail[];
  user_id: string;
  created_at: string;
  updated_at: string;
}
```

### State Management

```typescript
// Workbench Context - Single source of truth
interface WorkbenchState {
  // Search state (temporary, clean articles)
  searchResults: CanonicalResearchArticle[];
  searchMetadata: SearchMetadata | null;
  searchLoading: boolean;
  
  // Group state (persistent, articles with contextual features)
  currentGroup: ArticleGroup | null;
  groupLoading: boolean;
  
  // UI state
  selectedArticleIds: Set<string>;
  
  // NO extracted features stored separately
  // NO duplicate article storage
}

// API client methods
interface WorkbenchApi {
  // Search returns clean articles
  searchArticles(query: string, page?: number): Promise<{
    articles: CanonicalResearchArticle[];
    metadata: SearchMetadata;
  }>;
  
  // Group operations work with contextual data
  loadGroup(groupId: string): Promise<ArticleGroup>;
  createGroup(name: string, articleIds: string[]): Promise<ArticleGroup>;
  extractFeatures(groupId: string, features: FeatureDefinition[]): Promise<ArticleGroup>;
}
```

## Data Flow Patterns

### 1. Search Flow
```
User Search Input
    ↓
Frontend: searchArticles()
    ↓
Backend: Query articles table
    ↓
API Response: CanonicalResearchArticle[]
    ↓
Frontend: Store in searchResults
    ↓
UI: Display clean articles
```

### 2. Group Creation Flow
```
User Selects Articles from Search
    ↓
Frontend: createGroup(name, articleIds)
    ↓
Backend: 
  - Create ArticleGroup record
  - Create ArticleGroupDetail records
  - Return complete group
    ↓
Frontend: Store in currentGroup
    ↓
UI: Display group with articles (no features yet)
```

### 3. Group Loading Flow
```
User Loads Existing Group
    ↓
Frontend: loadGroup(groupId)
    ↓
Backend:
  - Query ArticleGroup
  - Join ArticleGroupDetail + Articles
  - Return complete group with features
    ↓
Frontend: Store in currentGroup
    ↓
UI: Display group with contextual features
```

### 4. Feature Extraction Flow
```
User Defines Columns + Extracts
    ↓
Frontend: extractFeatures(groupId, columns)
    ↓
Backend:
  - Update group.column_definitions
  - Extract features for each article
  - Update article_group_details.extracted_features
  - Return updated group
    ↓
Frontend: Update currentGroup
    ↓
UI: Display articles with new features
```

## Component Data Patterns

### Search Results Component
```typescript
// Receives clean articles from search
interface SearchResultsProps {
  articles: CanonicalResearchArticle[];
  onSelectArticles: (ids: string[]) => void;
}

// NO feature columns shown here
// Articles are selectable for group creation
```

### Group Table Component  
```typescript
// Receives group with contextual features
interface GroupTableProps {
  group: ArticleGroup;
  onExtractFeatures: (columns: ColumnDefinition[]) => void;
}

// Shows articles with their group-specific features
// Feature columns based on group.column_definitions
// Feature data from articles[].extracted_features
```

## Migration Strategy

### Phase 1: Database Schema
- [ ] Remove extracted_features from articles table
- [ ] Ensure article_group_details has extracted_features JSONB column
- [ ] Migrate existing feature data to junction table

### Phase 2: Backend Models
- [ ] Remove extracted_features from CanonicalResearchArticle
- [ ] Ensure ArticleGroupDetail has extracted_features field
- [ ] Update all API endpoints to use correct models

### Phase 3: Frontend Types
- [ ] Remove ArticleGroupItem type completely
- [ ] Standardize on ArticleGroupDetail everywhere
- [ ] Remove extracted_features from article types

### Phase 4: State Management
- [ ] Clean up WorkbenchContext to use single source of truth
- [ ] Remove duplicate feature storage
- [ ] Ensure search results are clean articles only

### Phase 5: Component Updates
- [ ] Update all components to use correct data sources
- [ ] Remove feature display from search results
- [ ] Ensure group table uses group.articles[].extracted_features

## Validation Rules

### Data Integrity
1. Articles in search results MUST NOT have extracted_features
2. Articles in groups MUST have extracted_features (may be empty {})
3. Group column_definitions MUST match keys in extracted_features
4. Frontend MUST NOT store features outside of currentGroup

### API Contracts
1. Search endpoints MUST return CanonicalResearchArticle[]
2. Group endpoints MUST return ArticleGroup with ArticleGroupDetail[]
3. Extract endpoints MUST update junction table, not articles table

### Frontend State
1. searchResults contains only clean articles
2. currentGroup contains complete contextual data
3. No duplicate article storage across state properties
4. Feature data flows only through currentGroup.articles[].extracted_features

This architecture provides clear separation of concerns, eliminates data duplication, and establishes a single source of truth for each type of data.