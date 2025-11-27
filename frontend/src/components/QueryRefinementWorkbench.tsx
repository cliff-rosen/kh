import { useState } from 'react';
import {
    BeakerIcon,
    CheckBadgeIcon,
    FunnelIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';

interface QueryRefinementWorkbenchProps {
    streamId: number;
}

type RefinementTab = 'test-query' | 'validate-recall' | 'test-filter';

export default function QueryRefinementWorkbench({ streamId }: QueryRefinementWorkbenchProps) {
    const [activeTab, setActiveTab] = useState<RefinementTab>('test-query');

    const tabs = [
        { id: 'test-query' as RefinementTab, name: 'Test Query', icon: BeakerIcon },
        { id: 'validate-recall' as RefinementTab, name: 'Validate Recall', icon: CheckBadgeIcon },
        { id: 'test-filter' as RefinementTab, name: 'Test Filter', icon: FunnelIcon },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                    Query Refinement Workbench
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                    Test and refine individual queries, validate recall against known articles, and tune semantic filters.
                </p>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                                    ${isActive
                                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }
                                `}
                            >
                                <Icon className="h-5 w-5" />
                                {tab.name}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Tab Content */}
            <div>
                {activeTab === 'test-query' && <TestQueryTab streamId={streamId} />}
                {activeTab === 'validate-recall' && <ValidateRecallTab streamId={streamId} />}
                {activeTab === 'test-filter' && <TestFilterTab streamId={streamId} />}
            </div>
        </div>
    );
}

// ============================================================================
// Test Query Tab
// ============================================================================

function TestQueryTab({ streamId }: { streamId: number }) {
    const [selectedQuery, setSelectedQuery] = useState<string>('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [applyFilter, setApplyFilter] = useState(false);
    const [isRunning, setIsRunning] = useState(false);

    const runTest = async () => {
        setIsRunning(true);
        // TODO: Implement actual query testing
        setTimeout(() => setIsRunning(false), 2000);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Setup Panel */}
            <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">Setup</h4>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Query Source
                    </label>
                    <select
                        value={selectedQuery}
                        onChange={(e) => setSelectedQuery(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value="">Select a query...</option>
                        <option value="broad_1">Broad Query 1</option>
                        <option value="concept_1">Concept 1</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Select from your configured queries or concepts
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <label className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={applyFilter}
                            onChange={(e) => setApplyFilter(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Apply semantic filter</span>
                    </label>
                    {applyFilter && (
                        <div className="mt-3 pl-6 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            <div>Threshold: <span className="font-mono">0.7</span></div>
                            <div className="text-xs">Using filter from selected query</div>
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={runTest}
                    disabled={isRunning || !selectedQuery}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                        isRunning || !selectedQuery
                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                    {isRunning ? (
                        <>
                            <ArrowPathIcon className="h-5 w-5 animate-spin" />
                            Running Test...
                        </>
                    ) : (
                        <>
                            <MagnifyingGlassIcon className="h-5 w-5" />
                            Run Test
                        </>
                    )}
                </button>
            </div>

            {/* Results Panel */}
            <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">Results</h4>

                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 min-h-[400px]">
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <MagnifyingGlassIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Configure settings and click "Run Test" to see results</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Validate Recall Tab
// ============================================================================

function ValidateRecallTab({ streamId }: { streamId: number }) {
    const [goldStandardIds, setGoldStandardIds] = useState('');
    const [selectedQuery, setSelectedQuery] = useState<string>('');

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Setup Panel */}
            <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">Setup</h4>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Query to Test
                    </label>
                    <select
                        value={selectedQuery}
                        onChange={(e) => setSelectedQuery(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value="">Select a query...</option>
                        <option value="broad_1">Broad Query 1</option>
                        <option value="concept_1">Concept 1</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Gold Standard PubMed IDs
                    </label>
                    <textarea
                        value={goldStandardIds}
                        onChange={(e) => setGoldStandardIds(e.target.value)}
                        placeholder="Enter PubMed IDs (one per line or comma-separated)&#10;38123456&#10;38123457&#10;38123458"
                        rows={8}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Known relevant articles that should be captured
                    </p>
                </div>

                <button
                    type="button"
                    disabled={!selectedQuery || !goldStandardIds}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                        !selectedQuery || !goldStandardIds
                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                    <CheckBadgeIcon className="h-5 w-5" />
                    Validate Recall
                </button>
            </div>

            {/* Results Panel */}
            <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">Validation Results</h4>

                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 min-h-[400px]">
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <CheckBadgeIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Enter gold standard IDs and run validation</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Test Filter Tab
// ============================================================================

function TestFilterTab({ streamId }: { streamId: number }) {
    const [pubmedIds, setPubmedIds] = useState('');
    const [filterCriteria, setFilterCriteria] = useState('');
    const [threshold, setThreshold] = useState(0.7);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Setup Panel */}
            <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">Setup</h4>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        PubMed IDs to Filter
                    </label>
                    <textarea
                        value={pubmedIds}
                        onChange={(e) => setPubmedIds(e.target.value)}
                        placeholder="Enter PubMed IDs (one per line or comma-separated)&#10;38123456&#10;38123457&#10;38123458"
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        From query results or manually entered
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Filter Criteria
                    </label>
                    <textarea
                        value={filterCriteria}
                        onChange={(e) => setFilterCriteria(e.target.value)}
                        placeholder="Describe what should pass/fail the filter..."
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Confidence Threshold: {threshold.toFixed(2)}
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={threshold}
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>Permissive (0.0)</span>
                        <span>Strict (1.0)</span>
                    </div>
                </div>

                <button
                    type="button"
                    disabled={!pubmedIds || !filterCriteria}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                        !pubmedIds || !filterCriteria
                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                    <FunnelIcon className="h-5 w-5" />
                    Run Filter
                </button>
            </div>

            {/* Results Panel */}
            <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">Filter Results</h4>

                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 min-h-[400px]">
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <FunnelIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Configure filter and click "Run Filter" to see results</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
