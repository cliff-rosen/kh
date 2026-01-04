import { useState } from 'react';
import {
    PlayIcon,
    BeakerIcon,
    TrashIcon,
    QuestionMarkCircleIcon,
    XMarkIcon,
    ArrowTopRightOnSquareIcon,
    ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import { CanonicalClinicalTrial } from '../../types/canonical_types';
import { toolsApi } from '../../lib/api/toolsApi';
import { trackEvent } from '../../lib/api/trackingApi';

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

export default function TablizeTrials() {
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

    // UI state
    const [selectedTrial, setSelectedTrial] = useState<CanonicalClinicalTrial | null>(null);
    const [showHelp, setShowHelp] = useState(false);

    // Handle search
    const handleSearch = async () => {
        if (!condition.trim() && !intervention.trim() && !sponsor.trim()) {
            setError('Please enter at least one search term (condition, intervention, or sponsor)');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await toolsApi.searchTrials({
                condition: condition || undefined,
                intervention: intervention || undefined,
                sponsor: sponsor || undefined,
                status: selectedStatus.length > 0 ? selectedStatus : undefined,
                phase: selectedPhase.length > 0 ? selectedPhase : undefined,
                studyType: studyType || undefined,
                location: location || undefined,
                maxResults: 100
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
        setSelectedTrial(null);
    };

    // Toggle multi-select options
    const toggleOption = (value: string, selected: string[], setSelected: (v: string[]) => void) => {
        if (selected.includes(value)) {
            setSelected(selected.filter(v => v !== value));
        } else {
            setSelected([...selected, value]);
        }
    };

    // Export to CSV
    const exportToCsv = () => {
        if (trials.length === 0) return;

        const headers = ['NCT ID', 'Title', 'Status', 'Phase', 'Sponsor', 'Conditions', 'Interventions', 'Enrollment', 'Start Date', 'URL'];
        const rows = trials.map(t => [
            t.nct_id,
            `"${(t.brief_title || t.title).replace(/"/g, '""')}"`,
            t.status,
            t.phase || '',
            t.lead_sponsor?.name || '',
            `"${t.conditions.join('; ')}"`,
            `"${t.interventions.map(i => i.name).join('; ')}"`,
            t.enrollment_count || '',
            t.start_date || '',
            t.url
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clinical_trials_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        trackEvent('trialscout_export', { count: trials.length });
    };

    // Format phase for display
    const formatPhase = (phase?: string) => {
        if (!phase) return '-';
        return phase.replace('PHASE', 'Phase ').replace('EARLY_', 'Early ').replace('NA', 'N/A');
    };

    // Format status for display
    const formatStatus = (status: string) => {
        return status.split('_').map(word =>
            word.charAt(0) + word.slice(1).toLowerCase()
        ).join(' ');
    };

    return (
        <div className="space-y-6">
            {/* Search Form */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
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
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    {/* Results header */}
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            Showing <span className="font-medium text-gray-900 dark:text-white">{trials.length}</span> of{' '}
                            <span className="font-medium text-gray-900 dark:text-white">{totalResults.toLocaleString()}</span> trials
                        </div>
                        {trials.length > 0 && (
                            <button
                                onClick={exportToCsv}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 border border-gray-300 dark:border-gray-600 rounded-md hover:border-purple-300 dark:hover:border-purple-600"
                            >
                                <ArrowDownTrayIcon className="h-4 w-4" />
                                Export CSV
                            </button>
                        )}
                    </div>

                    {/* Results table */}
                    {trials.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-900">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">NCT ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phase</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sponsor</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Enrollment</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Start</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {trials.map((trial) => (
                                        <tr
                                            key={trial.nct_id}
                                            onClick={() => setSelectedTrial(trial)}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                                        >
                                            <td className="px-4 py-3 text-sm">
                                                <a
                                                    href={trial.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                                                >
                                                    {trial.nct_id}
                                                    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                                </a>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white max-w-md truncate">
                                                {trial.brief_title || trial.title}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    trial.status === 'RECRUITING' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                    trial.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                                    trial.status === 'ACTIVE_NOT_RECRUITING' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {formatStatus(trial.status)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                                {formatPhase(trial.phase)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[150px] truncate">
                                                {trial.lead_sponsor?.name || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                                {trial.enrollment_count?.toLocaleString() || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                                {trial.start_date || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
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

            {/* Trial Detail Modal */}
            {selectedTrial && (
                <TrialDetailModal
                    trial={selectedTrial}
                    onClose={() => setSelectedTrial(null)}
                />
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

// Trial Detail Modal Component
function TrialDetailModal({ trial, onClose }: { trial: CanonicalClinicalTrial; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <a
                                href={trial.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 text-sm"
                            >
                                {trial.nct_id}
                                <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                            </a>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                trial.status === 'RECRUITING' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                trial.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                                {trial.status.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}
                            </span>
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            {trial.brief_title || trial.title}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto space-y-4">
                    {/* Key Info Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Phase</div>
                            <div className="font-medium text-gray-900 dark:text-white">
                                {trial.phase?.replace('PHASE', 'Phase ').replace('NA', 'N/A') || 'N/A'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Study Type</div>
                            <div className="font-medium text-gray-900 dark:text-white capitalize">
                                {trial.study_type?.toLowerCase() || 'N/A'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Enrollment</div>
                            <div className="font-medium text-gray-900 dark:text-white">
                                {trial.enrollment_count?.toLocaleString() || 'N/A'} {trial.enrollment_type && `(${trial.enrollment_type.toLowerCase()})`}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Start Date</div>
                            <div className="font-medium text-gray-900 dark:text-white">
                                {trial.start_date || 'N/A'}
                            </div>
                        </div>
                    </div>

                    {/* Sponsor */}
                    {trial.lead_sponsor && (
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Lead Sponsor</div>
                            <div className="text-gray-900 dark:text-white">
                                {trial.lead_sponsor.name}
                                {trial.lead_sponsor.type && <span className="text-gray-500 ml-1">({trial.lead_sponsor.type})</span>}
                            </div>
                        </div>
                    )}

                    {/* Conditions */}
                    {trial.conditions.length > 0 && (
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Conditions</div>
                            <div className="flex flex-wrap gap-1">
                                {trial.conditions.map((c, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm">
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Interventions */}
                    {trial.interventions.length > 0 && (
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Interventions</div>
                            <div className="space-y-1">
                                {trial.interventions.map((interv, i) => (
                                    <div key={i} className="text-sm">
                                        <span className="font-medium text-gray-900 dark:text-white">{interv.name}</span>
                                        <span className="text-gray-500 dark:text-gray-400 ml-1">({interv.type})</span>
                                        {interv.description && (
                                            <p className="text-gray-600 dark:text-gray-400 text-xs mt-0.5">{interv.description}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Primary Outcomes */}
                    {trial.primary_outcomes.length > 0 && (
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Primary Outcomes</div>
                            <ul className="list-disc list-inside space-y-1">
                                {trial.primary_outcomes.map((outcome, i) => (
                                    <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                                        {outcome.measure}
                                        {outcome.time_frame && <span className="text-gray-500 ml-1">({outcome.time_frame})</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Brief Summary */}
                    {trial.brief_summary && (
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Summary</div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {trial.brief_summary}
                            </p>
                        </div>
                    )}

                    {/* Locations */}
                    {trial.location_countries.length > 0 && (
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Countries</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                                {trial.location_countries.join(', ')}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
