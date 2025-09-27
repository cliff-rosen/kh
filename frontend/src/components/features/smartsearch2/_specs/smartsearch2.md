# Smart Search 2 Specification

## Overview
Smart Search 2 is an alternate interface to the Smart Search functionality that provides direct access to search and filtering capabilities without requiring users to go through the guided workflow.

## Navigation
- Add menu item "Smart Search 2" in the top navigation bar, positioned to the right of the existing "Smart Search" item
- Route: `/smart-search-2`

## Architecture
- Uses the same `SmartSearchContext` as regular Smart Search
- Shares the same backend API endpoints
- Reuses existing components where possible (ResultsViewer, FilterPanel, etc.)

## User Flow

### 1. Start Page
The initial page presents a clean search interface with:

#### Search Form
- **Source Selection**: Radio buttons for:
  - PubMed (default)
  - Google Scholar
- **Search Keywords**: 
  - Large text input field for entering search query
  - Placeholder text appropriate to selected source
- **Search Button**: Primary action button to execute search
- **Keyword Helper Toggle**: Button/link to switch to AI-assisted keyword generation

### 2. Search Execution
When user clicks Search:
- Execute search immediately using provided keywords
- Show loading state
- Display results using the existing Smart Search results viewer

### 3. Results Display
Uses the same results viewer as Smart Search final results:
- **View Options**: Toggle between Tabular, Line, and Card views
- **Filters**: All existing filter capabilities
- **AI Columns**: Ability to add custom AI-extracted columns
- **Export**: Export filtered results
- **Pagination**: Load more results as needed

### 4. Actions from Results
- **New Search Button**: Clears everything and returns to start page
- **Edit and Re-search**: 
  - User can edit query in place
  - Clicking Search again clears all results and custom columns
  - Executes fresh search with new query

### 5. Keyword Helper Mode
Optional AI-assisted keyword generation:

#### Activation
- Toggle/button on main search form: "Use Keyword Helper"
- Switches the interface to show additional fields

#### Helper Interface
When activated, shows:
1. **Research Question Field**: Text area for natural language question
2. **Generate Keywords Button**: Triggers AI generation
3. **Generated Keywords Display**: Shows AI-suggested keywords
4. **Edit/Refine**: User can edit generated keywords
5. **Use These Keywords**: Applies keywords to main search field
6. **Cancel**: Returns to simple search mode

#### Helper Workflow
1. User enters research question
2. AI generates appropriate boolean/natural language query
3. User can edit/refine the suggestion
4. User accepts keywords → returns to main search with keywords populated
5. User executes search normally

## Component Structure

```
/smart-search-2
  SmartSearch2Page.tsx           # Main page component
  components/
    SearchForm.tsx               # Search form with source selection
    KeywordHelper.tsx            # AI keyword generation interface
    QuickSearchResults.tsx       # Wrapper around existing results viewer
```

## State Management
- Leverages existing `SmartSearchContext`
- Manages its own local state for:
  - Current search mode (direct vs helper)
  - Form values before submission
  - Helper mode state

## Key Differences from Smart Search v1
1. **No forced workflow** - Users can search immediately
2. **Direct access** to all features
3. **Persistent results** - Results stay visible while editing query
4. **Quick iteration** - Easy to refine and re-search
5. **Optional AI assistance** - Keyword helper is optional, not required

## API Integration
Uses existing Smart Search API endpoints:
- `/api/smart-search/execute-search` - Direct search execution
- `/api/smart-search/generate-search-keywords` - For keyword helper
- `/api/smart-search/filter-articles` - For filtering results
- All existing custom column and export endpoints

## UI/UX Considerations
1. **Clean initial interface** - Minimal, focused on search
2. **Progressive disclosure** - Advanced features appear after search
3. **Fast iteration** - Quick to modify and re-run searches
4. **Familiar components** - Reuses existing Smart Search UI elements
5. **Clear actions** - Obvious how to start over or refine

## Session Management
- Creates a new session for each search
- Sessions are independent from Smart Search v1 sessions
- No session restoration/URL sharing initially (can be added later)

## Future Enhancements
- Save/load search queries
- Search history
- Session sharing via URL
- Saved custom column configurations
- Bulk operations on results