import { useCallback, forwardRef } from 'react';
import { Tablizer, TableColumn, AIColumnResult, TablizerRef, AIColumnInfo } from '../tools/Tablizer';
import { ReportArticle } from '../../types';
import { tablizerApi } from '../../lib/api/tablizerApi';

// ============================================================================
// Types
// ============================================================================

export interface ReportArticleTableProps {
    articles: ReportArticle[];
    title?: string;
    onColumnsChange?: (aiColumns: AIColumnInfo[]) => void;
    onRowClick?: (articles: ReportArticle[], index: number, isFiltered: boolean) => void;
}

// Re-export types for consumers
export type { TablizerRef as ReportArticleTableRef };

// ============================================================================
// Column Definitions
// ============================================================================

const REPORT_COLUMNS: TableColumn[] = [
    { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: false },
    { id: 'journal', label: 'Journal', accessor: 'journal', type: 'text', visible: true },
    { id: 'publication_date', label: 'Date', accessor: 'publication_date', type: 'date', visible: true },
    { id: 'relevance_score', label: 'Relevance', accessor: 'relevance_score', type: 'number', visible: true, excludeFromAITemplate: true },
    { id: 'categories', label: 'Categories', accessor: 'presentation_categories', type: 'text', visible: true, excludeFromAITemplate: true },
];

// ============================================================================
// Main Component
// ============================================================================

const ReportArticleTable = forwardRef<TablizerRef, ReportArticleTableProps>(function ReportArticleTable({
    articles,
    title,
    onColumnsChange,
    onRowClick
}, ref) {
    // Handle AI column processing via tablizer API
    const handleProcessAIColumn = useCallback(async (
        data: ReportArticle[],
        promptTemplate: string,
        outputType: 'text' | 'number' | 'boolean'
    ): Promise<AIColumnResult[]> => {
        return await tablizerApi.processAIColumn({
            items: data as unknown as Record<string, unknown>[],
            itemType: 'article',
            criteria: promptTemplate,
            outputType: outputType,
            threshold: 0.5
        });
    }, []);

    return (
        <Tablizer<ReportArticle>
            ref={ref}
            data={articles}
            idField="pmid"
            columns={REPORT_COLUMNS}
            title={title}
            rowLabel="articles"
            onProcessAIColumn={handleProcessAIColumn}
            onColumnsChange={onColumnsChange}
            onRowClick={onRowClick}
        />
    );
});

export default ReportArticleTable;
