import { useCallback, forwardRef } from 'react';
import { Tablizer, TableColumn, AIColumnResult, RowViewerProps, TablizerRef, ScoreConfig } from '../tools/Tablizer';
import ArticleViewerModal from '../articles/ArticleViewerModal';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import { tablizerApi } from '../../lib/api/tablizerApi';

// ============================================================================
// Types
// ============================================================================

export interface PubMedTableProps {
    articles: CanonicalResearchArticle[];
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
    onSaveToHistory,
    onFetchMoreForAI,
    onColumnsChange
}, ref) {
    // Handle AI column processing via tablizer API
    const handleProcessAIColumn = useCallback(async (
        data: CanonicalResearchArticle[],
        promptTemplate: string,
        outputType: 'text' | 'number' | 'boolean',
        scoreConfig?: ScoreConfig
    ): Promise<AIColumnResult[]> => {
        return await tablizerApi.processAIColumn({
            items: data as unknown as Record<string, unknown>[],
            itemType: 'article',
            criteria: promptTemplate,
            outputType: outputType,
            threshold: 0.5,
            scoreConfig: scoreConfig
        });
    }, []);

    return (
        <Tablizer<CanonicalResearchArticle>
            ref={ref}
            data={articles}
            idField="pmid"
            columns={PUBMED_COLUMNS}
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
