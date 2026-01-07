import { useCallback, useMemo, forwardRef } from 'react';
import { Tablizer, TableColumn, TablizerRef, AIColumnInfo } from '../tools/Tablizer';
import { ReportArticle } from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface ReportArticleTableProps {
    articles: ReportArticle[];
    title?: string;
    /** Controls abstract column visibility - syncs with report-level compact/expanded toggle */
    showAbstract?: boolean;
    /** Called when abstract column visibility is toggled in Tablizer's column selector */
    onAbstractVisibilityChange?: (visible: boolean) => void;
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
    { id: 'relevance_score', label: 'Relevance', accessor: 'relevance_score', type: 'number', visible: false, excludeFromAITemplate: true },
    { id: 'categories', label: 'Categories', accessor: 'presentation_categories', type: 'text', visible: true, excludeFromAITemplate: true },
];

// ============================================================================
// Main Component
// ============================================================================

const ReportArticleTable = forwardRef<TablizerRef, ReportArticleTableProps>(function ReportArticleTable({
    articles,
    title,
    showAbstract = false,
    onAbstractVisibilityChange,
    onColumnsChange,
    onRowClick
}, ref) {
    // Sync abstract column visibility with showAbstract prop
    const columns = useMemo(() =>
        REPORT_COLUMNS.map(col =>
            col.id === 'abstract' ? { ...col, visible: showAbstract } : col
        ),
        [showAbstract]
    );

    // Handle column visibility changes from Tablizer
    const handleColumnVisibilityChange = useCallback((columnId: string, visible: boolean) => {
        if (columnId === 'abstract' && onAbstractVisibilityChange) {
            onAbstractVisibilityChange(visible);
        }
    }, [onAbstractVisibilityChange]);

    return (
        <Tablizer<ReportArticle>
            ref={ref}
            data={articles}
            idField="pmid"
            columns={columns}
            title={title}
            rowLabel="articles"
            itemType="article"
            onColumnsChange={onColumnsChange}
            onColumnVisibilityChange={handleColumnVisibilityChange}
            onRowClick={onRowClick}
        />
    );
});

export default ReportArticleTable;
