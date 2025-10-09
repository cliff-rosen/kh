import { useState, useEffect } from 'react';
import { useImplementationConfig } from '../../context/ImplementationConfigContext';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon, PencilIcon } from '@heroicons/react/24/outline';

export default function QueryConfigStep() {
    const {
        streamName,
        stream,
        currentChannel,
        currentChannelConfig,
        availableSources,
        generateQuery,
        updateQuery,
        testQuery,
        confirmQuery,
        nextSource,
        updateStream,
        updateChannel
    } = useImplementationConfig();

    // Get current source information
    const currentSourceId = currentChannelConfig?.selected_sources[currentChannelConfig.current_source_index];
    const currentSource = availableSources?.find(s => s.source_id === currentSourceId);
    const sourceConfig = currentSourceId ? currentChannelConfig?.source_configs.get(currentSourceId) : undefined;

    // Check if this is the last source
    const isLastSource = currentChannelConfig ? currentChannelConfig.current_source_index === currentChannelConfig.selected_sources.length - 1 : false;

    const [isGenerating, setIsGenerating] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [editedQuery, setEditedQuery] = useState(sourceConfig?.query_expression || '');
    const [isEditing, setIsEditing] = useState(false);
    const [isEditingContext, setIsEditingContext] = useState(false);
    const [contextEdits, setContextEdits] = useState({
        stream_name: streamName || '',
        stream_purpose: stream?.purpose || '',
        channel_name: currentChannel?.name || '',
        channel_focus: currentChannel?.focus || '',
        channel_keywords: currentChannel?.keywords.join(', ') || ''
    });

    // Date range state (default to last 7 days for PubMed)
    const getDefaultDateRange = () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    };

    const [dateRange, setDateRange] = useState(getDefaultDateRange());

    useEffect(() => {
        if (sourceConfig) {
            setEditedQuery(sourceConfig.query_expression);
        }
    }, [sourceConfig?.query_expression]);

    useEffect(() => {
        if (currentChannel) {
            setContextEdits({
                stream_name: streamName || '',
                stream_purpose: stream?.purpose || '',
                channel_name: currentChannel.name,
                channel_focus: currentChannel.focus,
                channel_keywords: currentChannel.keywords.join(', ')
            });
        }
    }, [streamName, stream?.purpose, currentChannel]);

    // Return null if required data is not available (after all hooks)
    if (!currentChannel || !currentChannelConfig || !currentSource || !sourceConfig) {
        return null;
    }

    const handleGenerateQuery = async () => {
        setIsGenerating(true);
        try {
            await generateQuery(currentChannel.name, currentSource.source_id);
        } catch (error) {
            console.error('Query generation failed:', error);
            alert('Failed to generate query. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleTestQuery = async () => {
        setIsTesting(true);
        try {
            const testRequest: any = {
                source_id: currentSource.source_id,
                query_expression: editedQuery,
                max_results: 10
            };

            // Add date range for PubMed
            if (currentSource.source_id === 'pubmed') {
                testRequest.start_date = dateRange.start;
                testRequest.end_date = dateRange.end;
                testRequest.date_type = 'entrez';
            }

            await testQuery(currentChannel.name, currentSource.source_id, testRequest);
        } catch (error) {
            console.error('Query test failed:', error);
            alert('Failed to test query. Please try again.');
        } finally {
            setIsTesting(false);
        }
    };

    const handleSaveEdit = () => {
        updateQuery(currentChannel.name, currentSource.source_id, editedQuery);
        setIsEditing(false);
    };

    const handleConfirmAndContinue = () => {
        confirmQuery(currentChannel.name, currentSource.source_id);
        // Always call nextSource - it will handle moving to next source or to semantic filter
        nextSource(currentChannel.name);
    };

    const handleSaveContextEdits = async () => {
        // Save stream updates
        if (contextEdits.stream_name !== streamName ||
            contextEdits.stream_purpose !== stream?.purpose
        ) {
            await updateStream({
                stream_name: contextEdits.stream_name,
                purpose: contextEdits.stream_purpose
            });
        }

        // Save channel updates
        if (contextEdits.channel_name !== currentChannel.name ||
            contextEdits.channel_focus !== currentChannel.focus ||
            contextEdits.channel_keywords !== currentChannel.keywords.join(', ')
        ) {
            await updateChannel(currentChannel.name, {
                name: contextEdits.channel_name,
                focus: contextEdits.channel_focus,
                keywords: contextEdits.channel_keywords.split(',').map(k => k.trim()).filter(k => k)
            });
        }

        setIsEditingContext(false);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Configure Query for {currentSource.name}
                    </h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        Channel: {contextEdits.channel_name}
                    </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Review the context below, then generate a query expression for this source.
                </p>
            </div>

            {/* Context Card - Stream & Channel Info */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Query Generation Context
                    </h3>
                    {!isEditingContext && !sourceConfig.query_expression && (
                        <button
                            onClick={() => setIsEditingContext(true)}
                            className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            <PencilIcon className="h-4 w-4" />
                            Edit Context
                        </button>
                    )}
                </div>

                {isEditingContext ? (
                    <div className="space-y-4">
                        {/* Stream Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Stream Name
                            </label>
                            <input
                                type="text"
                                value={contextEdits.stream_name}
                                onChange={(e) => setContextEdits({ ...contextEdits, stream_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        {/* Stream Purpose */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Stream Purpose
                            </label>
                            <textarea
                                value={contextEdits.stream_purpose}
                                onChange={(e) => setContextEdits({ ...contextEdits, stream_purpose: e.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        {/* Channel Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Channel Name
                            </label>
                            <input
                                type="text"
                                value={contextEdits.channel_name}
                                onChange={(e) => setContextEdits({ ...contextEdits, channel_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        {/* Channel Focus */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Channel Focus
                            </label>
                            <textarea
                                value={contextEdits.channel_focus}
                                onChange={(e) => setContextEdits({ ...contextEdits, channel_focus: e.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        {/* Channel Keywords */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Channel Keywords (comma-separated)
                            </label>
                            <textarea
                                value={contextEdits.channel_keywords}
                                onChange={(e) => setContextEdits({ ...contextEdits, channel_keywords: e.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                placeholder="keyword1, keyword2, keyword3"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleSaveContextEdits}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                            >
                                Save Changes
                            </button>
                            <button
                                onClick={() => {
                                    setContextEdits({
                                        stream_name: streamName || '',
                                        stream_purpose: stream?.purpose || '',
                                        channel_name: currentChannel.name,
                                        channel_focus: currentChannel.focus,
                                        channel_keywords: currentChannel.keywords.join(', ')
                                    });
                                    setIsEditingContext(false);
                                }}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 text-sm">
                        <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Stream:</span>{' '}
                            <span className="text-gray-900 dark:text-white">{contextEdits.stream_name}</span>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Purpose:</span>{' '}
                            <span className="text-gray-900 dark:text-white">{contextEdits.stream_purpose}</span>
                        </div>
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Channel:</span>{' '}
                            <span className="text-gray-900 dark:text-white">{contextEdits.channel_name}</span>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Focus:</span>{' '}
                            <span className="text-gray-900 dark:text-white">{contextEdits.channel_focus}</span>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Keywords:</span>{' '}
                            <span className="text-gray-900 dark:text-white">{contextEdits.channel_keywords}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Query Expression Card */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Query Expression
                    </h3>
                    <div className="flex gap-2">
                        {!sourceConfig.query_expression && !isGenerating && (
                            <button
                                onClick={handleGenerateQuery}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                            >
                                Generate Query
                            </button>
                        )}
                        {sourceConfig.query_expression && !isEditing && (
                            <>
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={handleGenerateQuery}
                                    disabled={isGenerating}
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                                >
                                    <ArrowPathIcon className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                                    Regenerate
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {!sourceConfig.query_expression && !isGenerating ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Click "Generate Query" to create a query expression based on the context above
                    </div>
                ) : isGenerating ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Generating query...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {isEditing ? (
                            <div className="space-y-3">
                                <textarea
                                    value={editedQuery}
                                    onChange={(e) => setEditedQuery(e.target.value)}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                    placeholder="Enter query expression..."
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveEdit}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                                    >
                                        Save Changes
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditedQuery(sourceConfig.query_expression);
                                            setIsEditing(false);
                                        }}
                                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-3">
                                    <code className="text-sm text-gray-900 dark:text-white break-all">
                                        {sourceConfig.query_expression || 'No query generated yet'}
                                    </code>
                                </div>
                                {sourceConfig.query_reasoning && (
                                    <div className="text-sm text-gray-600 dark:text-gray-400 italic">
                                        {sourceConfig.query_reasoning}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Test Query Section */}
            {sourceConfig.query_expression && !isEditing && (
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Test Results
                        </h3>

                        {/* Date Range Filter (PubMed only) */}
                        {currentSource.source_id === 'pubmed' && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Start Date
                                        </label>
                                        <input
                                            type="date"
                                            value={dateRange.start}
                                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            End Date
                                        </label>
                                        <input
                                            type="date"
                                            value={dateRange.end}
                                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />
                                    </div>
                                    <div className="pt-5">
                                        <button
                                            onClick={() => setDateRange(getDefaultDateRange())}
                                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                                        >
                                            Reset to 7 days
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                                    Testing will be limited to articles in this date range. Default is last 7 days.
                                </p>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={handleTestQuery}
                                disabled={isTesting}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {isTesting ? 'Testing...' : sourceConfig.is_tested ? 'Retest Query' : 'Test Query'}
                            </button>
                        </div>
                    </div>

                    {isTesting ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Testing query...</p>
                            </div>
                        </div>
                    ) : sourceConfig.test_result ? (
                        <div className="space-y-4">
                            {/* Test Summary */}
                            <div className={`flex items-center gap-3 p-4 rounded-lg ${
                                sourceConfig.test_result.success
                                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                            }`}>
                                {sourceConfig.test_result.success ? (
                                    <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                                ) : (
                                    <XCircleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
                                )}
                                <div>
                                    <p className={`font-medium ${
                                        sourceConfig.test_result.success
                                            ? 'text-green-900 dark:text-green-100'
                                            : 'text-red-900 dark:text-red-100'
                                    }`}>
                                        {sourceConfig.test_result.success
                                            ? `Found ${sourceConfig.test_result.article_count} articles`
                                            : 'Query failed'
                                        }
                                    </p>
                                    {sourceConfig.test_result.error_message && (
                                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                                            {sourceConfig.test_result.error_message}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Sample Articles */}
                            {sourceConfig.test_result.success && sourceConfig.test_result.sample_articles.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Sample Articles (showing {sourceConfig.test_result.sample_articles.length})
                                    </h4>
                                    <div className="space-y-3">
                                        {sourceConfig.test_result.sample_articles.slice(0, 5).map((article: any, idx: number) => (
                                            <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                                <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                                    {article.title}
                                                </h5>
                                                {article.abstract && (
                                                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                        {article.abstract}
                                                    </p>
                                                )}
                                                {article.authors && article.authors.length > 0 && (
                                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                        {article.authors.slice(0, 3).join(', ')}
                                                        {article.authors.length > 3 && ' et al.'}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            Click "Test Query" to see results
                        </div>
                    )}
                </div>
            )}

            {/* Action Buttons */}
            {sourceConfig.is_tested && (
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {sourceConfig.is_confirmed
                            ? '✓ Query confirmed and ready'
                            : 'Test looks good? Confirm to continue.'
                        }
                    </div>
                    <button
                        onClick={handleConfirmAndContinue}
                        className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                    >
                        {isLastSource ? 'Confirm & Continue to Filters' : 'Confirm & Next Source'}
                    </button>
                </div>
            )}
        </div>
    );
}
