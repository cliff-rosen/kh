import { useState, useMemo, useCallback, useEffect } from 'react';
import {
    ArrowDownTrayIcon,
    ArrowsUpDownIcon,
    SparklesIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    ArrowPathIcon,
    TrashIcon,
    MagnifyingGlassIcon,
    CheckCircleIcon,
    XCircleIcon,
    AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import AddColumnModal from '../Tablizer/AddColumnModal';
import TrialViewerModal from './TrialViewerModal';
import { toolsApi } from '../../../lib/api/toolsApi';
import { CanonicalClinicalTrial } from '../../../types/canonical_types';
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

interface TableRow {
    id: string;
    [key: string]: unknown;
}

type BooleanFilterState = 'all' | 'yes' | 'no';

export interface TrialScoutTableProps {
    trials: CanonicalClinicalTrial[];
}

type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
    columnId: string;
    direction: SortDirection;
}

// Standard columns for trials - all fields from CanonicalClinicalTrial
// Most are hidden by default, users can enable them via Columns dropdown
const BASE_COLUMNS: TableColumn[] = [
    // Core identification - visible by default
    { id: 'nct_id', label: 'NCT ID', accessor: 'nct_id', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'status', label: 'Status', accessor: 'status', type: 'text', visible: true },
    { id: 'phase', label: 'Phase', accessor: 'phase', type: 'text', visible: true },
    { id: 'sponsor', label: 'Lead Sponsor', accessor: 'sponsor', type: 'text', visible: true },
    { id: 'enrollment', label: 'Enrollment', accessor: 'enrollment', type: 'number', visible: true },
    { id: 'start_date', label: 'Start Date', accessor: 'start_date', type: 'date', visible: true },

    // Study info - hidden by default
    { id: 'org_study_id', label: 'Org Study ID', accessor: 'org_study_id', type: 'text', visible: false },
    { id: 'study_type', label: 'Study Type', accessor: 'study_type', type: 'text', visible: false },
    { id: 'completion_date', label: 'Completion Date', accessor: 'completion_date', type: 'date', visible: false },
    { id: 'last_update_date', label: 'Last Updated', accessor: 'last_update_date', type: 'date', visible: false },
    { id: 'enrollment_type', label: 'Enrollment Type', accessor: 'enrollment_type', type: 'text', visible: false },

    // Study design
    { id: 'allocation', label: 'Allocation', accessor: 'allocation', type: 'text', visible: false },
    { id: 'intervention_model', label: 'Intervention Model', accessor: 'intervention_model', type: 'text', visible: false },
    { id: 'masking', label: 'Masking', accessor: 'masking', type: 'text', visible: false },
    { id: 'primary_purpose', label: 'Primary Purpose', accessor: 'primary_purpose', type: 'text', visible: false },

    // Conditions & interventions
    { id: 'conditions', label: 'Conditions', accessor: 'conditions', type: 'text', visible: false },
    { id: 'interventions', label: 'Interventions', accessor: 'interventions', type: 'text', visible: false },
    { id: 'primary_outcomes', label: 'Primary Outcomes', accessor: 'primary_outcomes', type: 'text', visible: false },
    { id: 'secondary_outcomes', label: 'Secondary Outcomes', accessor: 'secondary_outcomes', type: 'text', visible: false },

    // Eligibility
    { id: 'sex', label: 'Sex', accessor: 'sex', type: 'text', visible: false },
    { id: 'min_age', label: 'Min Age', accessor: 'min_age', type: 'text', visible: false },
    { id: 'max_age', label: 'Max Age', accessor: 'max_age', type: 'text', visible: false },
    { id: 'healthy_volunteers', label: 'Healthy Volunteers', accessor: 'healthy_volunteers', type: 'text', visible: false },

    // Sponsors
    { id: 'sponsor_type', label: 'Sponsor Type', accessor: 'sponsor_type', type: 'text', visible: false },
    { id: 'collaborators', label: 'Collaborators', accessor: 'collaborators', type: 'text', visible: false },

    // Locations
    { id: 'location_countries', label: 'Countries', accessor: 'location_countries', type: 'text', visible: false },
    { id: 'location_count', label: 'Site Count', accessor: 'location_count', type: 'number', visible: false },

    // Text content
    { id: 'brief_summary', label: 'Summary', accessor: 'brief_summary', type: 'text', visible: false },
    { id: 'keywords', label: 'Keywords', accessor: 'keywords', type: 'text', visible: false },
];

