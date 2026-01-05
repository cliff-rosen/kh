import { useCallback, forwardRef } from 'react';
import { Tablizer, TableColumn, AIColumnResult, RowViewerProps, TablizerRef } from '../tools/Tablizer';
import ArticleViewerModal from '../articles/ArticleViewerModal';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import { researchStreamApi } from '../../lib/api';

// ============================================================================
// Types
// ============================================================================

export interface PubMedTableProps {
    articles: CanonicalResearchArticle[];
    filterArticles?: CanonicalResearchArticle[];
    onSaveToHistory?: (filteredIds: string[], filterDescription: string) => void;
    onFetchMoreForAI?: () => Promise<CanonicalResearchArticle[]>;
    onColumnsChange?: (aiColumns: Array<{ name: string; type: string; filterActive?: boolean }>) => void;
}

// Re-export types for consumers
export type { TableColumn, TablizerRef as PubMedTableRef };

// ============================================================================
// Column Definitions
// ============================================================================

const PUBMED_COLUMNS: TableColumn[] = [
    { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: false },
    { id: 'authors', label: 'Authors', accessor: 'authors', type: 'text', visible: false },
    { id: 'journal', label: 'Journal', accessor: 'journal', type: 'text', visible: true },
    { id: 'publication_date', label: 'Date', accessor: 'publication_date', type: 'date', visible: true },
];

// ============================================================================
// Adapter Components
// ============================================================================

// Adapter component for ArticleViewerModal to match RowViewer interface
function ArticleRowViewer({ data, initialIndex, onClose }: RowViewerProps<CanonicalResearchArticle>) {
    return (
        <ArticleViewerModal
            articles={data}
            initialIndex={initialIndex}
            onClose={onClose}
        />
    );
}

// ============================================================================
// Main Component
// ============================================================================

const PubMedTable = forwardRef<TablizerRef, PubMedTableProps>(function PubMedTable({
    articles,
    filterArticles,
    onSaveToHistory,
    onFetchMoreForAI,
    onColumnsChange
}, ref) {
    // Handle AI column processing via semantic filter service
    const handleProcessAIColumn = useCallback(async (
        data: CanonicalResearchArticle[],
        promptTemplate: string,
        outputType: 'text' | 'number' | 'boolean'
    ): Promise<AIColumnResult[]> => {
        const response = await researchStreamApi.filterArticles({
            articles: data.map(a => ({
                id: a.id || a.pmid || '',
                pmid: a.pmid || '',
                title: a.title || '',
                abstract: a.abstract || '',
                authors: a.authors || [],
                journal: a.journal || '',
                publication_date: a.publication_date || '',
                doi: a.doi || '',
                keywords: [],
                mesh_terms: [],
                categories: [],
                source: 'pubmed'
            })),
            filter_criteria: promptTemplate,
            threshold: 0.5,
            output_type: outputType
        });

        return response.results.map(r => ({
            id: r.article.pmid || r.article.id || '',
            passed: r.passed,
            score: r.score,
            reasoning: r.reasoning
        }));
    }, []);

    return (
        <Tablizer<CanonicalResearchArticle>
            ref={ref}
            data={articles}
            idField="pmid"
            columns={PUBMED_COLUMNS}
            filterData={filterArticles}
            rowLabel="articles"
            RowViewer={ArticleRowViewer}
            onProcessAIColumn={handleProcessAIColumn}
            onSaveToHistory={onSaveToHistory}
            onFetchMoreForAI={onFetchMoreForAI}
            onColumnsChange={onColumnsChange}
        />
    );
});

export default PubMedTable;
