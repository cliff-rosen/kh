# Project Guidelines for Claude

## Code Structure

Follow the rules in [CODE_STRUCTURE_CHECKLIST.md](./CODE_STRUCTURE_CHECKLIST.md) for all backend and frontend code.

---

## Layout Guidelines

### Flex Height Pattern (REQUIRED for scrollable content)

When creating components with scrollable areas that should fill available space:

1. **Never use arbitrary max-height** like `max-h-[600px]` on scrollable containers
2. **Always use the flex chain pattern:**
   - Parent page: `min-h-screen flex flex-col`
   - Fixed elements (header/footer): `flex-shrink-0`
   - Main content area: `flex-1 min-h-0 flex flex-col`
   - Scrollable container: `flex-1 min-h-0 overflow-auto`

3. **Key classes:**
   - `min-h-0` - Required on flex children to allow shrinking below content size
   - `flex-shrink-0` - Prevents headers/toolbars from shrinking
   - `h-full` - Passes height from parent to child

### Example pattern:
```tsx
<div className="min-h-screen flex flex-col">
  <header className="flex-shrink-0">...</header>
  <main className="flex-1 min-h-0 flex flex-col">
    <div className="flex-shrink-0">toolbar</div>
    <div className="flex-1 min-h-0 overflow-auto">scrollable content</div>
  </main>
  <footer className="flex-shrink-0">...</footer>
</div>
```

---

## Data Fetching Pattern for AI-Enabled Tables

When building table components that support AI column processing (like Tablizer or TrialScout):

1. **Two-phase fetch strategy:**
   - Initial search: Fetch small number (e.g., 20-50) for fast display
   - AI processing: Expand to larger set (e.g., 500) when user adds an AI column

2. **Implementation requirements:**
   - Store `lastSearchParams` to enable re-fetching with expanded limit
   - Track `hasFetchedFullSet` state to avoid redundant fetches
   - Provide `onFetchMoreForAI` callback prop to table component
   - Show user feedback: "Fetched X of Y (more fetched for AI)"

3. **Help text must explain:**
   - Initial results are limited for fast display
   - Adding AI columns automatically fetches more records
   - Maximum records available for AI processing

### Example constants:
```tsx
const INITIAL_FETCH_LIMIT = 20;   // Fast initial display
const AI_FETCH_LIMIT = 500;       // Max for AI processing
const DISPLAY_LIMIT = 100;        // Max shown in table
```

See `TablizePubMed.tsx` for reference implementation.