export default function TrialScoutTable({
    trials
}: TrialScoutTableProps) {
    // Convert trials to row format with all available fields
    const initialRows = useMemo((): TableRow[] =>
        trials.map((trial) => ({
            id: trial.nct_id,
            // Core identification
            nct_id: trial.nct_id,
            org_study_id: trial.org_study_id || '',
            title: trial.brief_title || trial.title,

            // Status & dates
            status: trial.status,
            start_date: trial.start_date || '',
            completion_date: trial.completion_date || '',
            last_update_date: trial.last_update_date || '',

            // Study design
            study_type: trial.study_type || '',
            phase: trial.phase || 'N/A',
            allocation: trial.allocation || '',
            intervention_model: trial.intervention_model || '',
            masking: trial.masking || '',
            primary_purpose: trial.primary_purpose || '',

            // Enrollment
            enrollment: trial.enrollment_count || 0,
            enrollment_type: trial.enrollment_type || '',

            // Conditions & interventions
            conditions: trial.conditions.join(', '),
            interventions: trial.interventions.map(i => `${i.name} (${i.type})`).join('; '),
            primary_outcomes: trial.primary_outcomes.map(o => o.measure).join('; '),
            secondary_outcomes: trial.secondary_outcomes?.map(o => o.measure).join('; ') || '',

            // Eligibility
            sex: trial.sex || '',
            min_age: trial.min_age || '',
            max_age: trial.max_age || '',
            healthy_volunteers: trial.healthy_volunteers ? 'Yes' : trial.healthy_volunteers === false ? 'No' : '',

            // Sponsors
            sponsor: trial.lead_sponsor?.name || 'Unknown',
            sponsor_type: trial.lead_sponsor?.type || '',
            collaborators: trial.collaborators?.map(c => c.name).join(', ') || '',

            // Locations
            location_countries: trial.location_countries.join(', '),
            location_count: trial.locations.length,

            // Text content
            brief_summary: trial.brief_summary || '',
            keywords: trial.keywords.join(', '),

            // Link
            url: trial.url
        })),
        [trials]
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

    // Modal state
    const [selectedTrialIndex, setSelectedTrialIndex] = useState<number | null>(null);

    // Reset state when trials change
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
        if (column?.type !== 'ai') return;

        setColumns(cols => cols.filter(c => c.id !== columnId));
        setData(rows => rows.map(row => {
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

        // Process using trial filter API
        setProcessingColumn(columnId);
        setProcessingProgress({ current: 0, total: trials.length });

        try {
            // Call the trial filter API
            const response = await toolsApi.filterTrials({
                trials: trials,
                filter_criteria: promptTemplate,
                threshold: 0.5
            });

            // Map results back to rows
            const resultMap = new Map(response.results.map(r => [r.nct_id, r]));
            const updatedRows = [...data];

            for (let i = 0; i < updatedRows.length; i++) {
                const result = resultMap.get(updatedRows[i].id as string);
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
                setProcessingProgress({ current: i + 1, total: trials.length });
                setData([...updatedRows]);
            }

            trackEvent('trialscout_add_column_complete', {
                column_name: columnName,
                output_type: outputType,
                trial_count: trials.length
            });
        } catch (err) {
            console.error('Error processing AI column:', err);
            const updatedRows = data.map(row => ({ ...row, [columnId]: 'Error' }));
            setData(updatedRows);
        } finally {
            setProcessingColumn(null);
            setProcessingProgress({ current: 0, total: 0 });
        }
    }, [trials, data]);

    // Export to CSV
    const handleExport = useCallback(() => {
        const headers = visibleColumns.map(c => c.label);
        const rows = filteredData.map(row =>
            visibleColumns.map(c => {
                const val = row[c.accessor];
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
        a.download = `clinical_trials_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        trackEvent('trialscout_export', {
            row_count: filteredData.length,
            column_count: visibleColumns.length
        });
    }, [filteredData, visibleColumns]);

    // Format status for display
    const formatStatus = (status: string) => {
        return status.split('_').map(word =>
            word.charAt(0) + word.slice(1).toLowerCase()
        ).join(' ');
    };

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 flex flex-col">
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
                        {filteredData.length}{filteredData.length !== data.length ? ` of ${data.length}` : ''} trials
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
                    {/* Add AI Column */}
                    <button
                        onClick={() => {
                            setShowAddColumnModal(true);
                            trackEvent('trialscout_add_column_start', {});
                        }}
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
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto max-h-[600px]">
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
                                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                                onClick={() => {
                                    const trialIndex = trials.findIndex(t => t.nct_id === row.id);
                                    if (trialIndex >= 0) {
                                        setSelectedTrialIndex(trialIndex);
                                        trackEvent('trialscout_view_trial', { nct_id: row.id });
                                    }
                                }}
                            >
                                {visibleColumns.map(column => {
                                    const cellValue = row[column.accessor];
                                    const isBoolean = column.aiConfig?.outputType === 'boolean';
                                    const isBooleanYes = isBoolean && (cellValue === true || cellValue === 'Yes' || cellValue === 'yes');
                                    const isBooleanNo = isBoolean && (cellValue === false || cellValue === 'No' || cellValue === 'no');

                                    // Special rendering for status column
                                    if (column.id === 'status') {
                                        const status = String(cellValue);
                                        return (
                                            <td key={column.id} className="px-4 py-3 text-sm">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    status === 'RECRUITING' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                    status === 'COMPLETED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                                    status === 'ACTIVE_NOT_RECRUITING' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {formatStatus(status)}
                                                </span>
                                            </td>
                                        );
                                    }

                                    // Special rendering for phase column
                                    if (column.id === 'phase') {
                                        const phase = String(cellValue);
                                        return (
                                            <td key={column.id} className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                                {phase.replace('PHASE', 'Phase ').replace('NA', 'N/A')}
                                            </td>
                                        );
                                    }

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
                        <p>No trials to display</p>
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

            {/* Trial Viewer Modal */}
            {selectedTrialIndex !== null && (
                <TrialViewerModal
                    trials={trials}
                    initialIndex={selectedTrialIndex}
                    onClose={() => setSelectedTrialIndex(null)}
                />
            )}
        </div>
    );
}
