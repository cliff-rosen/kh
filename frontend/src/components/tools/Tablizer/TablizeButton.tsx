import { useState } from 'react';
import { TableCellsIcon } from '@heroicons/react/24/outline';
import Tablizer, { TableColumn, TableRow } from './Tablizer';

interface TablizeButtonProps {
    data: any[];
    columns: { id: string; label: string; accessor?: string }[];
    title?: string;
    className?: string;
    buttonText?: string;
}

/**
 * A button that launches the Tablizer in full-screen mode.
 * Place this near any tabular data in the app.
 */
export default function TablizeButton({
    data,
    columns,
    title = 'Tablizer',
    className = '',
    buttonText
}: TablizeButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    // Convert data to TableRow format (ensure each row has an id)
    const tableData: TableRow[] = data.map((item, idx) => ({
        id: item.id || item.pmid || `row_${idx}`,
        ...item
    }));

    // Convert columns to TableColumn format
    const tableColumns: TableColumn[] = columns.map(col => ({
        id: col.id,
        label: col.label,
        accessor: col.accessor || col.id,
        type: 'text' as const,
        visible: true
    }));

    if (isOpen) {
        return (
            <Tablizer
                initialData={tableData}
                initialColumns={tableColumns}
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
