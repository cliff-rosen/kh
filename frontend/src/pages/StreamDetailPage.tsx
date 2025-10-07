import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResearchStream } from '../context/ResearchStreamContext';
import { StreamType, ReportFrequency, Channel, WorkflowConfig, ScoringConfig } from '../types';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

type TabType = 'stream' | 'workflow';

export default function StreamDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams, updateResearchStream, deleteResearchStream, isLoading, error, clearError, availableSources, loadAvailableSources } = useResearchStream();

    const [stream, setStream] = useState<any>(null);
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
        is_active: true,
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
        loadResearchStreams();
        loadAvailableSources();
    }, [loadResearchStreams, loadAvailableSources]);

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
                        keywords: [],
                        semantic_filter: {
                            enabled: false,
                            criteria: null,
                            threshold: null
                        }
                    }],
                    report_frequency: foundStream.report_frequency,
                    is_active: foundStream.is_active,
                    workflow_config: foundStream.workflow_config || {
                        sources: [],
                        article_limit_per_week: 10
                    },
                    scoring_config: foundStream.scoring_config || {
                        relevance_weight: 0.6,
                        evidence_weight: 0.4,
                        inclusion_threshold: 7.0,
                        max_items_per_report: 10
                    }
                });
            }
        }
    }, [id, researchStreams]);

    // Sync channel queries when channels change
    useEffect(() => {
        if (!form.workflow_config?.sources || form.workflow_config.sources.length === 0) {
            return;
        }

        const updatedSources = form.workflow_config.sources.map(source => {
            const existingQueriesMap = new Map(
                source.channel_queries.map(q => [q.channel_name, q.query_expression])
            );

            const updatedChannelQueries = form.channels.map(ch => ({
                channel_name: ch.name,
                query_expression: existingQueriesMap.get(ch.name) || ch.keywords.join(' OR ')
            }));

            return {
                ...source,
                channel_queries: updatedChannelQueries
            };
        });

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

    const updateWorkflowSource = (index: number, field: string, value: any) => {
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;

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
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Edit Research Stream
                    </h1>
                    <button
                        type="button"
                        onClick={() => navigate(`/streams/${id}/configure-implementation`)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
                    >
                        Configure Implementation
                    </button>
                </div>

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

                {/* Tabs */}
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            type="button"
                            onClick={() => setActiveTab('stream')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'stream'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                        >
                            Stream Configuration
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('workflow')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'workflow'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
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
                                        </div>

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

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Search Keywords *
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="e.g., melanocortin, MCR1, MCR4"
                                                value={channel.keywords.join(', ')}
                                                onChange={(e) => handleKeywordsChange(index, e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                required
                                            />
                                        </div>

                                        {/* Semantic Filter */}
                                        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <input
                                                    type="checkbox"
                                                    id={`semantic-${index}`}
                                                    checked={channel.semantic_filter?.enabled || false}
                                                    onChange={(e) => updateSemanticFilter(index, 'enabled', e.target.checked)}
                                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <label htmlFor={`semantic-${index}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    Enable Semantic Filtering
                                                </label>
                                            </div>
                                            {channel.semantic_filter?.enabled && (
                                                <div className="space-y-2 ml-6">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                            Filter Criteria
                                                        </label>
                                                        <textarea
                                                            rows={2}
                                                            value={channel.semantic_filter.criteria || ''}
                                                            onChange={(e) => updateSemanticFilter(index, 'criteria', e.target.value)}
                                                            placeholder="Describe what content should match semantically"
                                                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
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
                                                            step="0.1"
                                                            value={channel.semantic_filter.threshold || 0.7}
                                                            onChange={(e) => updateSemanticFilter(index, 'threshold', parseFloat(e.target.value))}
                                                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
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
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Inclusion Threshold (1-10)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="10"
                                            step="0.1"
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
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
