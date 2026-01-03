import { useState, useCallback } from 'react';
import {
    PlayIcon,
    TableCellsIcon,
    ClockIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
    ArrowsRightLeftIcon,
    TrashIcon,
    ClipboardDocumentIcon,
    PlusCircleIcon,
    FunnelIcon,
    MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { Tablizer } from './Tablizer';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import { toolsApi } from '../../lib/api/toolsApi';

const FILTER_LIMIT = 500;  // Max articles to fetch for filtering
const DISPLAY_LIMIT = 100; // Max articles to display in table

// ============================================================================
// Search Snapshot Types
// ============================================================================

type SnapshotSource =
    | { type: 'search'; query: string; startDate?: string; endDate?: string; dateType: 'publication' | 'entry' }
    | { type: 'filter'; description: string; parentId: string }
    | { type: 'compare'; description: string; parentIds: string[] };

interface SearchSnapshot {
    id: string;
    timestamp: Date;
    label?: string;
    // Source/provenance tracking
    source: SnapshotSource;
    // Results
    articles: CanonicalResearchArticle[];  // All fetched (up to 500)
    allPmids: string[];  // PMIDs for comparison
    totalMatched: number;  // Total from PubMed (or count for filtered)
}

// ============================================================================
// Main Component
// ============================================================================

export default function TablizePubMed() {
    // Search form state
    const [query, setQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [dateType, setDateType] = useState<'publication' | 'entry'>('publication');

    // Results state (current/live search)
    const [allArticles, setAllArticles] = useState<CanonicalResearchArticle[]>([]);
    const [totalMatched, setTotalMatched] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    // History state
    const [snapshots, setSnapshots] = useState<SearchSnapshot[]>([]);
    const [historyPanelOpen, setHistoryPanelOpen] = useState(true);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
    const [compareMode, setCompareMode] = useState(false);
    const [compareSnapshots, setCompareSnapshots] = useState<[string, string] | null>(null);

    // Add search snapshot to history
    const addSearchSnapshot = useCallback((articles: CanonicalResearchArticle[], total: number) => {
        const newSnapshot: SearchSnapshot = {
            id: `snapshot_${Date.now()}`,
            timestamp: new Date(),
            source: {
                type: 'search',
                query: query,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                dateType: dateType
            },
            articles: articles,
            allPmids: articles.map(a => a.pmid || a.id || '').filter(Boolean),
            totalMatched: total
        };
        setSnapshots(prev => [newSnapshot, ...prev]);
        return newSnapshot.id;
    }, [query, startDate, endDate, dateType]);

    // Add filtered/derived snapshot to history
    const addDerivedSnapshot = useCallback((
        articles: CanonicalResearchArticle[],
        source: SnapshotSource,
        label?: string
    ) => {
        const newSnapshot: SearchSnapshot = {
            id: `snapshot_${Date.now()}`,
            timestamp: new Date(),
            label,
            source,
            articles: articles,
            allPmids: articles.map(a => a.pmid || a.id || '').filter(Boolean),
            totalMatched: articles.length
        };
        setSnapshots(prev => [newSnapshot, ...prev]);
        return newSnapshot.id;
    }, []);

    // Delete snapshot
    const deleteSnapshot = useCallback((id: string) => {
        setSnapshots(prev => prev.filter(s => s.id !== id));
        if (selectedSnapshotId === id) {
            setSelectedSnapshotId(null);
        }
        if (compareSnapshots?.includes(id)) {
            setCompareMode(false);
            setCompareSnapshots(null);
        }
    }, [selectedSnapshotId, compareSnapshots]);

    // Update snapshot label
    const updateSnapshotLabel = useCallback((id: string, label: string) => {
        setSnapshots(prev => prev.map(s =>
            s.id === id ? { ...s, label } : s
        ));
    }, []);

    // Get snapshot by ID (defined early so it can be used in callbacks)
    const getSnapshot = useCallback((id: string) => snapshots.find(s => s.id === id), [snapshots]);

    // Handle save filtered results from Tablizer
    const handleSaveFilteredToHistory = useCallback((filteredIds: string[], filterDescription: string) => {
        // Get articles from current display data
        const articleMap = new Map(
            (selectedSnapshotId ? getSnapshot(selectedSnapshotId)?.articles : allArticles)
                ?.map(a => [a.pmid || a.id || '', a]) || []
        );

        const filteredArticles = filteredIds
            .map(id => articleMap.get(id))
            .filter((a): a is CanonicalResearchArticle => !!a);

        if (filteredArticles.length === 0) return;

        // Determine parent - either the selected snapshot or the most recent search
        const parentId = selectedSnapshotId || snapshots[0]?.id || 'unknown';

        addDerivedSnapshot(
            filteredArticles,
            {
                type: 'filter',
                description: filterDescription,
                parentId
            },
            filterDescription
        );
    }, [selectedSnapshotId, allArticles, snapshots, addDerivedSnapshot, getSnapshot]);

    // Handle search
    const handleSearch = async () => {
        if (!query.trim()) {
            setError('Please enter a search query');
            return;
        }

        setLoading(true);
        setError(null);
        // Clear selection when doing new search
        setSelectedSnapshotId(null);
        setCompareMode(false);
        setCompareSnapshots(null);

        try {
            const response = await toolsApi.searchPubMed({
                query: query,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                dateType: dateType,
                maxResults: FILTER_LIMIT
            });
            setAllArticles(response.articles);
            setTotalMatched(response.total_results);
            setHasSearched(true);
            // Auto-save to history
            addSearchSnapshot(response.articles, response.total_results);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    // Handle clear all
    const handleClearAll = () => {
        // Clear search form
        setQuery('');
        setStartDate('');
        setEndDate('');
        setDateType('publication');
        // Clear results
        setAllArticles([]);
        setTotalMatched(0);
        setHasSearched(false);
        setError(null);
        // Clear history
        setSnapshots([]);
        setSelectedSnapshotId(null);
        setCompareMode(false);
        setCompareSnapshots(null);
    };

    // Handle snapshot selection
    const handleSelectSnapshot = (id: string) => {
        if (compareMode) {
            handleSelectForCompare(id);
        } else {
            setSelectedSnapshotId(id === selectedSnapshotId ? null : id);
        }
    };

    // Handle compare mode selection - toggle A then B
    const handleSelectForCompare = (id: string) => {
        if (!compareSnapshots) {
            // Nothing selected yet - set as A
            setCompareSnapshots([id, '']);
        } else if (compareSnapshots[0] === id) {
            // Clicking A again - deselect A
            if (compareSnapshots[1]) {
                // If B is set, move B to A
                setCompareSnapshots([compareSnapshots[1], '']);
            } else {
                // Nothing selected
                setCompareSnapshots(null);
            }
        } else if (compareSnapshots[1] === id) {
            // Clicking B again - deselect B
            setCompareSnapshots([compareSnapshots[0], '']);
        } else if (!compareSnapshots[1]) {
            // A is set but not B - set as B
            setCompareSnapshots([compareSnapshots[0], id]);
        } else {
            // Both A and B are set - replace B
            setCompareSnapshots([compareSnapshots[0], id]);
        }
    };

    // Toggle compare mode
    const toggleCompareMode = () => {
        if (compareMode) {
            setCompareMode(false);
            setCompareSnapshots(null);
        } else {
            setCompareMode(true);
            // Start with nothing selected - user picks
            setCompareSnapshots(null);
        }
    };

    // Determine what to display
    const selectedSnapshot = selectedSnapshotId ? getSnapshot(selectedSnapshotId) : null;
    const displayData = selectedSnapshot ? {
        articles: selectedSnapshot.articles,
        totalMatched: selectedSnapshot.totalMatched
    } : {
        articles: allArticles,
        totalMatched: totalMatched
    };

    const displayArticles = displayData.articles.slice(0, DISPLAY_LIMIT);

    // Get version number for a snapshot ID
    const getVersionNumber = useCallback((id: string) => {
        const idx = snapshots.findIndex(s => s.id === id);
        return idx >= 0 ? snapshots.length - idx : null;
    }, [snapshots]);

    // Get full source description for a snapshot (including provenance)
    const getSnapshotSourceDescription = useCallback((snapshot: SearchSnapshot): string => {
        switch (snapshot.source.type) {
            case 'search': {
                const q = snapshot.source.query;
                const queryPart = q.length > 50 ? q.substring(0, 50) + '...' : q;
                let desc = `Search: "${queryPart}"`;
                if (snapshot.source.startDate || snapshot.source.endDate) {
                    desc += ` (${snapshot.source.startDate || '...'} to ${snapshot.source.endDate || '...'})`;
                }
                return desc;
            }
            case 'filter': {
                const parentVersion = getVersionNumber(snapshot.source.parentId);
                const parentRef = parentVersion ? `#${parentVersion}` : 'unknown';
                return `Filtered from ${parentRef}: ${snapshot.source.description}`;
            }
            case 'compare': {
                const parentVersions = snapshot.source.parentIds
                    .map(id => getVersionNumber(id))
                    .filter((v): v is number => v !== null);
                const parentRef = parentVersions.length >= 2
                    ? `#${parentVersions[0]} vs #${parentVersions[1]}`
                    : 'comparison';
                return `Compare result (${parentRef}): ${snapshot.source.description}`;
            }
        }
    }, [getVersionNumber]);

    // Build summary info
    const getSummaryInfo = () => {
        if (displayData.articles.length === 0) return null;

        const isDisplayLimited = displayArticles.length < displayData.articles.length;
        const hasMoreMatches = displayData.totalMatched > displayData.articles.length;

        return {
            totalMatched: displayData.totalMatched,
            fetched: displayData.articles.length,
            displayed: displayArticles.length,
            isDisplayLimited,
            hasMoreMatches
        };
    };

    const summaryInfo = getSummaryInfo();

    return (
        <div className="flex gap-4">
            {/* Main Content */}
            <div className="flex-1 space-y-6 min-w-0">
                {/* Search Form */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                        Search PubMed
                    </h3>
                    <div className="space-y-4">
                        {/* Query - full width, auto-expanding */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Query
                            </label>
                            <textarea
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSearch();
                                    }
                                }}
                                placeholder="e.g., diabetes treatment"
                                rows={1}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 resize-none overflow-hidden"
                            />
                        </div>

                        {/* Date filters row */}
                        <div className="flex flex-wrap items-end gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Date Type
                                </label>
                                <select
                                    value={dateType}
                                    onChange={(e) => setDateType(e.target.value as 'publication' | 'entry')}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="publication">Publication</option>
                                    <option value="entry">Entry</option>
                                </select>
                            </div>
                            <button
                                onClick={handleSearch}
                                disabled={loading || !query.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Searching...
                                    </>
                                ) : (
                                    <>
                                        <PlayIcon className="h-4 w-4" />
                                        Search
                                    </>
                                )}
                            </button>
                            {(hasSearched || snapshots.length > 0 || query.trim()) && (
                                <button
                                    onClick={handleClearAll}
                                    disabled={loading}
                                    className="px-4 py-2 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    title="Clear search, results, and history"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Compare View */}
                {compareMode && compareSnapshots && compareSnapshots[0] && compareSnapshots[1] && (
                    <SearchCompareView
                        snapshotA={getSnapshot(compareSnapshots[0])}
                        snapshotB={getSnapshot(compareSnapshots[1])}
                        onClose={() => {
                            setCompareMode(false);
                            setCompareSnapshots(null);
                        }}
                        onSaveToHistory={(articles, description) => {
                            addDerivedSnapshot(articles, {
                                type: 'compare',
                                description,
                                parentIds: [compareSnapshots[0], compareSnapshots[1]]
                            }, description);
                        }}
                    />
                )}

                {/* Compare mode instructions */}
                {compareMode && (!compareSnapshots || !compareSnapshots[0] || !compareSnapshots[1]) && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-6 text-center">
                        <ArrowsRightLeftIcon className="h-8 w-8 mx-auto mb-3 text-blue-500" />
                        <p className="text-blue-800 dark:text-blue-200 font-medium">Select two snapshots to compare</p>
                        <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                            {!compareSnapshots || !compareSnapshots[0]
                                ? 'Click a snapshot in the history panel to select it as A'
                                : 'Now click another snapshot to select it as B'}
                        </p>
                    </div>
                )}

                {/* Results Summary & Table (when not in compare mode) */}
                {!compareMode && (
                    <>
                        {/* Viewing snapshot indicator */}
                        {selectedSnapshot && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
                                        Viewing: {selectedSnapshot.label || `Snapshot #${getVersionNumber(selectedSnapshot.id)}`}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {selectedSnapshot.source.type === 'search' && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await navigator.clipboard.writeText(selectedSnapshot.source.query);
                                                    } catch {
                                                        // Fallback
                                                        const textArea = document.createElement('textarea');
                                                        textArea.value = selectedSnapshot.source.query;
                                                        textArea.style.position = 'fixed';
                                                        textArea.style.left = '-999999px';
                                                        document.body.appendChild(textArea);
                                                        textArea.select();
                                                        document.execCommand('copy');
                                                        document.body.removeChild(textArea);
                                                    }
                                                }}
                                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                            >
                                                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                                Copy query
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setSelectedSnapshotId(null)}
                                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            Return to live results
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs text-blue-700 dark:text-blue-300">
                                    {getSnapshotSourceDescription(selectedSnapshot)}
                                </div>
                            </div>
                        )}

                        {/* Results Summary & Table - dimmed when loading */}
                        <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
                            {/* Results Summary */}
                            {(hasSearched || selectedSnapshot) && summaryInfo && (
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                                        <span className="font-semibold text-gray-900 dark:text-white">Search Results</span>
                                        <div>
                                            <span className="text-gray-500 dark:text-gray-400">Total matches: </span>
                                            <span className="font-medium text-gray-900 dark:text-white">{summaryInfo.totalMatched.toLocaleString()}</span>
                                        </div>
                                        {summaryInfo.hasMoreMatches && (
                                            <div>
                                                <span className="text-gray-500 dark:text-gray-400">Fetched for AI: </span>
                                                <span className="font-medium text-gray-900 dark:text-white">{summaryInfo.fetched}</span>
                                                <span className="text-amber-600 dark:text-amber-400 ml-1">(limit {FILTER_LIMIT})</span>
                                            </div>
                                        )}
                                        {summaryInfo.isDisplayLimited && (
                                            <div>
                                                <span className="text-gray-500 dark:text-gray-400">Displaying: </span>
                                                <span className="font-medium text-gray-900 dark:text-white">{summaryInfo.displayed}</span>
                                                <span className="text-gray-400 dark:text-gray-500 ml-1">(first {DISPLAY_LIMIT})</span>
                                            </div>
                                        )}
                                    </div>
                                    {summaryInfo.hasMoreMatches && (
                                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                            Only the first {FILTER_LIMIT} articles will be processed when you add AI columns.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Results Table */}
                            {(hasSearched || selectedSnapshot) && (
                                displayData.articles.length > 0 ? (
                                    <Tablizer
                                        title="Search Results"
                                        articles={displayArticles}
                                        filterArticles={displayData.articles}
                                        onSaveToHistory={handleSaveFilteredToHistory}
                                    />
                                ) : (
                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
                                        No articles found for your search.
                                    </div>
                                )
                            )}
                        </div>

                        {/* Initial state */}
                        {!hasSearched && !selectedSnapshot && (
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
                                <TableCellsIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>Search PubMed to load articles into the Tablizer.</p>
                                <p className="text-sm mt-1">Add AI-powered columns to analyze and enrich your results.</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Search History Panel */}
            <SearchHistoryPanel
                snapshots={snapshots}
                selectedSnapshotId={selectedSnapshotId}
                onSelectSnapshot={handleSelectSnapshot}
                compareMode={compareMode}
                compareSnapshots={compareSnapshots}
                onToggleCompareMode={toggleCompareMode}
                onUpdateLabel={updateSnapshotLabel}
                onDeleteSnapshot={deleteSnapshot}
                isOpen={historyPanelOpen}
                onToggleOpen={() => setHistoryPanelOpen(!historyPanelOpen)}
            />
        </div>
    );
}

// ============================================================================
// Search History Panel
// ============================================================================

interface SearchHistoryPanelProps {
    snapshots: SearchSnapshot[];
    selectedSnapshotId: string | null;
    onSelectSnapshot: (id: string) => void;
    compareMode: boolean;
    compareSnapshots: [string, string] | null;
    onToggleCompareMode: () => void;
    onUpdateLabel: (id: string, label: string) => void;
    onDeleteSnapshot: (id: string) => void;
    isOpen: boolean;
    onToggleOpen: () => void;
}

function SearchHistoryPanel({
    snapshots,
    selectedSnapshotId,
    onSelectSnapshot,
    compareMode,
    compareSnapshots,
    onToggleCompareMode,
    onUpdateLabel,
    onDeleteSnapshot,
    isOpen,
    onToggleOpen
}: SearchHistoryPanelProps) {
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
    const [editingLabelValue, setEditingLabelValue] = useState('');

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getSourceIcon = (source: SnapshotSource) => {
        switch (source.type) {
            case 'search': return <MagnifyingGlassIcon className="h-3 w-3 text-blue-500" />;
            case 'filter': return <FunnelIcon className="h-3 w-3 text-purple-500" />;
            case 'compare': return <ArrowsRightLeftIcon className="h-3 w-3 text-green-500" />;
        }
    };

    const getSourceSummary = (snapshot: SearchSnapshot) => {
        if (snapshot.label) return snapshot.label;
        switch (snapshot.source.type) {
            case 'search':
                const q = snapshot.source.query;
                return q.substring(0, 30) + (q.length > 30 ? '...' : '');
            case 'filter':
                return snapshot.source.description;
            case 'compare':
                return snapshot.source.description;
        }
    };

    // Get version number for a snapshot ID
    const getVersionNumber = (id: string) => {
        const idx = snapshots.findIndex(s => s.id === id);
        return idx >= 0 ? snapshots.length - idx : null;
    };

    // Get provenance info for display
    const getProvenanceInfo = (snapshot: SearchSnapshot): { text: string; parentVersions: number[] } | null => {
        switch (snapshot.source.type) {
            case 'search':
                return null; // No parent for searches
            case 'filter': {
                const parentVersion = getVersionNumber(snapshot.source.parentId);
                if (!parentVersion) return null;
                return {
                    text: `filtered from #${parentVersion}`,
                    parentVersions: [parentVersion]
                };
            }
            case 'compare': {
                const parentVersions = snapshot.source.parentIds
                    .map(id => getVersionNumber(id))
                    .filter((v): v is number => v !== null);
                if (parentVersions.length < 2) return null;
                return {
                    text: `from #${parentVersions[0]} vs #${parentVersions[1]}`,
                    parentVersions
                };
            }
        }
    };

    if (!isOpen) {
        return (
            <div className="flex-shrink-0">
                <button
                    type="button"
                    onClick={onToggleOpen}
                    className="flex items-center justify-center w-8 h-24 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-l-lg border border-r-0 border-gray-300 dark:border-gray-600 transition-colors"
                    title="Open search history"
                >
                    <div className="flex flex-col items-center gap-1">
                        <ClockIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        <ChevronDoubleLeftIcon className="h-3 w-3 text-gray-500" />
                        {snapshots.length > 0 && (
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{snapshots.length}</span>
                        )}
                    </div>
                </button>
            </div>
        );
    }

    return (
        <div className="w-64 flex-shrink-0 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 flex flex-col max-h-[600px]">
            {/* Header */}
            <div className="border-b border-gray-300 dark:border-gray-600 p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        <h3 className="font-medium text-sm text-gray-900 dark:text-white">Search History</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onToggleOpen}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Close history panel"
                    >
                        <ChevronDoubleRightIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>
                {snapshots.length > 1 && (
                    <button
                        type="button"
                        onClick={onToggleCompareMode}
                        className={`w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                            compareMode
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        <ArrowsRightLeftIcon className="h-3 w-3" />
                        {compareMode ? 'Exit Compare' : 'Compare Searches'}
                    </button>
                )}
            </div>

            {/* Snapshot List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {snapshots.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <ClockIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Run searches to build history</p>
                    </div>
                ) : (
                    snapshots.map((snapshot, index) => {
                        const isSelected = selectedSnapshotId === snapshot.id;
                        const isCompareA = compareSnapshots?.[0] === snapshot.id;
                        const isCompareB = compareSnapshots?.[1] === snapshot.id && compareSnapshots[0] !== compareSnapshots[1];
                        const versionNumber = snapshots.length - index;

                        return (
                            <div
                                key={snapshot.id}
                                className={`border rounded-lg p-2 cursor-pointer transition-colors ${
                                    isSelected && !compareMode
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : isCompareA
                                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                                        : isCompareB
                                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                                onClick={() => onSelectSnapshot(snapshot.id)}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5">
                                        {getSourceIcon(snapshot.source)}
                                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                                            #{versionNumber}
                                        </span>
                                        {compareMode && isCompareA && (
                                            <span className="px-1 py-0.5 text-[10px] bg-orange-500 text-white rounded">A</span>
                                        )}
                                        {compareMode && isCompareB && (
                                            <span className="px-1 py-0.5 text-[10px] bg-green-500 text-white rounded">B</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                            {formatTime(snapshot.timestamp)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteSnapshot(snapshot.id);
                                            }}
                                            className="p-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
                                            title="Delete snapshot"
                                        >
                                            <TrashIcon className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>

                                {/* Label (editable) */}
                                {editingLabelId === snapshot.id ? (
                                    <input
                                        type="text"
                                        value={editingLabelValue}
                                        onChange={(e) => setEditingLabelValue(e.target.value)}
                                        onBlur={() => {
                                            onUpdateLabel(snapshot.id, editingLabelValue);
                                            setEditingLabelId(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                onUpdateLabel(snapshot.id, editingLabelValue);
                                                setEditingLabelId(null);
                                            }
                                            if (e.key === 'Escape') {
                                                setEditingLabelId(null);
                                            }
                                        }}
                                        autoFocus
                                        className="w-full px-1 py-0.5 text-xs border border-blue-500 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                        placeholder="Add label..."
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <div
                                        className="text-xs text-gray-600 dark:text-gray-400 truncate cursor-text hover:text-blue-600 dark:hover:text-blue-400"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingLabelId(snapshot.id);
                                            setEditingLabelValue(snapshot.label || '');
                                        }}
                                        title="Click to edit label"
                                    >
                                        {getSourceSummary(snapshot)}
                                    </div>
                                )}

                                {/* Provenance info */}
                                {(() => {
                                    const provenance = getProvenanceInfo(snapshot);
                                    if (!provenance) return null;
                                    return (
                                        <div className="mt-0.5 text-[10px] text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                            <span>↳</span>
                                            <span>{provenance.text}</span>
                                        </div>
                                    );
                                })()}

                                {/* Stats */}
                                <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                                    {snapshot.articles.length} fetched / {snapshot.totalMatched.toLocaleString()} total
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Search Compare View
// ============================================================================

interface SearchCompareViewProps {
    snapshotA: SearchSnapshot | undefined;
    snapshotB: SearchSnapshot | undefined;
    onClose: () => void;
    onSaveToHistory: (articles: CanonicalResearchArticle[], description: string) => void;
}

function SearchCompareView({ snapshotA, snapshotB, onClose, onSaveToHistory }: SearchCompareViewProps) {
    const [activeTab, setActiveTab] = useState<'only_a' | 'both' | 'only_b'>('only_a');
    const [copiedGroup, setCopiedGroup] = useState<string | null>(null);

    const copyToClipboard = async (text: string, group: string) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            setCopiedGroup(group);
            setTimeout(() => setCopiedGroup(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    if (!snapshotA || !snapshotB) {
        return (
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 p-8">
                <div className="text-center text-gray-500 dark:text-gray-400">
                    <ArrowsRightLeftIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Select two searches to compare</p>
                </div>
            </div>
        );
    }

    // Compare PMIDs
    const aIds = new Set(snapshotA.allPmids);
    const bIds = new Set(snapshotB.allPmids);

    const onlyInAPmids = snapshotA.allPmids.filter(id => !bIds.has(id));
    const onlyInBPmids = snapshotB.allPmids.filter(id => !aIds.has(id));
    const inBothPmids = snapshotA.allPmids.filter(id => bIds.has(id));

    // Get article data for display
    const aArticleMap = new Map(snapshotA.articles.map(a => [a.pmid || a.id || '', a]));
    const bArticleMap = new Map(snapshotB.articles.map(a => [a.pmid || a.id || '', a]));

    const onlyInA = onlyInAPmids.map(id => aArticleMap.get(id)).filter((a): a is CanonicalResearchArticle => !!a);
    const onlyInB = onlyInBPmids.map(id => bArticleMap.get(id)).filter((a): a is CanonicalResearchArticle => !!a);
    const inBoth = inBothPmids.map(id => aArticleMap.get(id) || bArticleMap.get(id)).filter((a): a is CanonicalResearchArticle => !!a);

    const getDisplayArticles = () => {
        switch (activeTab) {
            case 'only_a': return onlyInA;
            case 'only_b': return onlyInB;
            case 'both': return inBoth;
        }
    };

    const getPmids = () => {
        switch (activeTab) {
            case 'only_a': return onlyInAPmids;
            case 'only_b': return onlyInBPmids;
            case 'both': return inBothPmids;
        }
    };

    const displayArticles = getDisplayArticles();
    const pmids = getPmids();

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 flex flex-col min-h-[500px]">
            {/* Header */}
            <div className="border-b border-gray-300 dark:border-gray-600 p-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <ArrowsRightLeftIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <h3 className="font-medium text-gray-900 dark:text-white">Compare Searches</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                    >
                        Exit comparison
                    </button>
                </div>

                {/* Snapshot Labels */}
                <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded">A</span>
                        <span className="text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                            {snapshotA.label || (snapshotA.source.type === 'search' ? snapshotA.source.query.substring(0, 30) : snapshotA.source.description)}
                        </span>
                        <span className="text-gray-400">({snapshotA.allPmids.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-green-500 text-white text-xs rounded">B</span>
                        <span className="text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                            {snapshotB.label || (snapshotB.source.type === 'search' ? snapshotB.source.query.substring(0, 30) : snapshotB.source.description)}
                        </span>
                        <span className="text-gray-400">({snapshotB.allPmids.length})</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-300 dark:border-gray-600 flex flex-shrink-0">
                <button
                    onClick={() => setActiveTab('only_a')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'only_a'
                            ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-b-2 border-orange-500'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                >
                    Only in A ({onlyInAPmids.length})
                </button>
                <button
                    onClick={() => setActiveTab('both')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'both'
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                >
                    In Both ({inBothPmids.length})
                </button>
                <button
                    onClick={() => setActiveTab('only_b')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'only_b'
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-b-2 border-green-500'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                >
                    Only in B ({onlyInBPmids.length})
                </button>
            </div>

            {/* Actions bar */}
            {displayArticles.length > 0 && (
                <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex-shrink-0 flex items-center gap-4">
                    <button
                        onClick={() => copyToClipboard(pmids.join('\n'), activeTab)}
                        className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                        <ClipboardDocumentIcon className="h-4 w-4" />
                        {copiedGroup === activeTab ? 'Copied!' : `Copy ${pmids.length} PMIDs`}
                    </button>
                    <button
                        onClick={() => {
                            const desc = activeTab === 'only_a' ? 'Only in A' : activeTab === 'only_b' ? 'Only in B' : 'In Both';
                            onSaveToHistory(displayArticles, desc);
                        }}
                        className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                    >
                        <PlusCircleIcon className="h-4 w-4" />
                        Save to History
                    </button>
                </div>
            )}

            {/* Article List */}
            <div className="flex-1 overflow-y-auto">
                {displayArticles.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                        No articles in this category
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {displayArticles.slice(0, 50).map((article) => (
                            <div key={article.pmid || article.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                    PMID: {article.pmid}
                                </div>
                                <div className="text-sm text-gray-900 dark:text-white line-clamp-2">
                                    {article.title}
                                </div>
                            </div>
                        ))}
                        {displayArticles.length > 50 && (
                            <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
                                ... and {displayArticles.length - 50} more
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
