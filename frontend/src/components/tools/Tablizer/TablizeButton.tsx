import { useState } from 'react';
import { TableCellsIcon } from '@heroicons/react/24/outline';
import Tablizer from './Tablizer';
import { CanonicalResearchArticle } from '../../../types/canonical_types';
import { ReportArticle } from '../../../types/report';

// Union type for articles from different sources (same as Tablizer)
type TablizableArticle = CanonicalResearchArticle | ReportArticle;

interface TablizeButtonProps {
    articles: TablizableArticle[];
    title?: string;
    className?: string;
    buttonText?: string;
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

    if (isOpen) {
        return (
            <Tablizer
                articles={articles}
                title={title}
                isFullScreen={true}
                onClose={() => setIsOpen(false)}
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
