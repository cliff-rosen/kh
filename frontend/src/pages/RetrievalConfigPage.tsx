import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ChevronRightIcon,
    ChevronDownIcon,
    PlusIcon,
    BeakerIcon,
    CheckCircleIcon,
    XCircleIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import {
    ResearchStream,
    Category,
    RetrievalConfig,
    WorkflowConfig,
    CategoryWorkflowConfig,
    SourceQuery,
    SemanticFilter,
    ScoringConfig,
    InformationSource
} from '../types';
import { Topic, SemanticSpace } from '../types/semantic-space';
import { CanonicalResearchArticle } from '../types/canonical_types';

export default function RetrievalConfigPage() {
    const { streamId } = useParams<{ streamId: string }>();
    const navigate = useNavigate();

    // State
    const [stream, setStream] = useState<ResearchStream | null>(null);
    const [semanticSpace, setSemanticSpace] = useState<SemanticSpace | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [retrievalConfig, setRetrievalConfig] = useState<RetrievalConfig | null>(null);
    const [sources, setSources] = useState<InformationSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // UI state
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Load stream data
    useEffect(() => {
        loadStreamData();
        loadSources();
    }, [streamId]);

    const loadStreamData = async () => {
        try {
            setLoading(true);
            const streamData = await researchStreamApi.getResearchStream(Number(streamId));
            setStream(streamData);
            setSemanticSpace(streamData.semantic_space);
            setCategories(streamData.presentation_config.categories);
            setRetrievalConfig(streamData.retrieval_config);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load stream');
        } finally {
            setLoading(false);
        }
    };

    const loadSources = async () => {
        try {
            const sourcesData = await researchStreamApi.getInformationSources();
            setSources(sourcesData);
        } catch (err) {
            console.error('Failed to load sources:', err);
        }
    };

    const toggleCategory = (categoryId: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryId)) {
            newExpanded.delete(categoryId);
        } else {
            newExpanded.add(categoryId);
        }
        setExpandedCategories(newExpanded);
    };

    const handleSave = async () => {
        if (!retrievalConfig || !streamId) return;

        try {
            setSaving(true);
            await researchStreamApi.updateResearchStream(Number(streamId), {
                retrieval_config: retrievalConfig
            });
            // Success notification
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (error || !stream || !semanticSpace) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">{error || 'Failed to load stream'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Retrieval Configuration
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">
                            Layer 2: Configure how to find and filter content for {stream.stream_name}
                        </p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Save Configuration'
                        )}
                    </button>
                </div>
            </div>

            {/* Three-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Column 1: Categories & Topics */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Categories & Topics
                        </h2>

                        <div className="space-y-2">
                            {categories.map((category) => {
                                const isExpanded = expandedCategories.has(category.id);
                                const categoryTopics = semanticSpace.topics.filter(t =>
                                    category.topics.includes(t.topic_id)
                                );

                                return (
                                    <div key={category.id} className="border border-gray-200 dark:border-gray-700 rounded-md">
                                        <button
                                            onClick={() => {
                                                toggleCategory(category.id);
                                                setSelectedCategory(category.id);
                                            }}
                                            className={`w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors ${
                                                selectedCategory === category.id
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600'
                                                    : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                {isExpanded ? (
                                                    <ChevronDownIcon className="h-4 w-4" />
                                                ) : (
                                                    <ChevronRightIcon className="h-4 w-4" />
                                                )}
                                                <span className="font-medium text-sm">{category.name}</span>
                                                <span className="text-xs text-gray-500">
                                                    ({categoryTopics.length} topics)
                                                </span>
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="px-3 py-2 space-y-1 bg-gray-50 dark:bg-gray-900/50">
                                                {categoryTopics.map((topic) => (
                                                    <div
                                                        key={topic.topic_id}
                                                        className="text-sm text-gray-700 dark:text-gray-300 pl-6 py-1"
                                                    >
                                                        • {topic.name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {categories.length === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                <p className="text-sm">No categories defined yet.</p>
                                <p className="text-xs mt-2">
                                    Configure categories in Layer 3 (Presentation Config)
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Quick Stats */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                            Configuration Status
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Topics</span>
                                <span className="font-medium">{semanticSpace.topics.length}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Categories</span>
                                <span className="font-medium">{categories.length}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Entities</span>
                                <span className="font-medium">{semanticSpace.entities.length}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 2 & 3: Configuration panels */}
                <div className="lg:col-span-2">
                    {selectedCategory ? (
                        <CategoryConfigPanel
                            category={categories.find(c => c.id === selectedCategory)!}
                            topics={semanticSpace.topics.filter(t =>
                                categories.find(c => c.id === selectedCategory)?.topics.includes(t.topic_id)
                            )}
                            semanticSpace={semanticSpace}
                            sources={sources}
                            streamId={Number(streamId)}
                            categoryConfig={retrievalConfig?.workflow.category_configs[selectedCategory]}
                            onUpdateConfig={(config) => {
                                if (!retrievalConfig) return;
                                const newConfigs = {
                                    ...retrievalConfig.workflow.category_configs,
                                    [selectedCategory]: config
                                };
                                setRetrievalConfig({
                                    ...retrievalConfig,
                                    workflow: {
                                        ...retrievalConfig.workflow,
                                        category_configs: newConfigs
                                    }
                                });
                            }}
                        />
                    ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
                            <BeakerIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Select a Category
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400">
                                Choose a category from the left to configure its retrieval workflow
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Scoring Configuration (bottom section) */}
            <div className="mt-8">
                <ScoringConfigPanel
                    scoringConfig={retrievalConfig?.scoring || {
                        relevance_weight: 0.6,
                        evidence_weight: 0.4,
                        inclusion_threshold: 7.0,
                        max_items_per_report: 10
                    }}
                    onUpdate={(config) => {
                        if (!retrievalConfig) return;
                        setRetrievalConfig({
                            ...retrievalConfig,
                            scoring: config
                        });
                    }}
                />
            </div>
        </div>
    );
}

// ============================================================================
// Category Configuration Panel
// ============================================================================

interface CategoryConfigPanelProps {
    category: Category;
    topics: Topic[];
    semanticSpace: SemanticSpace;
    sources: InformationSource[];
    streamId: number;
    categoryConfig?: CategoryWorkflowConfig;
    onUpdateConfig: (config: CategoryWorkflowConfig) => void;
}

function CategoryConfigPanel({
    category,
    topics,
    semanticSpace,
    sources,
    streamId,
    categoryConfig,
    onUpdateConfig
}: CategoryConfigPanelProps) {
    const [selectedSources, setSelectedSources] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'sources' | 'queries' | 'filter'>('sources');

    useEffect(() => {
        if (categoryConfig) {
            setSelectedSources(Object.keys(categoryConfig.source_queries));
        }
    }, [categoryConfig]);

    const handleSourceToggle = (sourceId: string) => {
        const newSelected = selectedSources.includes(sourceId)
            ? selectedSources.filter(s => s !== sourceId)
            : [...selectedSources, sourceId];
        setSelectedSources(newSelected);

        // Update config
        const newSourceQueries: Record<string, SourceQuery | null> = {};
        newSelected.forEach(sid => {
            newSourceQueries[sid] = categoryConfig?.source_queries[sid] || null;
        });

        onUpdateConfig({
            source_queries: newSourceQueries,
            semantic_filter: categoryConfig?.semantic_filter || {
                enabled: false,
                criteria: '',
                threshold: 0.7
            }
        });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {category.name}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {topics.length} topics • Configure source queries and semantic filtering
                </p>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex px-6">
                    <button
                        onClick={() => setActiveTab('sources')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'sources'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        1. Select Sources
                    </button>
                    <button
                        onClick={() => setActiveTab('queries')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'queries'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                        disabled={selectedSources.length === 0}
                    >
                        2. Generate Queries ({Object.keys(categoryConfig?.source_queries || {}).length} configured)
                    </button>
                    <button
                        onClick={() => setActiveTab('filter')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'filter'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        3. Semantic Filter
                    </button>
                </nav>
            </div>

            {/* Tab Content */}
            <div className="p-6">
                {activeTab === 'sources' && (
                    <SourceSelectionTab
                        sources={sources}
                        selectedSources={selectedSources}
                        onToggle={handleSourceToggle}
                    />
                )}

                {activeTab === 'queries' && (
                    <QueryGenerationTab
                        category={category}
                        topics={topics}
                        semanticSpace={semanticSpace}
                        selectedSources={selectedSources}
                        streamId={streamId}
                        categoryConfig={categoryConfig}
                        onUpdateConfig={onUpdateConfig}
                    />
                )}

                {activeTab === 'filter' && (
                    <SemanticFilterTab
                        category={category}
                        topics={topics}
                        semanticSpace={semanticSpace}
                        streamId={streamId}
                        filter={categoryConfig?.semantic_filter || { enabled: false, criteria: '', threshold: 0.7 }}
                        onUpdate={(filter) => {
                            onUpdateConfig({
                                source_queries: categoryConfig?.source_queries || {},
                                semantic_filter: filter
                            });
                        }}
                    />
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Source Selection Tab
// ============================================================================

interface SourceSelectionTabProps {
    sources: InformationSource[];
    selectedSources: string[];
    onToggle: (sourceId: string) => void;
}

function SourceSelectionTab({ sources, selectedSources, onToggle }: SourceSelectionTabProps) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Select the information sources you want to query for this category.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sources.map((source) => (
                    <label
                        key={source.source_id}
                        className="flex items-start gap-3 p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                        <input
                            type="checkbox"
                            checked={selectedSources.includes(source.source_id)}
                            onChange={() => onToggle(source.source_id)}
                            className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                            <div className="font-medium text-gray-900 dark:text-white">
                                {source.name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {source.description}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                Query syntax: {source.query_syntax}
                            </div>
                        </div>
                    </label>
                ))}
            </div>
        </div>
    );
}

// ============================================================================
// Query Generation Tab
// ============================================================================

interface QueryGenerationTabProps {
    category: Category;
    topics: Topic[];
    semanticSpace: SemanticSpace;
    selectedSources: string[];
    streamId: number;
    categoryConfig?: CategoryWorkflowConfig;
    onUpdateConfig: (config: CategoryWorkflowConfig) => void;
}

function QueryGenerationTab({
    category,
    topics,
    semanticSpace,
    selectedSources,
    streamId,
    categoryConfig,
    onUpdateConfig
}: QueryGenerationTabProps) {
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [generatingQueries, setGeneratingQueries] = useState<Set<string>>(new Set());
    const [testingQueries, setTestingQueries] = useState<Set<string>>(new Set());
    const [testResults, setTestResults] = useState<Record<string, any>>({});

    if (selectedSources.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p>Please select at least one source in the previous tab.</p>
            </div>
        );
    }

    const toggleTopic = (topicId: string) => {
        const newExpanded = new Set(expandedTopics);
        if (newExpanded.has(topicId)) {
            newExpanded.delete(topicId);
        } else {
            newExpanded.add(topicId);
        }
        setExpandedTopics(newExpanded);
    };

    const generateQuery = async (topicId: string, sourceId: string) => {
        const key = `${topicId}-${sourceId}`;
        setGeneratingQueries(new Set(generatingQueries).add(key));

        try {
            const response = await researchStreamApi.generateQueryForTopic(
                streamId,
                topicId,
                sourceId
            );

            // Update config with generated query
            const currentQuery = categoryConfig?.source_queries[sourceId];
            const updatedSourceQueries = {
                ...categoryConfig?.source_queries,
                [sourceId]: {
                    query_expression: response.query_expression,
                    enabled: currentQuery?.enabled ?? true
                }
            };

            onUpdateConfig({
                source_queries: updatedSourceQueries,
                semantic_filter: categoryConfig?.semantic_filter || {
                    enabled: false,
                    criteria: '',
                    threshold: 0.7
                }
            });
        } catch (err) {
            console.error('Failed to generate query:', err);
            alert('Failed to generate query. Please try again.');
        } finally {
            const newGenerating = new Set(generatingQueries);
            newGenerating.delete(key);
            setGeneratingQueries(newGenerating);
        }
    };

    const testQuery = async (sourceId: string, queryExpression: string) => {
        const key = sourceId;
        setTestingQueries(new Set(testingQueries).add(key));

        try {
            const response = await researchStreamApi.testQueryForTopic(streamId, {
                source_id: sourceId,
                query_expression: queryExpression,
                max_results: 10
            });

            setTestResults({
                ...testResults,
                [key]: response
            });
        } catch (err) {
            console.error('Failed to test query:', err);
            setTestResults({
                ...testResults,
                [key]: { success: false, error_message: 'Test failed' }
            });
        } finally {
            const newTesting = new Set(testingQueries);
            newTesting.delete(key);
            setTestingQueries(newTesting);
        }
    };

    const updateQueryExpression = (sourceId: string, queryExpression: string) => {
        const updatedSourceQueries = {
            ...categoryConfig?.source_queries,
            [sourceId]: {
                query_expression: queryExpression,
                enabled: categoryConfig?.source_queries[sourceId]?.enabled ?? true
            }
        };

        onUpdateConfig({
            source_queries: updatedSourceQueries,
            semantic_filter: categoryConfig?.semantic_filter || {
                enabled: false,
                criteria: '',
                threshold: 0.7
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    For each topic, generate queries for the selected sources. Topics are grouped by source for easier management.
                </p>
            </div>

            {/* Group by Source */}
            <div className="space-y-4">
                {selectedSources.map((sourceId) => {
                    const sourceQuery = categoryConfig?.source_queries[sourceId];
                    const hasQuery = sourceQuery && sourceQuery.query_expression;
                    const testResult = testResults[sourceId];

                    return (
                        <div key={sourceId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                        {sourceId.toUpperCase()}
                                    </h3>
                                    {hasQuery && (
                                        <CheckCircleIcon className="h-5 w-5 text-green-600" />
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        // Generate query using first topic as representative
                                        if (topics.length > 0) {
                                            generateQuery(topics[0].topic_id, sourceId);
                                        }
                                    }}
                                    disabled={generatingQueries.has(`${topics[0]?.topic_id}-${sourceId}`)}
                                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {generatingQueries.has(`${topics[0]?.topic_id}-${sourceId}`) ? (
                                        <>
                                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        'Generate Query'
                                    )}
                                </button>
                            </div>

                            <div className="p-4 space-y-4">
                                {/* Query Expression */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Query Expression
                                    </label>
                                    <textarea
                                        value={sourceQuery?.query_expression || ''}
                                        onChange={(e) => updateQueryExpression(sourceId, e.target.value)}
                                        placeholder={`Enter ${sourceId} query expression...`}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                    />
                                </div>

                                {/* Test Button & Results */}
                                {hasQuery && (
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => testQuery(sourceId, sourceQuery.query_expression)}
                                            disabled={testingQueries.has(sourceId)}
                                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {testingQueries.has(sourceId) ? (
                                                <>
                                                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                    Testing...
                                                </>
                                            ) : (
                                                <>
                                                    <BeakerIcon className="h-4 w-4" />
                                                    Test Query
                                                </>
                                            )}
                                        </button>

                                        {testResult && (
                                            <div className={`p-3 rounded-md ${
                                                testResult.success
                                                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                                                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                            }`}>
                                                {testResult.success ? (
                                                    <div className="text-sm text-green-800 dark:text-green-200">
                                                        <div className="font-semibold mb-1">
                                                            ✓ Found {testResult.article_count} articles
                                                        </div>
                                                        {testResult.sample_articles && testResult.sample_articles.length > 0 && (
                                                            <div className="mt-2 space-y-1">
                                                                <div className="font-medium">Sample titles:</div>
                                                                {testResult.sample_articles.slice(0, 3).map((article: CanonicalResearchArticle, idx: number) => (
                                                                    <div key={idx} className="text-xs pl-2">
                                                                        • {article.title}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-red-800 dark:text-red-200">
                                                        ✗ {testResult.error_message || 'Test failed'}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Topics contributing to this query */}
                                <details className="text-sm">
                                    <summary className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                                        View topics in this category ({topics.length})
                                    </summary>
                                    <div className="mt-2 pl-4 space-y-1">
                                        {topics.map((topic) => (
                                            <div key={topic.topic_id} className="text-gray-700 dark:text-gray-300">
                                                • {topic.name}
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================================
// Semantic Filter Tab (placeholder - to be implemented)
// ============================================================================

interface SemanticFilterTabProps {
    category: Category;
    topics: Topic[];
    semanticSpace: SemanticSpace;
    streamId: number;
    filter: SemanticFilter;
    onUpdate: (filter: SemanticFilter) => void;
}

function SemanticFilterTab(props: SemanticFilterTabProps) {
    return (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>Semantic filter configuration UI coming soon...</p>
            <p className="text-sm mt-2">Will allow generating and testing semantic filters</p>
        </div>
    );
}

// ============================================================================
// Scoring Configuration Panel
// ============================================================================

interface ScoringConfigPanelProps {
    scoringConfig: ScoringConfig;
    onUpdate: (config: ScoringConfig) => void;
}

function ScoringConfigPanel({ scoringConfig, onUpdate }: ScoringConfigPanelProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {expanded ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                    ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                    )}
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Scoring Configuration
                    </h2>
                </div>
                <span className="text-sm text-gray-500">
                    Threshold: {scoringConfig.inclusion_threshold}/10
                </span>
            </button>

            {expanded && (
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Relevance Weight (0-1)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.1"
                                value={scoringConfig.relevance_weight}
                                onChange={(e) =>
                                    onUpdate({ ...scoringConfig, relevance_weight: parseFloat(e.target.value) })
                                }
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
                                value={scoringConfig.evidence_weight}
                                onChange={(e) =>
                                    onUpdate({ ...scoringConfig, evidence_weight: parseFloat(e.target.value) })
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Inclusion Threshold (0-10)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="10"
                                step="0.5"
                                value={scoringConfig.inclusion_threshold}
                                onChange={(e) =>
                                    onUpdate({ ...scoringConfig, inclusion_threshold: parseFloat(e.target.value) })
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Minimum integrated score for content inclusion
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Max Items Per Report
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={scoringConfig.max_items_per_report || 10}
                                onChange={(e) =>
                                    onUpdate({ ...scoringConfig, max_items_per_report: parseInt(e.target.value) })
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
