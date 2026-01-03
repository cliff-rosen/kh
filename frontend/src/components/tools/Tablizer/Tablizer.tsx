import { useState, useMemo, useCallback, useEffect } from 'react';
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
import { researchStreamApi } from '../../../lib/api';
import { CanonicalResearchArticle } from '../../../types/canonical_types';
import { ReportArticle } from '../../../types/report';

// Union type for articles from different sources
type TablizableArticle = CanonicalResearchArticle | ReportArticle;

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
interface TableRow {
    id: string;
    [key: string]: unknown;
}

type BooleanFilterState = 'all' | 'yes' | 'no';

export interface TablizierProps {
    articles: TablizableArticle[];
    filterArticles?: TablizableArticle[];  // Optional larger set for AI column processing
    title?: string;
    onClose?: () => void;
    isFullScreen?: boolean;
    onSaveToHistory?: (filteredIds: string[], filterDescription: string) => void;  // Callback to save filtered results to history
    onFetchMoreForAI?: () => Promise<TablizableArticle[]>;  // Callback to fetch more articles before AI processing
}

// Helper to check if article is from report
function isReportArticle(article: TablizableArticle): article is ReportArticle {
    return 'article_id' in article;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
    columnId: string;
    direction: SortDirection;
}

// Standard columns derived from article structure
const BASE_COLUMNS: TableColumn[] = [
    { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: false },
    { id: 'authors', label: 'Authors', accessor: 'authors', type: 'text', visible: false },
    { id: 'journal', label: 'Journal', accessor: 'journal', type: 'text', visible: true },
    { id: 'publication_date', label: 'Date', accessor: 'publication_date', type: 'date', visible: true },
];

