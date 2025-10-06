import { useState } from 'react';
import { useResearchStream } from '../context/ResearchStreamContext';
import { StreamType, ReportFrequency, Channel } from '../types';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface ResearchStreamFormProps {
    onCancel?: () => void;
}

export default function ResearchStreamForm({ onCancel }: ResearchStreamFormProps) {
    const { createResearchStream, isLoading, error, clearError } = useResearchStream();
    const navigate = useNavigate();

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
        report_frequency: ReportFrequency.WEEKLY
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate that all channels are complete
        const incompleteChannel = form.channels.find(ch =>
            !ch.name || !ch.focus || !ch.type || ch.keywords.length === 0
        );

        if (incompleteChannel) {
            alert('Please complete all channel fields before submitting');
            return;
        }

        try {
            await createResearchStream(form);
            navigate('/dashboard');
        } catch (err) {
            console.error('Failed to create research stream:', err);
        }
    };

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

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Create Research Stream
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Set up monitoring channels to track different areas of research.
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
                {/* Stream Name */}
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

                {/* Purpose */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Purpose *
                    </label>
                    <textarea
                        placeholder="Why does this stream exist? What questions will it answer?"
                        rows={3}
                        value={form.purpose}
                        onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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

                {/* Form Actions */}
                <div className="flex justify-between pt-4">
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
