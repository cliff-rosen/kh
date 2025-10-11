import { useState, useEffect } from 'react';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useImplementationConfig } from '../../context/ImplementationConfigContext';

export default function SemanticFilterStep() {
    const {
        stream,
        currentChannel,
        currentChannelWorkflowConfig,
        currentStep,
        sampleArticles,
        generateFilter,
        updateFilterCriteria,
        updateFilterThreshold,
        testFilter,
        completeChannel
    } = useImplementationConfig();

    const filterConfig = currentChannelWorkflowConfig?.semantic_filter;

    const [isGenerating, setIsGenerating] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [editedCriteria, setEditedCriteria] = useState(filterConfig?.criteria || '');
    const [isEditing, setIsEditing] = useState(false);
    const [threshold, setThreshold] = useState(filterConfig?.threshold || 0.7);
    const [filterReasoning, setFilterReasoning] = useState<string>('');
    const [testResult, setTestResult] = useState<any>(null);

    useEffect(() => {
        setEditedCriteria(filterConfig?.criteria || '');
    }, [filterConfig?.criteria]);

    useEffect(() => {
        setThreshold(filterConfig?.threshold || 0.7);
    }, [filterConfig?.threshold]);

    const handleGenerateFilter = async () => {
        setIsGenerating(true);
        try {
            const result = await generateFilter();
            setEditedCriteria(result.filter_criteria);
            setFilterReasoning(result.reasoning);
        } catch (error) {
            console.error('Filter generation failed:', error);
            alert('Failed to generate filter. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleTestFilter = async () => {
        if (sampleArticles.length === 0) {
            alert('No sample articles available. Please test queries first.');
            return;
        }

        setIsTesting(true);
        try {
            // Save threshold before testing
            await handleSaveThreshold();

            const result = await testFilter(sampleArticles, editedCriteria, threshold);
            setTestResult(result);
        } catch (error) {
            console.error('Filter test failed:', error);
            alert('Failed to test filter. Please try again.');
        } finally {
            setIsTesting(false);
        }
    };

    const handleSaveEdit = async () => {
        await updateFilterCriteria(editedCriteria);
        setIsEditing(false);
    };

    const handleThresholdChange = (newThreshold: number) => {
        // Just update local state - save happens when user tests or completes
        setThreshold(newThreshold);
    };

    const handleSaveThreshold = async () => {
        await updateFilterThreshold(threshold);
    };

    if (!currentChannel) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Semantic Filter Configuration
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Create filtering criteria to automatically evaluate article relevance for this channel
                </p>
            </div>

            {/* Context Summary */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Channel Context
                </h3>
                <div className="text-sm space-y-1">
                    <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Stream:</span>{' '}
                        <span className="text-gray-900 dark:text-white">{stream?.stream_name || ''}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Purpose:</span>{' '}
                        <span className="text-gray-900 dark:text-white">{stream?.purpose || ''}</span>
                    </div>
                    <div className="border-t border-blue-200 dark:border-blue-700 pt-2 mt-2">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Channel:</span>{' '}
                        <span className="text-gray-900 dark:text-white">{currentChannel.name}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Focus:</span>{' '}
                        <span className="text-gray-900 dark:text-white">{currentChannel.focus}</span>
                    </div>
                </div>
            </div>

            {/* Filter Criteria Card */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Filter Criteria
                    </h3>
                    <div className="flex gap-2">
                        {/* Show Generate button only on config step */}
                        {currentStep === 'semantic_filter_config' && !isGenerating && (
                            <button
                                onClick={handleGenerateFilter}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                            >
                                Generate Filter
                            </button>
                        )}
                        {/* Show Edit/Regenerate only on testing step */}
                        {currentStep === 'semantic_filter_testing' && !isEditing && (
                            <>
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={handleGenerateFilter}
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

                {currentStep === 'semantic_filter_config' && !isGenerating ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Click "Generate Filter" to create semantic filtering criteria based on the channel context
                    </div>
                ) : isGenerating ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Generating filter...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {isEditing ? (
                            <div className="space-y-3">
                                <textarea
                                    value={editedCriteria}
                                    onChange={(e) => setEditedCriteria(e.target.value)}
                                    rows={6}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    placeholder="Enter filter criteria..."
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
                                            setEditedCriteria(filterConfig?.criteria || '');
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
                                    <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                                        {filterConfig?.criteria || 'No filter criteria generated yet'}
                                    </p>
                                </div>
                                {filterReasoning && (
                                    <div className="text-sm text-gray-600 dark:text-gray-400 italic">
                                        {filterReasoning}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Threshold Configuration */}
            {filterConfig?.criteria && !isEditing && (
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Confidence Threshold
                    </h3>
                    <div className="space-y-3">
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={threshold}
                                onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
                                className="flex-1"
                            />
                            <span className="text-lg font-semibold text-gray-900 dark:text-white min-w-[4rem] text-right">
                                {(threshold * 100).toFixed(0)}%
                            </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                            Articles with confidence scores below this threshold will be filtered out
                        </p>
                    </div>
                </div>
            )}

            {/* Test Filter Section */}
            {filterConfig?.criteria && !isEditing && (
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Test Filter
                            </h3>
                            <button
                                onClick={handleTestFilter}
                                disabled={isTesting || sampleArticles.length === 0}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {isTesting ? 'Testing...' : testResult ? 'Retest Filter' : 'Test Filter'}
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Testing with {sampleArticles.length} sample articles from query results
                        </p>
                    </div>

                    {isTesting ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Testing filter...</p>
                            </div>
                        </div>
                    ) : testResult ? (
                        <div className="space-y-4">
                            {/* Test Summary */}
                            <div className="grid grid-cols-3 gap-4">
                                {(() => {
                                    // Recalculate pass/fail counts based on current threshold
                                    const passCount = testResult.filtered_articles.filter((fa: any) => fa.confidence >= threshold).length;
                                    const failCount = testResult.filtered_articles.length - passCount;

                                    return (
                                        <>
                                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                                    {passCount}
                                                </div>
                                                <div className="text-sm text-gray-600 dark:text-gray-400">Passed</div>
                                            </div>
                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                                    {failCount}
                                                </div>
                                                <div className="text-sm text-gray-600 dark:text-gray-400">Filtered</div>
                                            </div>
                                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                                    {(testResult.average_confidence * 100).toFixed(0)}%
                                                </div>
                                                <div className="text-sm text-gray-600 dark:text-gray-400">Avg Confidence</div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Sample Filtered Articles */}
                            {testResult.filtered_articles.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Sample Results (showing first 5)
                                    </h4>
                                    <div className="space-y-2">
                                        {testResult.filtered_articles.slice(0, 5).map((fa: any, idx: number) => {
                                            const passesThreshold = fa.confidence >= threshold;
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`rounded-lg p-3 border ${passesThreshold
                                                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                                        }`}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        {passesThreshold ? (
                                                            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                                                        ) : (
                                                            <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                                                {fa.article.title}
                                                            </h5>
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <span className={`font-medium ${passesThreshold
                                                                    ? 'text-green-700 dark:text-green-300'
                                                                    : 'text-red-700 dark:text-red-300'
                                                                    }`}>
                                                                    {(fa.confidence * 100).toFixed(0)}% confidence
                                                                </span>
                                                                {fa.reasoning && (
                                                                    <span className="text-gray-600 dark:text-gray-400">
                                                                        • {fa.reasoning}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            Click "Test Filter" to see how it performs on sample articles
                        </div>
                    )}
                </div>
            )}

            {/* Complete Channel Button - only show on testing step */}
            {currentStep === 'semantic_filter_testing' && filterConfig?.criteria && (
                <div className="flex justify-end">
                    <button
                        onClick={completeChannel}
                        className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                    >
                        Accept and Complete Channel
                    </button>
                </div>
            )}
        </div>
    );
}
