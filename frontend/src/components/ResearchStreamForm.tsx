import { useState } from 'react';
import { useResearchStream } from '../context/ResearchStreamContext';
import { StreamType, ReportFrequency } from '../types';
import { useNavigate } from 'react-router-dom';

interface ResearchStreamFormProps {
    onCancel?: () => void;
}

export default function ResearchStreamForm({ onCancel }: ResearchStreamFormProps) {
    const { createResearchStream, isLoading, error, clearError } = useResearchStream();
    const navigate = useNavigate();

    const [form, setForm] = useState({
        stream_name: '',
        description: '',
        stream_type: StreamType.MIXED,
        focus_areas: [] as string[],
        competitors: [] as string[],
        report_frequency: ReportFrequency.WEEKLY,
        // Phase 1 fields
        purpose: '',
        business_goals: [] as string[],
        expected_outcomes: '',
        keywords: [] as string[]
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createResearchStream(form);
            navigate('/dashboard');
        } catch (err) {
            console.error('Failed to create research stream:', err);
        }
    };

    const handleFocusAreasChange = (value: string) => {
        const areas = value.split(',').map(s => s.trim()).filter(s => s);
        setForm({ ...form, focus_areas: areas });
    };

    const handleCompetitorsChange = (value: string) => {
        const competitors = value.split(',').map(s => s.trim()).filter(s => s);
        setForm({ ...form, competitors });
    };

    const handleBusinessGoalsChange = (value: string) => {
        const goals = value.split(',').map(s => s.trim()).filter(s => s);
        setForm({ ...form, business_goals: goals });
    };

    const handleKeywordsChange = (value: string) => {
        const keywords = value.split(',').map(s => s.trim()).filter(s => s);
        setForm({ ...form, keywords });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Create Research Stream
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Define what you want to monitor and how often you want reports.
                </p>
            </div>

            {error && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">{error}</p>
                    <button
                        onClick={clearError}
                        className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Stream Name *
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., Oncology Competitive Intelligence"
                        value={form.stream_name}
                        onChange={(e) => setForm({ ...form, stream_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Description
                    </label>
                    <textarea
                        placeholder="Brief description of what this stream will monitor..."
                        rows={3}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Stream Type
                    </label>
                    <select
                        value={form.stream_type}
                        onChange={(e) => setForm({ ...form, stream_type: e.target.value as StreamType })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value={StreamType.MIXED}>Mixed - Multiple focus areas</option>
                        <option value={StreamType.COMPETITIVE}>Competitive Intelligence</option>
                        <option value={StreamType.REGULATORY}>Regulatory Updates</option>
                        <option value={StreamType.CLINICAL}>Clinical Research</option>
                        <option value={StreamType.MARKET}>Market Analysis</option>
                        <option value={StreamType.SCIENTIFIC}>Scientific Literature</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Focus Areas
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., Drug development, Clinical trials, Market access"
                        value={form.focus_areas.join(', ')}
                        onChange={(e) => handleFocusAreasChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Separate multiple areas with commas
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Competitors to Monitor
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., Roche, Merck, Pfizer"
                        value={form.competitors.join(', ')}
                        onChange={(e) => handleCompetitorsChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Companies you want to track
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Report Frequency
                    </label>
                    <select
                        value={form.report_frequency}
                        onChange={(e) => setForm({ ...form, report_frequency: e.target.value as ReportFrequency })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value={ReportFrequency.DAILY}>Daily</option>
                        <option value={ReportFrequency.WEEKLY}>Weekly</option>
                        <option value={ReportFrequency.BIWEEKLY}>Bi-weekly</option>
                        <option value={ReportFrequency.MONTHLY}>Monthly</option>
                    </select>
                </div>

                {/* Phase 1 Fields */}
                <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Enhanced Configuration
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Optional: Provide additional context for better intelligence gathering
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Purpose *
                    </label>
                    <textarea
                        placeholder="What's the purpose of this research stream? What decisions will it help you make?"
                        rows={3}
                        value={form.purpose}
                        onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Example: Monitor melanocortin pathways to identify opportunities and risks for drug development programs
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Business Goals *
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., Inform study design, Track competitive landscape, Identify new indications"
                        value={form.business_goals.join(', ')}
                        onChange={(e) => handleBusinessGoalsChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Strategic objectives this stream supports (comma-separated)
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Expected Outcomes *
                    </label>
                    <textarea
                        placeholder="What outcomes or decisions will this intelligence drive?"
                        rows={2}
                        value={form.expected_outcomes}
                        onChange={(e) => setForm({ ...form, expected_outcomes: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Search Keywords *
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., melanocortin, MCR1, MCR4, bremelanotide, obesity, dry eye disease"
                        value={form.keywords.join(', ')}
                        onChange={(e) => handleKeywordsChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Specific keywords to search in scientific literature (comma-separated)
                    </p>
                </div>

                <div className="flex justify-between">
                    <button
                        type="button"
                        onClick={onCancel || (() => navigate('/dashboard'))}
                        className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? 'Creating...' : 'Create Stream'}
                    </button>
                </div>
            </form>
        </div>
    );
}