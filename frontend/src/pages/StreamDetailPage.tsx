import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResearchStream } from '../context/ResearchStreamContext';
import { StreamType, ReportFrequency } from '../types';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function StreamDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams, updateResearchStream, deleteResearchStream, isLoading, error, clearError } = useResearchStream();

    const [stream, setStream] = useState<any>(null);
    const [form, setForm] = useState({
        stream_name: '',
        description: '',
        stream_type: StreamType.MIXED,
        focus_areas: [] as string[],
        competitors: [] as string[],
        report_frequency: ReportFrequency.WEEKLY,
        is_active: true
    });
    const [focusAreasInput, setFocusAreasInput] = useState('');
    const [competitorsInput, setCompetitorsInput] = useState('');

    useEffect(() => {
        loadResearchStreams();
    }, [loadResearchStreams]);

    useEffect(() => {
        if (id && researchStreams.length > 0) {
            const foundStream = researchStreams.find(s => s.stream_id === Number(id));
            if (foundStream) {
                setStream(foundStream);
                setForm({
                    stream_name: foundStream.stream_name,
                    description: foundStream.description || '',
                    stream_type: foundStream.stream_type,
                    focus_areas: foundStream.focus_areas || [],
                    competitors: foundStream.competitors || [],
                    report_frequency: foundStream.report_frequency,
                    is_active: foundStream.is_active
                });
                setFocusAreasInput((foundStream.focus_areas || []).join(', '));
                setCompetitorsInput((foundStream.competitors || []).join(', '));
            }
        }
    }, [id, researchStreams]);

    const handleFocusAreasChange = (value: string) => {
        setFocusAreasInput(value);
        const areas = value.split(',').map(s => s.trim()).filter(s => s);
        setForm({ ...form, focus_areas: areas });
    };

    const handleCompetitorsChange = (value: string) => {
        setCompetitorsInput(value);
        const competitors = value.split(',').map(s => s.trim()).filter(s => s);
        setForm({ ...form, competitors });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;

        try {
            await updateResearchStream(Number(id), form);
            navigate('/streams');
        } catch (err) {
            console.error('Failed to update stream:', err);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        if (!confirm('Are you sure you want to delete this research stream? This action cannot be undone.')) {
            return;
        }

        try {
            await deleteResearchStream(Number(id));
            navigate('/streams');
        } catch (err) {
            console.error('Failed to delete stream:', err);
        }
    };

    if (isLoading || !stream) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <button
                onClick={() => navigate('/streams')}
                className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
            >
                <ArrowLeftIcon className="h-5 w-5 mr-2" />
                Back to Streams
            </button>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    Edit Research Stream
                </h1>

                {error && (
                    <div className="mb-6 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
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
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="Describe the purpose of this stream..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Stream Type *
                        </label>
                        <select
                            value={form.stream_type}
                            onChange={(e) => setForm({ ...form, stream_type: e.target.value as StreamType })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        >
                            <option value={StreamType.COMPETITIVE}>Competitive Intelligence</option>
                            <option value={StreamType.REGULATORY}>Regulatory Updates</option>
                            <option value={StreamType.CLINICAL}>Clinical Trials</option>
                            <option value={StreamType.MARKET}>Market Analysis</option>
                            <option value={StreamType.SCIENTIFIC}>Scientific Literature</option>
                            <option value={StreamType.MIXED}>Mixed/Multi-purpose</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Focus Areas *
                        </label>
                        <input
                            type="text"
                            value={focusAreasInput}
                            onChange={(e) => handleFocusAreasChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="e.g., Oncology, CAR-T therapy, Immunotherapy"
                            required
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
                            value={competitorsInput}
                            onChange={(e) => handleCompetitorsChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="e.g., Roche, Novartis, Bristol Myers Squibb"
                        />
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Separate multiple competitors with commas
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Report Frequency *
                        </label>
                        <select
                            value={form.report_frequency}
                            onChange={(e) => setForm({ ...form, report_frequency: e.target.value as ReportFrequency })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        >
                            <option value={ReportFrequency.DAILY}>Daily</option>
                            <option value={ReportFrequency.WEEKLY}>Weekly</option>
                            <option value={ReportFrequency.BIWEEKLY}>Bi-weekly</option>
                            <option value={ReportFrequency.MONTHLY}>Monthly</option>
                        </select>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="is_active"
                            checked={form.is_active}
                            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                            className="h-4 w-4 text-blue-600 rounded"
                        />
                        <label htmlFor="is_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            Stream is active
                        </label>
                    </div>

                    <div className="flex justify-between items-center pt-6 border-t border-gray-200 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                            Delete Stream
                        </button>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => navigate('/streams')}
                                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {isLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
