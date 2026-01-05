import { useState, useCallback } from 'react';
import {
    PlayIcon,
    BeakerIcon,
    TrashIcon,
    QuestionMarkCircleIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import { CanonicalClinicalTrial } from '../../types/canonical_types';
import { toolsApi } from '../../lib/api/toolsApi';
import { trackEvent } from '../../lib/api/trackingApi';
import TrialScoutTable from './TrialScoutTable';

// Fetch limits - initial search is fast, AI processing gets more
const INITIAL_FETCH_LIMIT = 50;   // Initial trials to fetch (fast)
const AI_FETCH_LIMIT = 500;       // Max trials to fetch for AI processing

// Status options for filter
const STATUS_OPTIONS = [
    { value: 'RECRUITING', label: 'Recruiting' },
    { value: 'NOT_YET_RECRUITING', label: 'Not Yet Recruiting' },
    { value: 'ACTIVE_NOT_RECRUITING', label: 'Active, Not Recruiting' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'TERMINATED', label: 'Terminated' },
    { value: 'WITHDRAWN', label: 'Withdrawn' },
    { value: 'SUSPENDED', label: 'Suspended' },
];

// Phase options for filter
const PHASE_OPTIONS = [
    { value: 'EARLY_PHASE1', label: 'Early Phase 1' },
    { value: 'PHASE1', label: 'Phase 1' },
    { value: 'PHASE2', label: 'Phase 2' },
    { value: 'PHASE3', label: 'Phase 3' },
    { value: 'PHASE4', label: 'Phase 4' },
    { value: 'NA', label: 'Not Applicable' },
];

// Study type options
const STUDY_TYPE_OPTIONS = [
    { value: '', label: 'Any' },
    { value: 'INTERVENTIONAL', label: 'Interventional' },
    { value: 'OBSERVATIONAL', label: 'Observational' },
];

export default function TrialScoutSearch() {
    // Search form state
    const [condition, setCondition] = useState('');
    const [intervention, setIntervention] = useState('');
    const [sponsor, setSponsor] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
    const [selectedPhase, setSelectedPhase] = useState<string[]>([]);
    const [studyType, setStudyType] = useState('');
    const [location, setLocation] = useState('');

    // Results state
    const [trials, setTrials] = useState<CanonicalClinicalTrial[]>([]);
    const [totalResults, setTotalResults] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    // AI fetch state - track if we've fetched the expanded set
    const [hasFetchedFullSet, setHasFetchedFullSet] = useState(false);
    const [fetchingMore, setFetchingMore] = useState(false);
    const [lastSearchParams, setLastSearchParams] = useState<{
        condition?: string;
        intervention?: string;
        sponsor?: string;
        status?: string[];
        phase?: string[];
        studyType?: string;
        location?: string;
    } | null>(null);

    // UI state
    const [showHelp, setShowHelp] = useState(false);

    // Handle search
    const handleSearch = async () => {
        if (!condition.trim() && !intervention.trim() && !sponsor.trim()) {
            setError('Please enter at least one search term (condition, intervention, or sponsor)');
            return;
        }

        setLoading(true);
        setError(null);

        // Save search params for potential expanded fetch later
        const searchParams = {
            condition: condition || undefined,
            intervention: intervention || undefined,
            sponsor: sponsor || undefined,
            status: selectedStatus.length > 0 ? selectedStatus : undefined,
            phase: selectedPhase.length > 0 ? selectedPhase : undefined,
            studyType: studyType || undefined,
            location: location || undefined,
        };
        setLastSearchParams(searchParams);
        setHasFetchedFullSet(false);

        try {
            const response = await toolsApi.searchTrials({
                ...searchParams,
                maxResults: INITIAL_FETCH_LIMIT
            });

            setTrials(response.trials);
            setTotalResults(response.total_results);
            setHasSearched(true);

            trackEvent('trialscout_search', {
                has_condition: !!condition,
                has_intervention: !!intervention,
                has_sponsor: !!sponsor,
                result_count: response.total_results
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    // Fetch more trials for AI processing (up to 500)
    const fetchMoreForAI = useCallback(async (): Promise<CanonicalClinicalTrial[]> => {
        // If we already have the full set, return current trials
        if (hasFetchedFullSet || !lastSearchParams) {
            return trials;
        }

        setFetchingMore(true);
        try {
            const response = await toolsApi.searchTrials({
                ...lastSearchParams,
                maxResults: AI_FETCH_LIMIT
            });
            setTrials(response.trials);
            setHasFetchedFullSet(true);
            return response.trials;
        } catch (err) {
            console.error('Failed to fetch more trials:', err);
            return trials; // Return what we have on error
        } finally {
            setFetchingMore(false);
        }
    }, [hasFetchedFullSet, lastSearchParams, trials]);

    // Handle clear
    const handleClear = () => {
        setCondition('');
        setIntervention('');
        setSponsor('');
        setSelectedStatus([]);
        setSelectedPhase([]);
        setStudyType('');
        setLocation('');
        setTrials([]);
        setTotalResults(0);
        setHasSearched(false);
        setError(null);
        setHasFetchedFullSet(false);
        setLastSearchParams(null);
    };

    // Toggle multi-select options
    const toggleOption = (value: string, selected: string[], setSelected: (v: string[]) => void) => {
        if (selected.includes(value)) {
            setSelected(selected.filter(v => v !== value));
        } else {
            setSelected([...selected, value]);
        }
    };

    return (
        <div className="flex flex-col h-full gap-6">
            {/* Search Form */}
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        <BeakerIcon className="h-5 w-5 text-purple-500" />
                        Search Clinical Trials
                    </h3>
                    <button
                        onClick={() => {
                            setShowHelp(true);
                            trackEvent('trialscout_help_open', {});
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
                    >
                        <QuestionMarkCircleIcon className="h-5 w-5" />
                        Help
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Main search fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Condition / Disease
                            </label>
                            <input
                                type="text"
                                value={condition}
                                onChange={(e) => setCondition(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="e.g., diabetes, lung cancer"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Intervention / Treatment
                            </label>
                            <input
                                type="text"
                                value={intervention}
                                onChange={(e) => setIntervention(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="e.g., pembrolizumab, immunotherapy"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Sponsor
                            </label>
                            <input
                                type="text"
                                value={sponsor}
                                onChange={(e) => setSponsor(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="e.g., Pfizer, NIH"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                            />
                        </div>
                    </div>

                    {/* Filters row */}
                    <div className="flex flex-wrap items-end gap-4">
                        {/* Status multi-select */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Status
                            </label>
                            <div className="flex flex-wrap gap-1">
                                {STATUS_OPTIONS.slice(0, 4).map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => toggleOption(opt.value, selectedStatus, setSelectedStatus)}
                                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                                            selectedStatus.includes(opt.value)
                                                ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-500 text-purple-700 dark:text-purple-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Phase multi-select */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Phase
                            </label>
                            <div className="flex flex-wrap gap-1">
                                {PHASE_OPTIONS.filter(p => ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4'].includes(p.value)).map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => toggleOption(opt.value, selectedPhase, setSelectedPhase)}
                                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                                            selectedPhase.includes(opt.value)
                                                ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-500 text-purple-700 dark:text-purple-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Study type */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Study Type
                            </label>
                            <select
                                value={studyType}
                                onChange={(e) => setStudyType(e.target.value)}
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                {STUDY_TYPE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Location */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Country
                            </label>
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g., United States"
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 w-40"
                            />
                        </div>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Search + Clear buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSearch}
                                disabled={loading}
                                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                            {(hasSearched || condition || intervention || sponsor) && (
                                <button
                                    onClick={handleClear}
                                    className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 rounded-md hover:border-red-300 dark:hover:border-red-600 flex items-center gap-1.5"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm">
                        {error}
                    </div>
                )}
            </div>

            {/* Results */}
            {hasSearched && (
                <div className="flex-1 flex flex-col min-h-0">
                    {/* Results header */}
                    <div className="flex-shrink-0 mb-2 flex items-center gap-4">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-gray-500 dark:text-gray-400">Total matches: </span>
                            <span className="font-medium text-gray-900 dark:text-white">{totalResults.toLocaleString()}</span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-gray-500 dark:text-gray-400">Fetched: </span>
                            <span className="font-medium text-gray-900 dark:text-white">{trials.length}</span>
                            {!hasFetchedFullSet && totalResults > trials.length && (
                                <span className="text-gray-400 dark:text-gray-500 ml-1">(up to {AI_FETCH_LIMIT} fetched for AI)</span>
                            )}
                        </div>
                        {fetchingMore && (
                            <span className="text-sm text-purple-600 dark:text-purple-400">
                                Fetching more for AI processing...
                            </span>
                        )}
                    </div>

                    {/* Results table with AI columns */}
                    {trials.length > 0 ? (
                        <div className="flex-1 min-h-0">
                            <TrialScoutTable
                                trials={trials}
                                onFetchMoreForAI={fetchMoreForAI}
                            />
                        </div>
                    ) : (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            No trials found matching your search criteria.
                        </div>
                    )}
                </div>
            )}

            {/* Initial state */}
            {!hasSearched && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
                    <BeakerIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Search ClinicalTrials.gov to explore clinical trials.</p>
                    <p className="text-sm mt-1">Filter by condition, intervention, sponsor, phase, and status.</p>
                </div>
            )}

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowHelp(false)} />
                    <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">TrialScout Help</h2>
                            <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">What is TrialScout?</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">
                                    TrialScout lets you search and explore clinical trials from ClinicalTrials.gov.
                                    Find trials by condition, intervention, sponsor, and more.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Search Tips</h3>
                                <ul className="text-gray-600 dark:text-gray-400 text-sm space-y-1 list-disc list-inside">
                                    <li>Enter at least one search term (condition, intervention, or sponsor)</li>
                                    <li>Use filters to narrow results by status, phase, or study type</li>
                                    <li>Click any row to see full trial details</li>
                                    <li>Export results to CSV for further analysis</li>
                                </ul>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI Columns</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                                    Add AI-powered columns to analyze trials with natural language prompts:
                                </p>
                                <ul className="text-gray-600 dark:text-gray-400 text-sm space-y-1 list-disc list-inside">
                                    <li>Click "Add AI Column" to create a new analysis column</li>
                                    <li>Use Yes/No output type to filter trials by criteria</li>
                                    <li>Quick filters appear for boolean columns</li>
                                    <li>Example: "Does this trial involve gene therapy?"</li>
                                </ul>
                                <p className="text-gray-500 dark:text-gray-500 text-xs mt-2 italic">
                                    Initial search fetches {INITIAL_FETCH_LIMIT} trials for fast display. When you add an AI column,
                                    up to {AI_FETCH_LIMIT} trials are automatically fetched for processing.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Status Meanings</h3>
                                <ul className="text-gray-600 dark:text-gray-400 text-sm space-y-1">
                                    <li><span className="font-medium">Recruiting:</span> Currently enrolling participants</li>
                                    <li><span className="font-medium">Active, Not Recruiting:</span> Ongoing but not enrolling</li>
                                    <li><span className="font-medium">Completed:</span> Study has ended</li>
                                    <li><span className="font-medium">Terminated:</span> Stopped early</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
