  Article Card Components Comparison

  Overview

  | Component           | Location                      | Data Type                   | Purpose                           |
  |---------------------|-------------------------------|-----------------------------|-----------------------------------|
  | IncludedArticleCard | ReportCuration.tsx (inline)   | CurationIncludedArticle     | Edit articles in report           |
  | FilteredArticleCard | ReportCuration.tsx (inline)   | CurationFilteredArticle     | Add filtered articles to report   |
  | ReportArticleCard   | ExecutionDetail.tsx (inline)  | ReportArticle + WipArticle? | View report preview (read-only)   |
  | WipArticleCard      | ExecutionDetail.tsx (inline)  | WipArticle                  | View pipeline results (read-only) |
  | ReportArticleCard   | reports/ReportArticleCard.tsx | ReportArticle               | View published reports            |
  | PubMedArticleCard   | chat/PubMedArticleCard.tsx    | PubMedArticleData           | Search results display            |

  ---
  Feature Matrix

  | Feature              |   Included    |    Filtered    | Report (Exec) |    Wip    | Report (shared) |  PubMed  |
  |----------------------|---------------|----------------|---------------|-----------|-----------------|----------|
  | Basic Info           |               |                |               |           |                 |          |
  | Title (linked)       |       ✓       |       ✓        |       ✓       |     ✓     |        ✓        |    ✓     |
  | Authors              |       ✓       |       ✓        |       ✓       |     ✓     |        ✓        |    ✓     |
  | Journal/Year         |       ✓       |       ✓        |       ✓       |     ✓     |        ✓        |    ✓     |
  | PMID                 |       ✓       |       ✓        |       ✓       |     ✓     |        ✓        |    ✓     |
  | DOI link             |       -       |       -        |       -       |     -     |        -        |    ✓     |
  | PMC link             |       -       |       -        |       -       |     -     |        -        |    ✓     |
  | Expand/Collapse      |               |                |               |           |                 |          |
  | Expandable           |       ✓       |       ✓        |       ✓       |     ✓     |        -        |    ✓     |
  | Expand controlled by |    parent     |     parent     |   internal    | internal  |       n/a       | internal |
  | Content Sections     |               |                |               |           |                 |          |
  | Abstract             |       ✓       |       ✓        |       ✓       |     ✓     |     opt-in      |    ✓     |
  | AI Summary           |       ✓       |       -        |       ✓       |     -     |        -        |    -     |
  | Filter Score         |       ✓       |       ✓        |       ✓       |     ✓     |        -        |    -     |
  | Filter Reasoning     |       ✓       |       ✓        |       ✓       |     ✓     |        -        |    -     |
  | Curation Notes       |    ✓ edit     |     ✓ edit     |    ✓ view     |  ✓ view   |        -        |    -     |
  | Relevance Rationale  |       -       |       -        |       -       |     -     |        ✓        |    -     |
  | Full Text            |       -       |       -        |       -       |     -     |        -        |    ✓     |
  | Citation             |       -       |       -        |       -       |     -     |        -        |    ✓     |
  | Status Badges        |               |                |               |           |                 |          |
  | Curator Added        |       ✓       |       -        |       ✓       |     ✓     |        -        |    -     |
  | Curator Excluded     |       -       |       ✓        |       -       |     ✓     |        -        |    -     |
  | Duplicate indicator  |       -       |       -        |       -       |     ✓     |        -        |    -     |
  | Actions              |               |                |               |           |                 |          |
  | Exclude              |       ✓       |       -        |       -       |     -     |        -        |    -     |
  | Include              |       -       |       ✓        |       -       |     -     |        -        |    -     |
  | Change Category      |       ✓       |       ✓        |       -       |     -     |        -        |    -     |
  | Save Notes           |       ✓       |       ✓        |       -       |     -     |        -        |    -     |
  | Edit AI Summary      |     ✓ btn     |       -        |       -       |     -     |        -        |    -     |
  | Copy to clipboard    |       -       |       -        |       -       |     -     |        -        |    ✓     |
  | onClick handler      |       -       |       -        |       -       |     -     |        ✓        |    -     |
  | Visual               |               |                |               |           |                 |          |
  | Ranking number       |       ✓       |       -        |       -       |     -     |        -        |    -     |
  | Score color coding   |     green     |      red       |     green     |  varies   |        -        |    -     |
  | Border highlight     | green (added) | red (excluded) | green (added) | green/red |        -        |    -     |
  | Props Interface      |               |                |               |           |                 |          |
  | Named interface      |   ❌ inline   |   ❌ inline    |   ❌ inline   | ❌ inline |        ✓        |    ✓     |
  | Prop count           |      10       |       7        |       2       |     2     |        3        |    1     |

  ---
  Consolidation Analysis

  Group A: Operations/Curation Cards (high overlap, good candidates)
  - IncludedArticleCard
  - FilteredArticleCard
  - ReportArticleCard (ExecutionDetail)
  - WipArticleCard

  These 4 share:
  - Same basic layout (title, authors, journal, PMID)
  - Same expand pattern (chevron, show/hide sections)
  - Same expanded sections (abstract, filter reasoning, curation notes)
  - Same status badges (curator added/excluded)
  - Same border highlighting pattern

  Group B: Different Use Cases (keep separate)
  - ReportArticleCard (shared) - Simple, for published report viewing
  - PubMedArticleCard - Rich, for search with copy/citation features

  ---
  Recommendation

  Consolidate Group A into one component:

  interface ArticleCardProps {
      // Data - accepts either type
      article: CurationIncludedArticle | CurationFilteredArticle | WipArticle;

      // Display options
      mode: 'view' | 'edit-included' | 'edit-filtered';
      ranking?: number;
      expanded?: boolean;

      // Optional features
      categories?: CurationCategory[];
      showScore?: boolean;

      // Callbacks (all optional, enables/disables features)
      onToggleExpand?: () => void;
      onExclude?: () => void;
      onInclude?: (categoryId?: string) => void;
      onCategoryChange?: (categoryId: string) => void;
      onSaveNotes?: (notes: string) => void;

      // Loading states
      isProcessing?: boolean;
      isSavingCategory?: boolean;
  }

  Keep separate:
  - ReportArticleCard (shared) - too simple, different purpose
  - PubMedArticleCard - unique features (citation, copy, full text)