export default function Tablizer({
    articles,
    filterArticles,
    title = 'Tablizer',
    onClose,
    isFullScreen = false,
    onSaveToHistory,
    onFetchMoreForAI
}: TablizierProps) {
    // Use filterArticles for AI processing if provided, otherwise use display articles
    const articlesForAiProcessing = filterArticles || articles;
    // Convert articles to row format with string id
    const initialRows = useMemo((): TableRow[] =>
        articles.map((article, idx) => {
            const articleId = isReportArticle(article)
                ? article.article_id.toString()
                : (article.pmid || article.id?.toString() || `row_${idx}`);
            const row: TableRow = {
                id: articleId,
                pmid: article.pmid,
                title: article.title,
                abstract: article.abstract,
                authors: Array.isArray(article.authors) ? article.authors.join(', ') : article.authors,
                journal: article.journal,
                publication_date: article.publication_date,
                doi: article.doi,
            };
            return row;
        }),
        [articles]
    );

    // State
    const [data, setData] = useState<TableRow[]>(initialRows);
    const [columns, setColumns] = useState<TableColumn[]>(
        BASE_COLUMNS.map(c => ({ ...c }))
    );
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    const [filterText, setFilterText] = useState('');
    const [showAddColumnModal, setShowAddColumnModal] = useState(false);
    const [processingColumn, setProcessingColumn] = useState<string | null>(null);
    const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
    const [booleanFilters, setBooleanFilters] = useState<Record<string, BooleanFilterState>>({});

    // Reset state when articles change (new search)
    useEffect(() => {
        setData(initialRows);
        setColumns(BASE_COLUMNS.map(c => ({ ...c })));
        setSortConfig(null);
        setFilterText('');
        setBooleanFilters({});
    }, [initialRows]);

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

    // Sort data
    const sortedData = useMemo(() => {
        if (!sortConfig || !sortConfig.direction) return data;

        return [...data].sort((a, b) => {
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
    }, [data, sortConfig, columns]);

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
        setData(rows => rows.map(row => {
            const newRow = { ...row };
            delete newRow[columnId];
            return newRow;
        }));
    }, [columns]);

    // Add AI column
    const handleAddColumn = useCallback(async (
        columnName: string,
        promptTemplate: string,
        inputColumns: string[],
        outputType: 'text' | 'number' | 'boolean'
    ) => {
        const columnId = `ai_${Date.now()}`;

        // Add the column definition
        const newColumn: TableColumn = {
            id: columnId,
            label: columnName,
            accessor: columnId,
            type: 'ai',
            aiConfig: {
                promptTemplate,
                inputColumns,
                outputType
            },
            visible: true
        };

        setColumns(cols => [...cols, newColumn]);
        setShowAddColumnModal(false);

        // Fetch more articles if needed before AI processing
        let aiArticles = articlesForAiProcessing;
        if (onFetchMoreForAI) {
            aiArticles = await onFetchMoreForAI();
        }

        // Process using semantic filter service
        setProcessingColumn(columnId);
        setProcessingProgress({ current: 0, total: aiArticles.length });

        try {
            // Convert to CanonicalResearchArticle format for the filter API
            const canonicalArticles: CanonicalResearchArticle[] = aiArticles.map((article, idx) => ({
                id: isReportArticle(article) ? article.article_id.toString() : (article.id || `row_${idx}`),
                pmid: article.pmid || '',
                title: article.title,
                abstract: article.abstract || '',
                authors: article.authors || [],
                journal: article.journal || '',
                publication_date: article.publication_date || '',
                doi: article.doi || '',
                keywords: [],
                mesh_terms: [],
                categories: [],
                source: 'pubmed'
            }));

            // Call the filter service
            const response = await researchStreamApi.filterArticles({
                articles: canonicalArticles,
                filter_criteria: promptTemplate,
                threshold: 0.5
            });

            // Map results back to display rows only (first N articles correspond to display)
            const updatedRows = [...data];
            const totalForProgress = aiArticles.length;
            const displayCount = Math.min(response.results.length, data.length);
            for (let i = 0; i < displayCount; i++) {
                const result = response.results[i];
                let value: string | number | boolean;

                if (outputType === 'boolean') {
                    value = result.passed ? 'Yes' : 'No';
                } else if (outputType === 'number') {
                    value = result.score;
                } else {
                    value = result.reasoning;
                }

                updatedRows[i] = { ...updatedRows[i], [columnId]: value };
                setProcessingProgress({ current: i + 1, total: totalForProgress });
                setData([...updatedRows]);
            }
            // Update progress to show full completion
            setProcessingProgress({ current: response.results.length, total: totalForProgress });
        } catch (err) {
            console.error('Error processing AI column:', err);
            // Mark all as error
            const updatedRows = data.map(row => ({ ...row, [columnId]: 'Error' }));
            setData(updatedRows);
        } finally {
            setProcessingColumn(null);
            setProcessingProgress({ current: 0, total: 0 });
        }
    }, [articlesForAiProcessing, data, onFetchMoreForAI]);

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
    }, [filteredData, visibleColumns, title]);

    const containerClass = isFullScreen
        ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col'
        : 'border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 flex flex-col';

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
                        {filteredData.length}{filteredData.length !== data.length ? ` of ${data.length}` : ''} rows
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
                                            onClick={() => setBooleanFilters(prev => ({ ...prev, [col.id]: 'all' }))}
                                            className={`px-2 py-1 text-xs transition-colors ${
                                                currentFilter === 'all'
                                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            All
                                        </button>
                                        <button
                                            onClick={() => setBooleanFilters(prev => ({ ...prev, [col.id]: 'yes' }))}
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
                                            onClick={() => setBooleanFilters(prev => ({ ...prev, [col.id]: 'no' }))}
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
                    {onSaveToHistory && hasActiveFilters && filteredData.length > 0 && filteredData.length < data.length && (
                        <button
                            onClick={handleSaveToHistory}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                            title={`Save ${filteredData.length} filtered articles to history`}
                        >
                            <PlusCircleIcon className="h-4 w-4" />
                            Save to History ({filteredData.length})
                        </button>
                    )}

                    {/* Add AI Column */}
                    <button
                        onClick={() => setShowAddColumnModal(true)}
                        disabled={!!processingColumn}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <SparklesIcon className="h-4 w-4" />
                        Add AI Column
                    </button>

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
            <div className="flex-1 overflow-auto">
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
                                                className="p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
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
                                className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            >
                                {visibleColumns.map(column => {
                                    const cellValue = row[column.accessor];
                                    const isBoolean = column.aiConfig?.outputType === 'boolean';
                                    const isBooleanYes = isBoolean && (cellValue === true || cellValue === 'Yes' || cellValue === 'yes' || cellValue === 'YES');
                                    const isBooleanNo = isBoolean && (cellValue === false || cellValue === 'No' || cellValue === 'no' || cellValue === 'NO');

                                    return (
                                        <td
                                            key={column.id}
                                            className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 align-top"
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
        </div>
    );
}
