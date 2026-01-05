import { useCallback, forwardRef } from 'react';
import { Tablizer, TableColumn, AIColumnResult, TablizerRef, AIColumnInfo } from '../tools/Tablizer';
import { ReportArticle } from '../../types';
import { researchStreamApi } from '../../lib/api';

// ============================================================================
// Types
// ============================================================================

export interface ReportArticleTableProps {
    articles: ReportArticle[];
    title?: string;
    onColumnsChange?: (aiColumns: AIColumnInfo[]) => void;
    onRowClick?: (articles: ReportArticle[], index: number) => void;
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
    { id: 'relevance_score', label: 'Relevance', accessor: 'relevance_score', type: 'number', visible: true },
    { id: 'categories', label: 'Categories', accessor: 'presentation_categories', type: 'text', visible: true },
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
    // Handle AI column processing via semantic filter service
    const handleProcessAIColumn = useCallback(async (
        data: ReportArticle[],
        promptTemplate: string,
        _outputType: 'text' | 'number' | 'boolean'
    ): Promise<AIColumnResult[]> => {
        const response = await researchStreamApi.filterArticles({
            articles: data.map(a => ({
                id: a.article_id?.toString() || a.pmid || '',
                pmid: a.pmid || '',
                title: a.title || '',
                abstract: a.abstract || '',
                authors: a.authors || [],
                journal: a.journal || '',
                publication_date: a.publication_date || '',
                doi: a.doi || '',
                keywords: [],
                mesh_terms: [],
                categories: a.presentation_categories || [],
                source: 'pubmed'
            })),
            filter_criteria: promptTemplate,
            threshold: 0.5
        });

        return response.results.map(r => ({
            id: r.article.pmid || r.article.id || '',
            passed: r.passed,
            score: r.score,
            reasoning: r.reasoning
        }));
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
