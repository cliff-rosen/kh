import { useState, useEffect } from 'react';
import { SourceQueryConfig } from '../../types/implementation-config';
import { InformationSource, Channel } from '../../types/research-stream';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface QueryConfigStepProps {
    streamId: number;
    channel: Channel;
    source: InformationSource;
    sourceConfig: SourceQueryConfig;
    onQueryGenerated: (query: string, reasoning: string) => void;
    onQueryUpdated: (query: string) => void;
    onQueryTested: (result: any) => void;
    onQueryConfirmed: () => void;
    onNextSource: () => void;
    isLastSource: boolean;
}

export default function QueryConfigStep({
    streamId,
    channel,
    source,
    sourceConfig,
    onQueryGenerated,
    onQueryUpdated,
    onQueryTested,
    onQueryConfirmed,
    onNextSource,
    isLastSource
}: QueryConfigStepProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [editedQuery, setEditedQuery] = useState(sourceConfig.query_expression);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setEditedQuery(sourceConfig.query_expression);
    }, [sourceConfig.query_expression]);

    const handleGenerateQuery = async () => {
        setIsGenerating(true);
        try {
            const result = await researchStreamApi.generateChannelQuery(
                streamId,
                channel.name,
                { source_id: source.source_id }
            );
            onQueryGenerated(result.query_expression, result.reasoning);
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
            const result = await researchStreamApi.testChannelQuery(
                streamId,
                channel.name,
                {
                    source_id: source.source_id,
                    query_expression: editedQuery,
                    max_results: 10
                }
            );
            onQueryTested(result);
        } catch (error) {
            console.error('Query test failed:', error);
            alert('Failed to test query. Please try again.');
        } finally {
            setIsTesting(false);
        }
    };

    const handleSaveEdit = () => {
        onQueryUpdated(editedQuery);
        setIsEditing(false);
    };

    const handleConfirmAndContinue = () => {
        onQueryConfirmed();
        if (!isLastSource) {
            onNextSource();
        }
    };

    // Auto-generate on mount if no query exists
    useEffect(() => {
        if (!sourceConfig.query_expression && !isGenerating) {
            handleGenerateQuery();
        }
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Configure Query for {source.name}
                    </h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        Channel: {channel.name}
                    </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Generate and test a query expression for this source based on your channel's keywords and focus.
                </p>
            </div>

            {/* Query Expression Card */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Query Expression
                    </h3>
                    {sourceConfig.query_expression && !isEditing && (
                        <div className="flex gap-2">
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
                        </div>
                    )}
                </div>

                {isGenerating ? (
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
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Test Results
                        </h3>
                        <button
                            onClick={handleTestQuery}
                            disabled={isTesting}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {isTesting ? 'Testing...' : sourceConfig.is_tested ? 'Retest Query' : 'Test Query'}
                        </button>
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
                                        {sourceConfig.test_result.sample_articles.slice(0, 5).map((article, idx) => (
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
