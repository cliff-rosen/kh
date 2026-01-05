import { useState, useCallback } from 'react';
import { TableCellsIcon } from '@heroicons/react/24/outline';
import Tablizer, { TableColumn, AIColumnResult } from './Tablizer';
import ArticleViewerModal from '../../articles/ArticleViewerModal';
import { CanonicalResearchArticle } from '../../../types/canonical_types';
import { ReportArticle } from '../../../types/report';
import { tablizerApi } from '../../../lib/api/tablizerApi';
import { RowViewerProps } from './Tablizer';

// Union type for articles from different sources
type TablizableArticle = CanonicalResearchArticle | ReportArticle;

// Standard columns for articles
const ARTICLE_COLUMNS: TableColumn[] = [
    { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: false },
    { id: 'journal', label: 'Journal', accessor: 'journal', type: 'text', visible: true },
    { id: 'publication_date', label: 'Date', accessor: 'publication_date', type: 'date', visible: true },
];

interface TablizeButtonProps {
    articles: TablizableArticle[];
    title?: string;
    className?: string;
    buttonText?: string;
}

// Adapter component for ArticleViewerModal
function ArticleRowViewer({ data, initialIndex, onClose }: RowViewerProps<TablizableArticle>) {
    return (
        <ArticleViewerModal
            articles={data}
            initialIndex={initialIndex}
            onClose={onClose}
        />
    );
}

/**
 * A button that launches the Tablizer in full-screen mode.
 * Place this near any article list in the app.
 */
export default function TablizeButton({
    articles,
    title = 'Tablizer',
    className = '',
    buttonText
}: TablizeButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    // Handle AI column processing via tablizer API
    const handleProcessAIColumn = useCallback(async (
        data: TablizableArticle[],
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

    if (isOpen) {
        return (
            <Tablizer<TablizableArticle>
                data={articles}
                idField="pmid"
                columns={ARTICLE_COLUMNS}
                title={title}
                rowLabel="articles"
                isFullScreen={true}
                onClose={() => setIsOpen(false)}
                RowViewer={ArticleRowViewer}
                onProcessAIColumn={handleProcessAIColumn}
            />
        );
    }

    return (
        <button
            onClick={() => setIsOpen(true)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors ${className}`}
            title="Open in Tablizer for AI-powered analysis"
        >
            <TableCellsIcon className="h-4 w-4" />
            {buttonText || 'Tablize'}
        </button>
    );
}
