import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResearchStream } from '../context/ResearchStreamContext';
import { StreamType, ReportFrequency, Channel } from '../types';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

export default function StreamDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams, updateResearchStream, deleteResearchStream, isLoading, error, clearError } = useResearchStream();

    const [stream, setStream] = useState<any>(null);
    const [form, setForm] = useState({
        stream_name: '',
        purpose: '',
        channels: [
            {
                name: '',
                focus: '',
                type: StreamType.COMPETITIVE,
                keywords: [] as string[]
            }
        ] as Channel[],
        report_frequency: ReportFrequency.WEEKLY,
        is_active: true
    });

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
                    purpose: foundStream.purpose || '',
                    channels: foundStream.channels || [{
                        name: '',
                        focus: '',
                        type: StreamType.COMPETITIVE,
                        keywords: []
                    }],
                    report_frequency: foundStream.report_frequency,
                    is_active: foundStream.is_active
                });
            }
        }
    }, [id, researchStreams]);

    const addChannel = () => {
        setForm({
            ...form,
            channels: [
                ...form.channels,
                {
                    name: '',
                    focus: '',
                    type: StreamType.COMPETITIVE,
                    keywords: []
                }
            ]
        });
    };

    const removeChannel = (index: number) => {
        if (form.channels.length === 1) {
            alert('At least one channel is required');
            return;
        }
        setForm({
            ...form,
            channels: form.channels.filter((_, i) => i !== index)
        });
    };

    const updateChannel = (index: number, field: keyof Channel, value: any) => {
        const updated = [...form.channels];
        updated[index] = { ...updated[index], [field]: value };
        setForm({ ...form, channels: updated });
    };

    const handleKeywordsChange = (index: number, value: string) => {
        const keywords = value.split(',').map(s => s.trim()).filter(s => s);
        updateChannel(index, 'keywords', keywords);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;

        // Validate that all channels are complete
        const incompleteChannel = form.channels.find(ch =>
            !ch.name || !ch.focus || !ch.type || ch.keywords.length === 0
        );

        if (incompleteChannel) {
            alert('Please complete all channel fields before submitting');
            return;
        }

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
                    {/* Stream Name */}
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

                    {/* Purpose */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Purpose *
                        </label>
                        <textarea
                            value={form.purpose}
                            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="Why does this stream exist? What questions will it answer?"
                            required
                        />
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Example: Track competitive landscape in melanocortin receptor drug development to inform strategic decisions
                        </p>
                    </div>

                    {/* Channels */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Monitoring Channels *
                            </label>
                            <button
                                type="button"
                                onClick={addChannel}
                                className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Add Channel
                            </button>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Each channel monitors a specific area with its own focus and keywords
                        </p>

                        {form.channels.map((channel, index) => (
                            <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                        Channel {index + 1}
                                    </h3>
                                    {form.channels.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeChannel(index)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>

                                {/* Channel Name */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Channel Name *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g., Melanocortin Pathways"
                                        value={channel.name}
                                        onChange={(e) => updateChannel(index, 'name', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                {/* Channel Focus */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        What to Monitor *
                                    </label>
                                    <textarea
                                        placeholder="What specifically do you want to track in this channel?"
                                        rows={2}
                                        value={channel.focus}
                                        onChange={(e) => updateChannel(index, 'focus', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Example: Track competitor drug development activities and clinical trial progress
                                    </p>
                                </div>

                                {/* Channel Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Intelligence Type *
                                    </label>
                                    <select
                                        value={channel.type}
                                        onChange={(e) => updateChannel(index, 'type', e.target.value as StreamType)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    >
                                        <option value={StreamType.COMPETITIVE}>Competitive Intelligence</option>
                                        <option value={StreamType.REGULATORY}>Regulatory Updates</option>
                                        <option value={StreamType.CLINICAL}>Clinical Research</option>
                                        <option value={StreamType.MARKET}>Market Analysis</option>
                                        <option value={StreamType.SCIENTIFIC}>Scientific Literature</option>
                                    </select>
                                </div>

                                {/* Channel Keywords */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Search Keywords *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g., melanocortin, MCR1, MCR4, bremelanotide"
                                        value={channel.keywords.join(', ')}
                                        onChange={(e) => handleKeywordsChange(index, e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Keywords to search for in this channel (comma-separated)
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Report Frequency */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Report Frequency *
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
