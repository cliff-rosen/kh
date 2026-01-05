import { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import {
    ArrowDownTrayIcon,
    ArrowsUpDownIcon,
    SparklesIcon,
    XMarkIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    ArrowPathIcon,
    TrashIcon,
    MagnifyingGlassIcon,
    CheckCircleIcon,
    XCircleIcon,
    AdjustmentsHorizontalIcon,
    PlusCircleIcon
} from '@heroicons/react/24/outline';
import AddColumnModal from './AddColumnModal';
import { trackEvent } from '../../../lib/api/trackingApi';

// Types
export interface TableColumn {
    id: string;
    label: string;
    accessor: string;
    type: 'text' | 'number' | 'date' | 'ai';
    aiConfig?: {
        promptTemplate: string;
        inputColumns: string[];
        outputType?: 'text' | 'number' | 'boolean';
    };
    visible?: boolean;
}

// Row type that allows dynamic AI column access
export interface TableRow {
    id: string;
    [key: string]: unknown;
}

type BooleanFilterState = 'all' | 'yes' | 'no';

export interface AIColumnInfo {
    name: string;
    type: string;
    filterActive?: boolean;
}

// Result from AI processing
export interface AIColumnResult {
    id: string;        // Row ID
    passed: boolean;   // For boolean output
    score: number;     // For number output
    reasoning: string; // For text output
}

// Props passed to RowViewer component
export interface RowViewerProps<T> {
    data: T[];           // Full dataset
    initialIndex: number; // Which item was clicked
    onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TablizerProps<T extends object = Record<string, any>> {
    // REQUIRED: Data to display in the table
    data: T[];

    // REQUIRED: Which field is the unique ID (e.g., 'pmid' or 'nct_id')
    idField: string;

    // REQUIRED: Column definitions
    columns: TableColumn[];

    // Optional: Larger set for AI processing
    filterData?: T[];

    // Optional: Title shown in toolbar (default: "Tablizer")
    title?: string;

    // Optional: Label for row count (default: "rows")
    rowLabel?: string;

    // Optional: Close button handler (for modal/fullscreen mode)
    onClose?: () => void;

    // Optional: Fullscreen layout mode (default: false)
    isFullScreen?: boolean;

    // Optional: Callback when user saves filtered results to history
    onSaveToHistory?: (filteredIds: string[], filterDescription: string) => void;

    // Optional: Lazy-load more data before AI processing
    onFetchMoreForAI?: () => Promise<T[]>;

    // REQUIRED for AI columns: Process AI column on data
    onProcessAIColumn?: (
        data: T[],
        promptTemplate: string,
        outputType: 'text' | 'number' | 'boolean'
    ) => Promise<AIColumnResult[]>;

    // Optional: Report AI column state changes to parent
    onColumnsChange?: (aiColumns: AIColumnInfo[]) => void;

    // Optional: Custom component to render when a row is clicked
    RowViewer?: React.ComponentType<RowViewerProps<T>>;

    // Optional: Custom cell renderer for special columns
    renderCell?: (row: TableRow, column: TableColumn) => React.ReactNode | null;
}

export interface TablizerRef {
    addAIColumn: (name: string, criteria: string, type: 'boolean' | 'text') => void;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
    columnId: string;
    direction: SortDirection;
}

// Helper to get ID from data item
function getItemId<T extends object>(item: T, idField: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = (item as any)[idField];
    if (id === null || id === undefined) return '';
    return String(id);
}

// Create a generic forwardRef component
function TablizerInner<T extends object>(
    props: TablizerProps<T>,
    ref: React.ForwardedRef<TablizerRef>
) {
    const {
        data: inputData,
        idField,
        columns: inputColumns,
        filterData,
        title = 'Tablizer',
        rowLabel = 'rows',
        onClose,
        isFullScreen = false,
        onSaveToHistory,
        onFetchMoreForAI,
        onProcessAIColumn,
        onColumnsChange,
        RowViewer,
        renderCell
    } = props;

    // Use filterData for AI processing if provided, otherwise use display data
    const dataForAiProcessing = filterData || inputData;

    // Convert input data to row format with string id
    const initialRows = useMemo((): TableRow[] =>
        inputData.map((item, idx) => {
            const itemId = getItemId(item, idField) || `row_${idx}`;
            const row: TableRow = { id: itemId };

            // Copy all accessible fields from the item
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const itemAny = item as any;
            for (const col of inputColumns) {
                if (col.type !== 'ai') {
                    row[col.accessor] = itemAny[col.accessor];
                }
            }

            return row;
        }),
        [inputData, idField, inputColumns]
    );

    // State
    const [rowData, setRowData] = useState<TableRow[]>(initialRows);
    const [columns, setColumns] = useState<TableColumn[]>(
        inputColumns.map(c => ({ ...c }))
    );
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    const [filterText, setFilterText] = useState('');
    const [showAddColumnModal, setShowAddColumnModal] = useState(false);
    const [processingColumn, setProcessingColumn] = useState<string | null>(null);
    const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
    const [booleanFilters, setBooleanFilters] = useState<Record<string, BooleanFilterState>>({});
    const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);

    // Track if this is a new dataset or just more data loaded
    const prevInitialRowsRef = useRef<TableRow[]>(initialRows);

    // Update when input columns change (reset AI columns but keep base visible state)
    useEffect(() => {
        setColumns(current => {
            const aiColumns = current.filter(c => c.type === 'ai');
            return [...inputColumns.map(c => ({ ...c })), ...aiColumns];
        });
    }, [inputColumns]);

    // Update data when inputData changes, but preserve AI column values
    useEffect(() => {
        const prevRows = prevInitialRowsRef.current;
        const isNewDataset = prevRows.length === 0 || initialRows.length === 0 ||
            // Check if first few IDs are different (indicating new search)
            (prevRows.slice(0, 3).map(r => r.id || '').join(',') !==
             initialRows.slice(0, 3).map(r => r.id || '').join(','));

        if (isNewDataset) {
            // New search - reset everything including data
            setRowData(initialRows);
            setColumns([...inputColumns.map(c => ({ ...c }))]);
            setSortConfig(null);
            setFilterText('');
            setBooleanFilters({});
        } else {
            // Same dataset (e.g., more items loaded for AI processing)
            // Merge new rows while preserving AI column values from existing data
            setRowData(currentData => {
                // Build a map of existing AI column values by row ID
                const existingAiValues = new Map<string, Record<string, unknown>>();
                const aiColumnIds = columns.filter(c => c.type === 'ai').map(c => c.id);

                for (const row of currentData) {
                    const aiValues: Record<string, unknown> = {};
                    for (const colId of aiColumnIds) {
                        if (row[colId] !== undefined) {
                            aiValues[colId] = row[colId];
                        }
                    }
                    if (Object.keys(aiValues).length > 0) {
                        existingAiValues.set(row.id, aiValues);
                    }
                }

                // Merge AI values into new rows
                return initialRows.map(row => {
                    const aiValues = existingAiValues.get(row.id);
                    return aiValues ? { ...row, ...aiValues } : row;
                });
            });
        }

        prevInitialRowsRef.current = initialRows;
    }, [initialRows, columns, inputColumns]);

    // Get visible columns
    const visibleColumns = useMemo(() =>
        columns.filter(c => c.visible !== false),
        [columns]
    );

    // Get boolean AI columns for quick filters
    const booleanColumns = useMemo(() =>
        columns.filter(c => c.type === 'ai' && c.aiConfig?.outputType === 'boolean'),
        [columns]
    );

    // Report AI column changes to parent
    useEffect(() => {
        if (!onColumnsChange) return;

        const aiColumns = columns
            .filter(c => c.type === 'ai')
            .map(c => ({
                name: c.label,
                type: c.aiConfig?.outputType || 'text',
                filterActive: c.aiConfig?.outputType === 'boolean' && booleanFilters[c.id] !== 'all' && booleanFilters[c.id] !== undefined
            }));

        onColumnsChange(aiColumns);
    }, [columns, booleanFilters, onColumnsChange]);

    // Sort data
    const sortedData = useMemo(() => {
        if (!sortConfig || !sortConfig.direction) return rowData;

        return [...rowData].sort((a, b) => {
            const aVal = a[sortConfig.columnId];
            const bVal = b[sortConfig.columnId];

            if (aVal === undefined || aVal === null) return 1;
            if (bVal === undefined || bVal === null) return -1;

            const column = columns.find(c => c.id === sortConfig.columnId);

            if (column?.type === 'number') {
                const aNum = parseFloat(String(aVal)) || 0;
                const bNum = parseFloat(String(bVal)) || 0;
                return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
            }

            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            const comparison = aStr.localeCompare(bStr);
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
    }, [rowData, sortConfig, columns]);

    // Filter data
    const filteredData = useMemo(() => {
        let result = sortedData;

        // Apply text filter
        if (filterText.trim()) {
            const searchLower = filterText.toLowerCase();
            result = result.filter(row =>
                Object.values(row).some(val =>
                    String(val).toLowerCase().includes(searchLower)
                )
            );
        }

        // Apply boolean filters
        for (const [columnId, filterState] of Object.entries(booleanFilters)) {
            if (filterState === 'all') continue;
            result = result.filter(row => {
                const val = row[columnId];
                const isYes = val === true || val === 'Yes' || val === 'yes' || val === 'YES';
                return filterState === 'yes' ? isYes : !isYes;
            });
        }

        return result;
    }, [sortedData, filterText, booleanFilters]);

    // Check if any filters are active (for Save to History button)
    const hasActiveFilters = useMemo(() => {
        if (filterText.trim()) return true;
        for (const filterState of Object.values(booleanFilters)) {
            if (filterState !== 'all') return true;
        }
        return false;
    }, [filterText, booleanFilters]);

    // Build filter description for history
    const getFilterDescription = useCallback(() => {
        const parts: string[] = [];
        if (filterText.trim()) {
            parts.push(`text: "${filterText}"`);
        }
        for (const [columnId, filterState] of Object.entries(booleanFilters)) {
            if (filterState === 'all') continue;
            const col = columns.find(c => c.id === columnId);
            if (col) {
                parts.push(`${col.label}=${filterState}`);
            }
        }
        return parts.length > 0 ? parts.join(', ') : 'Filtered';
    }, [filterText, booleanFilters, columns]);

    // Handle save to history
    const handleSaveToHistory = useCallback(() => {
        if (!onSaveToHistory) return;
        const filteredIds = filteredData.map(row => row.id);
        const description = getFilterDescription();
        onSaveToHistory(filteredIds, description);
        trackEvent('tablizer_save_to_history', {
            filtered_count: filteredIds.length
        });
    }, [onSaveToHistory, filteredData, getFilterDescription]);

    // Handle sort
    const handleSort = useCallback((columnId: string) => {
        setSortConfig(current => {
            if (current?.columnId !== columnId) {
                return { columnId, direction: 'asc' };
            }
            if (current.direction === 'asc') {
                return { columnId, direction: 'desc' };
            }
            return null;
        });
    }, []);

    // Toggle column visibility
    const toggleColumnVisibility = useCallback((columnId: string) => {
        setColumns(cols => cols.map(c =>
            c.id === columnId ? { ...c, visible: !c.visible } : c
        ));
    }, []);

    // Delete AI column
    const deleteColumn = useCallback((columnId: string) => {
        const column = columns.find(c => c.id === columnId);
        if (column?.type !== 'ai') return; // Only delete AI columns

        setColumns(cols => cols.filter(c => c.id !== columnId));
        setRowData(rows => rows.map(row => {
            const newRow = { ...row };
            delete newRow[columnId];
            return newRow;
        }));
        setBooleanFilters(prev => {
            const newFilters = { ...prev };
            delete newFilters[columnId];
            return newFilters;
        });
    }, [columns]);

    // Add AI column
    const handleAddColumn = useCallback(async (
        columnName: string,
        promptTemplate: string,
        inputCols: string[],
        outputType: 'text' | 'number' | 'boolean'
    ) => {
        if (!onProcessAIColumn) {
            console.error('Tablizer: onProcessAIColumn callback is required for AI columns');
            return;
        }

        const columnId = `ai_${Date.now()}`;

        // Add the column definition
        const newColumn: TableColumn = {
            id: columnId,
            label: columnName,
            accessor: columnId,
            type: 'ai',
            aiConfig: {
                promptTemplate,
                inputColumns: inputCols,
                outputType
            },
            visible: true
        };

        setColumns(cols => [...cols, newColumn]);
        setShowAddColumnModal(false);

        // Fetch more data if needed before AI processing
        let aiData = dataForAiProcessing;
        if (onFetchMoreForAI) {
            aiData = await onFetchMoreForAI();
        }

        // Process using callback
        setProcessingColumn(columnId);
        setProcessingProgress({ current: 0, total: aiData.length });

        try {
            // Call the parent's AI processing callback
            const results = await onProcessAIColumn(aiData, promptTemplate, outputType);

            // Build a map of results by ID
            const resultMap = new Map(results.map(r => [r.id, r]));

            // Map results back to display rows
            const updatedRows = [...rowData];
            const totalForProgress = aiData.length;

            for (let i = 0; i < updatedRows.length; i++) {
                const result = resultMap.get(updatedRows[i].id);
                if (result) {
                    let value: string | number | boolean;

                    if (outputType === 'boolean') {
                        value = result.passed ? 'Yes' : 'No';
                    } else if (outputType === 'number') {
                        value = result.score;
                    } else {
                        value = result.reasoning;
                    }

                    updatedRows[i] = { ...updatedRows[i], [columnId]: value };
                }
                setProcessingProgress({ current: i + 1, total: totalForProgress });
                setRowData([...updatedRows]);
            }

            // Track successful completion
            trackEvent('tablizer_add_column_complete', {
                column_name: columnName,
                output_type: outputType,
                item_count: results.length
            });
        } catch (err) {
            console.error('Error processing AI column:', err);
            // Mark all as error
            const updatedRows = rowData.map(row => ({ ...row, [columnId]: 'Error' }));
            setRowData(updatedRows);
        } finally {
            setProcessingColumn(null);
            setProcessingProgress({ current: 0, total: 0 });
        }
    }, [dataForAiProcessing, rowData, onFetchMoreForAI, onProcessAIColumn]);

    // Export to CSV
    const handleExport = useCallback(() => {
        const headers = visibleColumns.map(c => c.label);
        const rows = filteredData.map(row =>
            visibleColumns.map(c => {
                const val = row[c.accessor];
                // Escape quotes and wrap in quotes if contains comma
                const strVal = String(val ?? '');
                if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                    return `"${strVal.replace(/"/g, '""')}"`;
                }
                return strVal;
            })
        );

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
        trackEvent('tablizer_export', {
            row_count: filteredData.length,
            column_count: visibleColumns.length
        });
    }, [filteredData, visibleColumns, title]);

    // Expose addAIColumn method via ref for parent component
    useImperativeHandle(ref, () => ({
        addAIColumn: (name: string, criteria: string, type: 'boolean' | 'text') => {
            handleAddColumn(name, criteria, ['title', 'abstract'], type);
        }
    }), [handleAddColumn]);

    const containerClass = isFullScreen
        ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col'
        : 'border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 flex flex-col h-full';

    return (
        <div className={containerClass}>
            {/* Toolbar */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between gap-4 flex-shrink-0">
                {/* Left: Search, Row Count, and Quick Filters */}
                <div className="flex items-center gap-3 flex-1">
                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder="Search all columns..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                    </div>

                    {/* Row count */}
                    <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {filteredData.length}{filteredData.length !== rowData.length ? ` of ${rowData.length}` : ''} {rowLabel}
                    </span>

                    {/* Processing indicator */}
                    {processingColumn && (
                        <span className="text-sm text-purple-600 dark:text-purple-400 flex items-center gap-2 whitespace-nowrap">
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            Processing {processingProgress.current}/{processingProgress.total}...
                        </span>
                    )}

                    {/* Quick Boolean Filters */}
                    {booleanColumns.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Quick filters:</span>
                            {booleanColumns.map(col => {
                                const currentFilter = booleanFilters[col.id] || 'all';
                                return (
                                    <div key={col.id} className="flex items-center rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
                                        <span className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-r border-gray-300 dark:border-gray-600">
                                            {col.label}
                                        </span>
                                        <button
                                            onClick={() => {
                                                setBooleanFilters(prev => ({ ...prev, [col.id]: 'all' }));
                                                trackEvent('tablizer_filter_boolean', { column: col.label, value: 'all' });
                                            }}
                                            className={`px-2 py-1 text-xs transition-colors ${
                                                currentFilter === 'all'
                                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            All
                                        </button>
                                        <button
                                            onClick={() => {
                                                setBooleanFilters(prev => ({ ...prev, [col.id]: 'yes' }));
                                                trackEvent('tablizer_filter_boolean', { column: col.label, value: 'yes' });
                                            }}
                                            className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${
                                                currentFilter === 'yes'
                                                    ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            <CheckCircleIcon className="h-3 w-3" />
                                            Yes
                                        </button>
                                        <button
                                            onClick={() => {
                                                setBooleanFilters(prev => ({ ...prev, [col.id]: 'no' }));
                                                trackEvent('tablizer_filter_boolean', { column: col.label, value: 'no' });
                                            }}
                                            className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${
                                                currentFilter === 'no'
                                                    ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            <XCircleIcon className="h-3 w-3" />
                                            No
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    {/* Save to History - shown when filters are active */}
                    {onSaveToHistory && hasActiveFilters && filteredData.length > 0 && filteredData.length < rowData.length && (
                        <button
                            onClick={handleSaveToHistory}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                            title={`Save ${filteredData.length} filtered items to history`}
                        >
                            <PlusCircleIcon className="h-4 w-4" />
                            Save to History ({filteredData.length})
                        </button>
                    )}

                    {/* Add AI Column - only show if callback is provided */}
                    {onProcessAIColumn && (
                        <button
                            onClick={() => {
                                setShowAddColumnModal(true);
                                trackEvent('tablizer_add_column_start', {});
                            }}
                            disabled={!!processingColumn}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <SparklesIcon className="h-4 w-4" />
                            Add AI Column
                        </button>
                    )}

                    {/* Separator */}
                    <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

                    {/* Column visibility dropdown */}
                    <div className="relative group">
                        <button className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md">
                            <AdjustmentsHorizontalIcon className="h-4 w-4" />
                            Columns
                        </button>
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10 hidden group-hover:block">
                            <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
                                {columns.map(col => (
                                    <label key={col.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={col.visible !== false}
                                            onChange={() => toggleColumnVisibility(col.id)}
                                            className="rounded border-gray-300 dark:border-gray-600"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                            {col.type === 'ai' && <SparklesIcon className="h-3 w-3 text-purple-500" />}
                                            {col.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Export */}
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                        title="Export to CSV"
                    >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        Export
                    </button>

                    {/* Close button (for full-screen mode) */}
                    {onClose && (
                        <>
                            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
                            <button
                                onClick={onClose}
                                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                            {visibleColumns.map(column => (
                                <th
                                    key={column.id}
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700"
                                >
                                    <div className="flex items-center gap-2">
                                        {column.type === 'ai' && (
                                            <SparklesIcon className="h-4 w-4 text-purple-500" />
                                        )}
                                        <button
                                            onClick={() => handleSort(column.id)}
                                            className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                                        >
                                            {column.label}
                                            {sortConfig?.columnId === column.id ? (
                                                sortConfig.direction === 'asc' ? (
                                                    <ChevronUpIcon className="h-4 w-4" />
                                                ) : (
                                                    <ChevronDownIcon className="h-4 w-4" />
                                                )
                                            ) : (
                                                <ArrowsUpDownIcon className="h-4 w-4 opacity-30" />
                                            )}
                                        </button>
                                        {column.type === 'ai' && (
                                            <button
                                                onClick={() => deleteColumn(column.id)}
                                                className="p-0.5 text-gray-400 hover:text-red-500"
                                                title="Delete column"
                                            >
                                                <TrashIcon className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredData.map((row, rowIdx) => (
                            <tr
                                key={row.id || rowIdx}
                                className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${RowViewer ? 'cursor-pointer' : ''}`}
                                onClick={() => {
                                    if (!RowViewer) return;
                                    // Find the index in the original data array
                                    const itemIndex = inputData.findIndex(item => getItemId(item, idField) === row.id);
                                    if (itemIndex !== -1) {
                                        setSelectedItemIndex(itemIndex);
                                        trackEvent('tablizer_row_click', { id: row.id });
                                    }
                                }}
                            >
                                {visibleColumns.map(column => {
                                    // Check for custom cell renderer first
                                    if (renderCell) {
                                        const customCell = renderCell(row, column);
                                        if (customCell !== null) {
                                            return (
                                                <td key={column.id} className="px-4 py-3 text-sm">
                                                    {customCell}
                                                </td>
                                            );
                                        }
                                    }

                                    const cellValue = row[column.accessor];
                                    const isBoolean = column.aiConfig?.outputType === 'boolean';
                                    const isBooleanYes = isBoolean && (cellValue === true || cellValue === 'Yes' || cellValue === 'yes' || cellValue === 'YES');
                                    const isBooleanNo = isBoolean && (cellValue === false || cellValue === 'No' || cellValue === 'no' || cellValue === 'NO');

                                    return (
                                        <td
                                            key={column.id}
                                            className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 align-top max-w-xs truncate"
                                        >
                                            {processingColumn === column.id && cellValue === undefined ? (
                                                <span className="text-gray-400 italic">Processing...</span>
                                            ) : isBoolean ? (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    isBooleanYes
                                                        ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                                        : isBooleanNo
                                                            ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                                }`}>
                                                    {isBooleanYes && <CheckCircleIcon className="h-3 w-3" />}
                                                    {isBooleanNo && <XCircleIcon className="h-3 w-3" />}
                                                    {String(cellValue ?? '-')}
                                                </span>
                                            ) : (
                                                <span className={column.type === 'ai' ? 'text-purple-700 dark:text-purple-300' : ''}>
                                                    {String(cellValue ?? '-')}
                                                </span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredData.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                        <p>No data to display</p>
                    </div>
                )}
            </div>

            {/* Add Column Modal */}
            {showAddColumnModal && (
                <AddColumnModal
                    availableColumns={columns.filter(c => c.type !== 'ai').map(c => ({
                        id: c.accessor,
                        label: c.label
                    }))}
                    onAdd={handleAddColumn}
                    onClose={() => setShowAddColumnModal(false)}
                />
            )}

            {/* Row Viewer Modal - only render if RowViewer is provided */}
            {RowViewer && selectedItemIndex !== null && (
                <RowViewer
                    data={inputData}
                    initialIndex={selectedItemIndex}
                    onClose={() => setSelectedItemIndex(null)}
                />
            )}
        </div>
    );
}

// Wrap with forwardRef - TypeScript workaround for generic forwardRef
const Tablizer = forwardRef(TablizerInner) as <T extends object>(
    props: TablizerProps<T> & { ref?: React.ForwardedRef<TablizerRef> }
) => ReturnType<typeof TablizerInner>;

export default Tablizer;
