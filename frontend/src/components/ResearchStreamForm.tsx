import { useState, useEffect } from 'react';
import { useResearchStream } from '../context/ResearchStreamContext';
import { StreamType, ReportFrequency, Channel, WorkflowConfig, ScoringConfig } from '../types';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface ResearchStreamFormProps {
    onCancel?: () => void;
}

type TabType = 'stream' | 'workflow';

export default function ResearchStreamForm({ onCancel }: ResearchStreamFormProps) {
    const { createResearchStream, isLoading, error, clearError, availableSources, loadAvailableSources } = useResearchStream();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<TabType>('stream');

    const [form, setForm] = useState({
        stream_name: '',
        purpose: '',
        channels: [
            {
                name: '',
                focus: '',
                type: StreamType.COMPETITIVE,
                keywords: [] as string[],
                semantic_filter: {
                    enabled: false,
                    criteria: null,
                    threshold: null
                }
            }
        ] as Channel[],
        report_frequency: ReportFrequency.WEEKLY,
        workflow_config: {
            sources: [],
            article_limit_per_week: 10
        } as WorkflowConfig,
        scoring_config: {
            relevance_weight: 0.6,
            evidence_weight: 0.4,
            inclusion_threshold: 7.0,
            max_items_per_report: 10
        } as ScoringConfig
    });

    useEffect(() => {
        loadAvailableSources();
    }, [loadAvailableSources]);

    // Sync channel queries when channels change
    useEffect(() => {
        if (!form.workflow_config?.sources || form.workflow_config.sources.length === 0) {
            return;
        }

        const updatedSources = form.workflow_config.sources.map(source => {
            // Create a map of existing queries by channel name
            const existingQueriesMap = new Map(
                source.channel_queries.map(q => [q.channel_name, q.query_expression])
            );

            // Update channel queries to match current channels
            const updatedChannelQueries = form.channels.map(ch => ({
                channel_name: ch.name,
                query_expression: existingQueriesMap.get(ch.name) || ch.keywords.join(' OR ')
            }));

            return {
                ...source,
                channel_queries: updatedChannelQueries
            };
        });

        // Only update if queries actually changed
        const queriesChanged = JSON.stringify(form.workflow_config.sources) !== JSON.stringify(updatedSources);
        if (queriesChanged) {
            setForm(prev => ({
                ...prev,
                workflow_config: {
                    ...prev.workflow_config,
                    sources: updatedSources
                }
            }));
        }
    }, [form.channels]);

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
            const newStream = await createResearchStream(form);
            // Navigate directly to implementation configuration (Workflow 2)
            navigate(`/streams/${newStream.stream_id}/configure`);
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
                    keywords: [],
                    semantic_filter: {
                        enabled: false,
                        criteria: null,
                        threshold: null
                    }
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

    const updateSemanticFilter = (index: number, field: 'enabled' | 'criteria' | 'threshold', value: any) => {
        const updated = [...form.channels];
        updated[index] = {
            ...updated[index],
            semantic_filter: {
                ...updated[index].semantic_filter!,
                [field]: value
            }
        };
        setForm({ ...form, channels: updated });
    };

    const handleKeywordsChange = (index: number, value: string) => {
        const keywords = value.split(',').map(s => s.trim()).filter(s => s);
        updateChannel(index, 'keywords', keywords);
    };

    const addWorkflowSource = () => {
        setForm({
            ...form,
            workflow_config: {
                ...form.workflow_config,
                sources: [
                    ...(form.workflow_config?.sources || []),
                    {
                        source_id: '',
                        enabled: true,
                        channel_queries: form.channels.map(ch => ({
                            channel_name: ch.name,
                            query_expression: ch.keywords.join(' OR ')
                        }))
                    }
                ]
            }
        });
    };

    const removeWorkflowSource = (index: number) => {
        const sources = form.workflow_config?.sources || [];
        setForm({
            ...form,
            workflow_config: {
                ...form.workflow_config,
                sources: sources.filter((_, i) => i !== index)
            }
        });
    };

    const updateWorkflowSource = (index: number, field: 'source_id' | 'enabled', value: any) => {
        const sources = [...(form.workflow_config?.sources || [])];
        sources[index] = { ...sources[index], [field]: value };
        setForm({
            ...form,
            workflow_config: {
                ...form.workflow_config,
                sources
            }
        });
    };

    const updateChannelQuery = (sourceIndex: number, channelIndex: number, queryExpression: string) => {
        const sources = [...(form.workflow_config?.sources || [])];
        sources[sourceIndex].channel_queries[channelIndex].query_expression = queryExpression;
        setForm({
            ...form,
            workflow_config: {
                ...form.workflow_config,
                sources
            }
        });
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

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav className="-mb-px flex space-x-8">
                    <button
                        type="button"
                        onClick={() => setActiveTab('stream')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'stream'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Stream Configuration
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('workflow')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'workflow'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Workflow & Scoring
                    </button>
                </nav>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Stream Configuration Tab */}
                {activeTab === 'stream' && (
                    <div className="space-y-6">
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

                                    {/* Semantic Filter */}
                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Semantic Filter (Advanced)
                                            </label>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={channel.semantic_filter?.enabled || false}
                                                    onChange={(e) => updateSemanticFilter(index, 'enabled', e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>

                                        {channel.semantic_filter?.enabled && (
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                        Filter Criteria
                                                    </label>
                                                    <textarea
                                                        placeholder="Describe what content should be included/excluded semantically..."
                                                        rows={2}
                                                        value={channel.semantic_filter?.criteria || ''}
                                                        onChange={(e) => updateSemanticFilter(index, 'criteria', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                        Similarity Threshold (0-1)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="1"
                                                        step="0.05"
                                                        placeholder="0.75"
                                                        value={channel.semantic_filter?.threshold || ''}
                                                        onChange={(e) => updateSemanticFilter(index, 'threshold', parseFloat(e.target.value))}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    />
                                                </div>
                                            </div>
                                        )}
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
                    </div>
                )}

                {/* Workflow & Scoring Tab */}
                {activeTab === 'workflow' && (
                    <div className="space-y-6">
                        {/* Information Sources */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Information Sources
                                </label>
                                <button
                                    type="button"
                                    onClick={addWorkflowSource}
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    Add Source
                                </button>
                            </div>

                            {form.workflow_config?.sources?.map((source, index) => (
                                <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                            Source {index + 1}
                                        </h4>
                                        {(form.workflow_config?.sources?.length || 0) > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeWorkflowSource(index)}
                                                className="text-red-600 dark:text-red-400 hover:text-red-700"
                                            >
                                                <TrashIcon className="h-5 w-5" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                Source ID
                                            </label>
                                            <select
                                                value={source.source_id}
                                                onChange={(e) => updateWorkflowSource(index, 'source_id', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                            >
                                                <option value="">Select a source...</option>
                                                {availableSources.map(src => (
                                                    <option key={src.source_id} value={src.source_id}>
                                                        {src.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex items-center">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={source.enabled}
                                                    onChange={(e) => updateWorkflowSource(index, 'enabled', e.target.checked)}
                                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    Enabled
                                                </span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Channel Queries */}
                                    <div className="mt-4 space-y-2">
                                        <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                            Channel Queries
                                        </h5>
                                        {source.channel_queries.map((cq, cqIndex) => (
                                            <div key={cqIndex} className="pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                    {cq.channel_name}
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Query expression for this channel"
                                                    value={cq.query_expression}
                                                    onChange={(e) => updateChannelQuery(index, cqIndex, e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Article Limit */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Article Limit per Week
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={form.workflow_config?.article_limit_per_week || 10}
                                onChange={(e) => setForm({
                                    ...form,
                                    workflow_config: {
                                        ...form.workflow_config,
                                        article_limit_per_week: parseInt(e.target.value)
                                    }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        {/* Scoring Configuration */}
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Scoring Configuration
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Relevance Weight (0-1)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={form.scoring_config?.relevance_weight || 0.6}
                                        onChange={(e) => setForm({
                                            ...form,
                                            scoring_config: {
                                                ...form.scoring_config!,
                                                relevance_weight: parseFloat(e.target.value)
                                            }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Weight for relevance to research programs (default: 0.6)
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Evidence Weight (0-1)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={form.scoring_config?.evidence_weight || 0.4}
                                        onChange={(e) => setForm({
                                            ...form,
                                            scoring_config: {
                                                ...form.scoring_config!,
                                                evidence_weight: parseFloat(e.target.value)
                                            }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Weight for evidence quality (default: 0.4)
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Inclusion Threshold (1-10)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        step="0.5"
                                        value={form.scoring_config?.inclusion_threshold || 7.0}
                                        onChange={(e) => setForm({
                                            ...form,
                                            scoring_config: {
                                                ...form.scoring_config!,
                                                inclusion_threshold: parseFloat(e.target.value)
                                            }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Minimum integrated score for inclusion (default: 7.0)
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Max Items per Report
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={form.scoring_config?.max_items_per_report || 10}
                                        onChange={(e) => setForm({
                                            ...form,
                                            scoring_config: {
                                                ...form.scoring_config!,
                                                max_items_per_report: parseInt(e.target.value)
                                            }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Maximum articles to include per report (default: 10)
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Form Actions */}
                <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
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
