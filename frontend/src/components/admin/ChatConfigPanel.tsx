import { useState, useEffect, useMemo } from 'react';
import {
    CubeIcon,
    WrenchScrewdriverIcon,
    DocumentTextIcon,
    GlobeAltIcon,
    TagIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    CheckCircleIcon,
    XCircleIcon,
    BeakerIcon,
    Squares2X2Icon,
    PencilSquareIcon,
    XMarkIcon,
    BookOpenIcon,
    ArrowPathIcon,
    UserIcon,
    UserGroupIcon,
    ShieldCheckIcon,
    EyeIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import { adminApi, type ChatConfigResponse, type PageConfigInfo, type SubTabConfigInfo, type HelpCategorySummary, type HelpCategoryDetail, type HelpTOCPreview, type StreamChatConfig, type PageChatConfig, type ToolInfo } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';

type ConfigTab = 'streams' | 'pages' | 'payloads' | 'tools' | 'help';

const configTabs: { id: ConfigTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'streams', label: 'Streams', icon: BeakerIcon },
    { id: 'pages', label: 'Pages', icon: DocumentTextIcon },
    { id: 'payloads', label: 'Payloads', icon: CubeIcon },
    { id: 'tools', label: 'Tools', icon: WrenchScrewdriverIcon },
    { id: 'help', label: 'Help', icon: BookOpenIcon },
];

// Help content types for editing state
interface EditingTopicContent {
    category: string;
    topic: string;
    content: string;
    originalContent: string;
    has_override: boolean;
}

export function ChatConfigPanel() {
    const [config, setConfig] = useState<ChatConfigResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ConfigTab>('streams');
    const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

    // Stream config editing state
    const [streamConfigs, setStreamConfigs] = useState<StreamChatConfig[]>([]);
    const [selectedStream, setSelectedStream] = useState<StreamChatConfig | null>(null);
    const [streamInstructions, setStreamInstructions] = useState<string>('');
    const [isLoadingStreams, setIsLoadingStreams] = useState(false);
    const [isSavingStream, setIsSavingStream] = useState(false);
    const [streamError, setStreamError] = useState<string | null>(null);

    // Page config editing state
    const [pageConfigs, setPageConfigs] = useState<PageChatConfig[]>([]);
    const [selectedPageConfig, setSelectedPageConfig] = useState<PageChatConfig | null>(null);
    const [editingContent, setEditingContent] = useState<string>('');
    const [isLoadingPages, setIsLoadingPages] = useState(false);
    const [isSavingPage, setIsSavingPage] = useState(false);
    const [pageError, setPageError] = useState<string | null>(null);

    // Tools state
    const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
    const selectedTool = useMemo<ToolInfo | null>(() => {
        if (!config || !selectedToolName) return null;
        return config.tools.find(t => t.name === selectedToolName) || null;
    }, [config, selectedToolName]);

    // Group tools by category
    const toolsByCategory = useMemo(() => {
        if (!config) return [];
        const groups: Record<string, ToolInfo[]> = {};
        for (const tool of config.tools) {
            const category = tool.category || 'other';
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(tool);
        }
        // Sort categories alphabetically, but put 'research' first as it's most common
        const categoryOrder: Record<string, number> = {
            'research': 0,
            'reports': 1,
            'analysis': 2,
        };
        return Object.entries(groups)
            .sort(([a], [b]) => {
                const orderA = categoryOrder[a] ?? 99;
                const orderB = categoryOrder[b] ?? 99;
                if (orderA !== orderB) return orderA - orderB;
                return a.localeCompare(b);
            })
            .map(([category, tools]) => ({
                category,
                tools: tools.sort((a, b) => a.name.localeCompare(b.name))
            }));
    }, [config]);

    // Help content state - category-based
    const [helpCategories, setHelpCategories] = useState<HelpCategorySummary[]>([]);
    const [helpTotalTopics, setHelpTotalTopics] = useState(0);
    const [helpTotalOverrides, setHelpTotalOverrides] = useState(0);
    const [selectedHelpCategory, setSelectedHelpCategory] = useState<HelpCategoryDetail | null>(null);
    const [editingTopics, setEditingTopics] = useState<EditingTopicContent[]>([]);
    const [tocPreviews, setTocPreviews] = useState<HelpTOCPreview[]>([]);
    const [isLoadingHelp, setIsLoadingHelp] = useState(false);
    const [isLoadingHelpCategory, setIsLoadingHelpCategory] = useState(false);
    const [isSavingHelp, setIsSavingHelp] = useState(false);
    const [isReloadingHelp, setIsReloadingHelp] = useState(false);
    const [helpError, setHelpError] = useState<string | null>(null);
    const [helpViewMode, setHelpViewMode] = useState<'categories' | 'toc-preview'>('categories');
    const [isHelpMaximized, setIsHelpMaximized] = useState(false);
    const [collapsedTopics, setCollapsedTopics] = useState<Set<string>>(new Set());

    // Check if any topics have been modified
    const hasHelpChanges = useMemo(() => {
        return editingTopics.some(t => t.content !== t.originalContent);
    }, [editingTopics]);

    // Get modified topics for save
    const modifiedTopics = useMemo(() => {
        return editingTopics.filter(t => t.content !== t.originalContent);
    }, [editingTopics]);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await adminApi.getChatConfig();
            setConfig(data);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const togglePage = (page: string) => {
        setExpandedPages(prev => {
            const next = new Set(prev);
            if (next.has(page)) {
                next.delete(page);
            } else {
                next.add(page);
            }
            return next;
        });
    };

    // Stream config functions
    const loadStreamConfigs = async () => {
        setIsLoadingStreams(true);
        setStreamError(null);
        try {
            const configs = await adminApi.getStreamConfigs();
            setStreamConfigs(configs);
        } catch (err) {
            setStreamError(handleApiError(err));
        } finally {
            setIsLoadingStreams(false);
        }
    };

    const openStreamConfig = (stream: StreamChatConfig) => {
        setSelectedStream(stream);
        setStreamInstructions(stream.content || '');
        setStreamError(null);
    };

    const closeStreamConfig = () => {
        setSelectedStream(null);
        setStreamInstructions('');
        setStreamError(null);
    };

    const saveStreamConfig = async () => {
        if (!selectedStream) return;

        setIsSavingStream(true);
        setStreamError(null);

        try {
            const trimmed = streamInstructions.trim();
            await adminApi.updateStreamConfig(
                selectedStream.stream_id,
                trimmed.length > 0 ? trimmed : null
            );

            await loadStreamConfigs();
            closeStreamConfig();
        } catch (err) {
            setStreamError(handleApiError(err));
        } finally {
            setIsSavingStream(false);
        }
    };

    // Page config functions
    const loadPageConfigs = async () => {
        setIsLoadingPages(true);
        setPageError(null);
        try {
            const configs = await adminApi.getPageConfigs();
            setPageConfigs(configs);
        } catch (err) {
            setPageError(handleApiError(err));
        } finally {
            setIsLoadingPages(false);
        }
    };

    const openPageConfig = (page: PageChatConfig) => {
        setSelectedPageConfig(page);
        // Only show the override value, not the effective value (default is shown separately)
        setEditingContent(page.has_override ? (page.content || '') : '');
        setPageError(null);
    };

    const closePageConfig = () => {
        setSelectedPageConfig(null);
        setEditingContent('');
        setPageError(null);
    };

    const savePageConfig = async () => {
        if (!selectedPageConfig) return;

        setIsSavingPage(true);
        setPageError(null);

        try {
            const trimmedContent = editingContent.trim();
            const updated = await adminApi.updatePageConfig(
                selectedPageConfig.page,
                {
                    content: trimmedContent.length > 0 ? trimmedContent : null,
                }
            );

            // Update state to reflect saved values (keep modal open)
            setSelectedPageConfig(updated);
            setEditingContent(updated.has_override ? (updated.content || '') : '');
            await loadPageConfigs();
        } catch (err) {
            setPageError(handleApiError(err));
        } finally {
            setIsSavingPage(false);
        }
    };

    const resetPageConfig = async () => {
        if (!selectedPageConfig || !selectedPageConfig.has_override) return;

        setIsSavingPage(true);
        setPageError(null);

        try {
            await adminApi.deletePageConfig(selectedPageConfig.page);
            await loadPageConfigs();
            closePageConfig();
        } catch (err) {
            setPageError(handleApiError(err));
        } finally {
            setIsSavingPage(false);
        }
    };

    // Help content functions
    const loadHelpCategories = async () => {
        setIsLoadingHelp(true);
        setHelpError(null);
        try {
            const [categoriesRes, tocRes] = await Promise.all([
                adminApi.getHelpCategories(),
                adminApi.getHelpTocPreview(),
            ]);
            setHelpCategories(categoriesRes.categories);
            setHelpTotalTopics(categoriesRes.total_topics);
            setHelpTotalOverrides(categoriesRes.total_overrides);
            setTocPreviews(tocRes);
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsLoadingHelp(false);
        }
    };

    const handleReloadHelp = async () => {
        setIsReloadingHelp(true);
        try {
            await adminApi.reloadHelpContent();
            await loadHelpCategories();
            // Clear selection if category no longer exists
            if (selectedHelpCategory) {
                setSelectedHelpCategory(null);
                setEditingTopics([]);
            }
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsReloadingHelp(false);
        }
    };

    const selectHelpCategory = async (category: string) => {
        setIsLoadingHelpCategory(true);
        setHelpError(null);
        try {
            const categoryDetail = await adminApi.getHelpCategory(category);
            setSelectedHelpCategory(categoryDetail);
            // Initialize editing state with current content
            setEditingTopics(categoryDetail.topics.map(t => ({
                category: t.category,
                topic: t.topic,
                content: t.content,
                originalContent: t.content,
                has_override: t.has_override,
            })));
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsLoadingHelpCategory(false);
        }
    };

    const updateTopicContent = (category: string, topic: string, content: string) => {
        setEditingTopics(prev => prev.map(t =>
            t.category === category && t.topic === topic ? { ...t, content } : t
        ));
    };

    const toggleTopicCollapse = (topicKey: string) => {
        setCollapsedTopics(prev => {
            const next = new Set(prev);
            if (next.has(topicKey)) {
                next.delete(topicKey);
            } else {
                next.add(topicKey);
            }
            return next;
        });
    };

    const closeHelpCategory = () => {
        setSelectedHelpCategory(null);
        setEditingTopics([]);
        setHelpError(null);
        setIsHelpMaximized(false);
        setCollapsedTopics(new Set());
    };

    const expandAllTopics = () => setCollapsedTopics(new Set());

    const collapseAllTopics = () => {
        if (!selectedHelpCategory) return;
        const allKeys = new Set(selectedHelpCategory.topics.map(t => `${t.category}/${t.topic}`));
        setCollapsedTopics(allKeys);
    };

    const saveHelpCategory = async () => {
        if (!selectedHelpCategory || modifiedTopics.length === 0) return;

        setIsSavingHelp(true);
        setHelpError(null);

        try {
            const updates = modifiedTopics.map(t => ({
                category: t.category,
                topic: t.topic,
                content: t.content,
            }));
            const updated = await adminApi.updateHelpCategory(selectedHelpCategory.category, updates);
            setSelectedHelpCategory(updated);
            // Reset editing state with new content
            setEditingTopics(updated.topics.map(t => ({
                category: t.category,
                topic: t.topic,
                content: t.content,
                originalContent: t.content,
                has_override: t.has_override,
            })));
            // Refresh the categories list to update override counts
            await loadHelpCategories();
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsSavingHelp(false);
        }
    };

    const resetHelpCategory = async () => {
        if (!selectedHelpCategory) return;
        const categoryHasOverrides = selectedHelpCategory.topics.some(t => t.has_override);
        if (!categoryHasOverrides) return;

        setIsSavingHelp(true);
        setHelpError(null);

        try {
            await adminApi.resetHelpCategory(selectedHelpCategory.category);
            // Reload the category to get default content
            await selectHelpCategory(selectedHelpCategory.category);
            // Refresh the categories list to update override counts
            await loadHelpCategories();
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsSavingHelp(false);
        }
    };

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'platform_admin':
                return <ShieldCheckIcon className="h-4 w-4" />;
            case 'org_admin':
                return <UserGroupIcon className="h-4 w-4" />;
            default:
                return <UserIcon className="h-4 w-4" />;
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'platform_admin':
                return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
            case 'org_admin':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
        }
    };

    // Load help categories when switching to help tab
    useEffect(() => {
        if (activeTab === 'help' && helpCategories.length === 0 && !isLoadingHelp) {
            loadHelpCategories();
        }
    }, [activeTab]);

    // Load stream configs when switching to streams tab
    useEffect(() => {
        if (activeTab === 'streams' && streamConfigs.length === 0 && !isLoadingStreams) {
            loadStreamConfigs();
        }
    }, [activeTab]);

    // Load page configs when switching to pages tab
    useEffect(() => {
        if (activeTab === 'pages' && pageConfigs.length === 0 && !isLoadingPages) {
            loadPageConfigs();
        }
    }, [activeTab]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                {error}
            </div>
        );
    }

    if (!config) return null;

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <SummaryCard
                    icon={CubeIcon}
                    label="Payload Types"
                    value={config.summary.total_payload_types}
                    details={`${config.summary.global_payloads} global, ${config.summary.llm_payloads} LLM, ${config.summary.tool_payloads} tool`}
                />
                <SummaryCard
                    icon={WrenchScrewdriverIcon}
                    label="Tools"
                    value={config.summary.total_tools}
                    details={`${config.summary.global_tools} global`}
                />
                <SummaryCard
                    icon={DocumentTextIcon}
                    label="Pages"
                    value={config.summary.total_pages}
                    details="Configured pages"
                />
                <SummaryCard
                    icon={BeakerIcon}
                    label="Stream Instructions"
                    value={config.summary.streams_with_instructions}
                    details={`of ${config.summary.total_streams} streams`}
                />
                <SummaryCard
                    icon={GlobeAltIcon}
                    label="Resolution"
                    value="global + page + tab + subtab"
                    details="+ stream instructions"
                    isText
                />
            </div>

            {/* Subtab Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8">
                    {configTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                                    ${isActive
                                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }
                                `}
                            >
                                <Icon className={`h-5 w-5 ${isActive ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Tab Content */}
            <div>
                {activeTab === 'pages' && (
                    <div className="space-y-3">
                        {isLoadingPages ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                            </div>
                        ) : pageError ? (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                {pageError}
                            </div>
                        ) : (
                            <>
                                {config.pages.map((page) => {
                                    const identityInfo = pageConfigs.find(i => i.page === page.page);
                                    return (
                                        <PageConfigCard
                                            key={page.page}
                                            page={page}
                                            isExpanded={expandedPages.has(page.page)}
                                            onToggle={() => togglePage(page.page)}
                                            identity={identityInfo}
                                            onEditIdentity={() => identityInfo && openPageConfig(identityInfo)}
                                        />
                                    );
                                })}
                                {config.pages.length === 0 && (
                                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                        No page configurations registered.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'payloads' && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Name
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Source
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Scope
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Parse Marker
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Parser
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Instructions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {config.payload_types.map((pt) => (
                                    <tr key={pt.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {pt.name}
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                                {pt.description}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                pt.source === 'llm'
                                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                            }`}>
                                                {pt.source}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {pt.is_global ? (
                                                <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                                                    <GlobeAltIcon className="h-4 w-4" />
                                                    Global
                                                </span>
                                            ) : (
                                                <span className="text-gray-500 dark:text-gray-400">Page-specific</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {pt.parse_marker ? (
                                                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                                                    {pt.parse_marker}
                                                </code>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <StatusIcon active={pt.has_parser} />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <StatusIcon active={pt.has_instructions} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'tools' && (
                    <div className="flex gap-6 h-[calc(100vh-16rem)]">
                        {/* Left column - Tools list */}
                        <div className="w-1/3 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                            <div className="flex-shrink-0 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Tools ({config.tools.length})
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {toolsByCategory.map(({ category, tools }) => (
                                    <div key={category}>
                                        {/* Category header */}
                                        <div className="sticky top-0 px-4 py-2 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                                {category}
                                            </span>
                                            <span className="ml-2 text-xs text-gray-400">
                                                ({tools.length})
                                            </span>
                                        </div>
                                        {/* Tools in category */}
                                        {tools.map((tool) => (
                                            <button
                                                key={tool.name}
                                                onClick={() => setSelectedToolName(tool.name)}
                                                className={`w-full text-left px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                                    selectedToolName === tool.name ? 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-l-purple-500' : ''
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                        {tool.name}
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        {tool.is_global && (
                                                            <GlobeAltIcon className="h-3.5 w-3.5 text-purple-500" title="Global" />
                                                        )}
                                                        {tool.streaming && (
                                                            <span className="text-xs text-blue-500" title="Streaming">S</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right column - Tool details */}
                        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                            {selectedTool ? (
                                <>
                                    {/* Header - Tool name */}
                                    <div className="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">
                                            {selectedTool.name}
                                        </h3>
                                    </div>

                                    <div className="flex-1 overflow-y-auto">
                                        {/* Metadata Grid - Always 4 columns, fixed positions */}
                                        <div className="grid grid-cols-4 border-b border-gray-200 dark:border-gray-700">
                                            {/* Category */}
                                            <div className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                                    Category
                                                </div>
                                                <div className="text-sm text-gray-900 dark:text-white">
                                                    {selectedTool.category}
                                                </div>
                                            </div>
                                            {/* Scope */}
                                            <div className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                                    Scope
                                                </div>
                                                <div className="text-sm">
                                                    {selectedTool.is_global ? (
                                                        <span className="text-purple-600 dark:text-purple-400">Global</span>
                                                    ) : (
                                                        <span className="text-gray-600 dark:text-gray-300">Page-specific</span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Streaming */}
                                            <div className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                                    Streaming
                                                </div>
                                                <div className="text-sm">
                                                    {selectedTool.streaming ? (
                                                        <span className="text-blue-600 dark:text-blue-400">Yes</span>
                                                    ) : (
                                                        <span className="text-gray-400">No</span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Payload Type */}
                                            <div className="px-4 py-3">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                                    Payload Type
                                                </div>
                                                <div className="text-sm">
                                                    {selectedTool.payload_type ? (
                                                        <code className="text-gray-900 dark:text-white">{selectedTool.payload_type}</code>
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Description - Fixed minimum height to keep Parameters stable */}
                                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 min-h-[120px]">
                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                                Description
                                            </div>
                                            <p className="text-sm text-gray-900 dark:text-white leading-relaxed">
                                                {selectedTool.description}
                                            </p>
                                        </div>

                                        {/* Parameters - Always visible */}
                                        <div className="px-6 py-4">
                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                                                Parameters
                                            </div>
                                            {selectedTool.input_schema?.properties && Object.keys(selectedTool.input_schema.properties).length > 0 ? (
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                            <th className="pb-2 pr-4">Name</th>
                                                            <th className="pb-2 pr-4">Type</th>
                                                            <th className="pb-2 pr-4">Required</th>
                                                            <th className="pb-2 pr-4">Default</th>
                                                            <th className="pb-2">Description</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                                        {Object.entries(selectedTool.input_schema.properties).map(([paramName, paramDef]) => {
                                                            const isRequired = selectedTool.input_schema?.required?.includes(paramName) ?? false;
                                                            return (
                                                                <tr key={paramName} className="align-top">
                                                                    <td className="py-2 pr-4">
                                                                        <code className="font-semibold text-purple-600 dark:text-purple-400">
                                                                            {paramName}
                                                                        </code>
                                                                    </td>
                                                                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">
                                                                        {paramDef.type}
                                                                        {paramDef.enum && (
                                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                                {paramDef.enum.map((val) => (
                                                                                    <code key={val} className="text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">
                                                                                        {val}
                                                                                    </code>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        {(paramDef.minimum !== undefined || paramDef.maximum !== undefined) && (
                                                                            <div className="text-xs text-gray-400 mt-0.5">
                                                                                {paramDef.minimum !== undefined && `min: ${paramDef.minimum}`}
                                                                                {paramDef.minimum !== undefined && paramDef.maximum !== undefined && ', '}
                                                                                {paramDef.maximum !== undefined && `max: ${paramDef.maximum}`}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2 pr-4">
                                                                        {isRequired ? (
                                                                            <span className="text-red-500">Yes</span>
                                                                        ) : (
                                                                            <span className="text-gray-400">No</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">
                                                                        {paramDef.default !== undefined ? (
                                                                            <code>{String(paramDef.default)}</code>
                                                                        ) : (
                                                                            <span className="text-gray-400">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2 text-gray-600 dark:text-gray-300">
                                                                        {paramDef.description || <span className="text-gray-400">—</span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <p className="text-sm text-gray-400 italic">
                                                    No parameters
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                                    <div className="text-center">
                                        <WrenchScrewdriverIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                        <p>Select a tool to view details</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'streams' && (
                    <div>
                        {isLoadingStreams ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                            </div>
                        ) : streamError ? (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                {streamError}
                            </div>
                        ) : (
                            <>
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-900">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    Stream
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    Has Instructions
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    Preview
                                                </th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {streamConfigs.map((stream) => (
                                                <tr key={stream.stream_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="font-medium text-gray-900 dark:text-white">
                                                            {stream.stream_name}
                                                        </div>
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            ID: {stream.stream_id}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <StatusIcon active={stream.has_override} />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {stream.content ? (
                                                            <div className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                                                                <pre className="whitespace-pre-wrap font-mono text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                                    {stream.content.length > 200
                                                                        ? stream.content.substring(0, 200) + '...'
                                                                        : stream.content}
                                                                </pre>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 text-sm">No instructions configured</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <button
                                                            onClick={() => openStreamConfig(stream)}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
                                                        >
                                                            <PencilSquareIcon className="h-4 w-4" />
                                                            Edit
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {streamConfigs.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                                        No research streams found.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                                    Stream instructions are included in the system prompt when chatting about reports from that stream.
                                    They guide the assistant on domain-specific terminology, classification rules, and analysis criteria.
                                </div>
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'help' && (
                    <div className="space-y-4">
                        {/* Help header with reload button */}
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                Help documentation shown to users via chat.
                                <span className="ml-2 text-gray-500">
                                    {helpTotalTopics} topics, {helpTotalOverrides} custom overrides
                                </span>
                            </div>
                            <button
                                onClick={handleReloadHelp}
                                disabled={isReloadingHelp}
                                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                                <ArrowPathIcon className={`h-4 w-4 ${isReloadingHelp ? 'animate-spin' : ''}`} />
                                Reload from Files
                            </button>
                        </div>

                        {helpError && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                                {helpError}
                            </div>
                        )}

                        {/* Help view mode tabs */}
                        <div className="border-b border-gray-200 dark:border-gray-700">
                            <nav className="flex gap-4">
                                <button
                                    onClick={() => setHelpViewMode('categories')}
                                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                                        helpViewMode === 'categories'
                                            ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <BookOpenIcon className="h-4 w-4" />
                                        Categories ({helpCategories.length})
                                    </div>
                                </button>
                                <button
                                    onClick={() => setHelpViewMode('toc-preview')}
                                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                                        helpViewMode === 'toc-preview'
                                            ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <EyeIcon className="h-4 w-4" />
                                        TOC by Role
                                    </div>
                                </button>
                            </nav>
                        </div>

                        {isLoadingHelp ? (
                            <div className="flex items-center justify-center py-12">
                                <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
                            </div>
                        ) : helpViewMode === 'categories' ? (
                            <div className="flex gap-6 h-[calc(100vh-20rem)]">
                                {/* Left column - Categories list */}
                                <div className="w-1/4 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                                    <div className="flex-shrink-0 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Help Categories
                                        </h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto">
                                        {helpCategories.map((cat) => (
                                            <button
                                                key={cat.category}
                                                onClick={() => selectHelpCategory(cat.category)}
                                                className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                                    selectedHelpCategory?.category === cat.category ? 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-l-purple-500' : ''
                                                }`}
                                            >
                                                <div className="font-medium text-gray-900 dark:text-white">
                                                    {cat.label}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                    <span>{cat.topic_count} topics</span>
                                                    {cat.override_count > 0 && (
                                                        <span className="inline-flex px-1.5 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                                            {cat.override_count} custom
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                        {helpCategories.length === 0 && (
                                            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                                                No help categories found.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right column - Category detail and editing */}
                                <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                                    {isLoadingHelpCategory ? (
                                        <div className="flex-1 flex items-center justify-center">
                                            <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
                                        </div>
                                    ) : selectedHelpCategory ? (
                                        <>
                                            {/* Header */}
                                            <div className="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                                        {selectedHelpCategory.label}
                                                    </h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {selectedHelpCategory.topics.length} topics
                                                        {selectedHelpCategory.topics.some(t => t.has_override) && (
                                                            <span className="ml-2">
                                                                ({selectedHelpCategory.topics.filter(t => t.has_override).length} with custom content)
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {selectedHelpCategory.topics.some(t => t.has_override) && (
                                                        <button
                                                            onClick={resetHelpCategory}
                                                            disabled={isSavingHelp}
                                                            className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                                                        >
                                                            Reset All to Defaults
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={saveHelpCategory}
                                                        disabled={isSavingHelp || !hasHelpChanges}
                                                        className="px-4 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                                                    >
                                                        {isSavingHelp ? 'Saving...' : `Save${modifiedTopics.length > 0 ? ` (${modifiedTopics.length})` : ''}`}
                                                    </button>
                                                    <button
                                                        onClick={() => setIsHelpMaximized(true)}
                                                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                                        title="Maximize editor"
                                                    >
                                                        <ArrowsPointingOutIcon className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Topics list */}
                                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                                {selectedHelpCategory.topics.map((topic) => {
                                                    const editingTopic = editingTopics.find(t => t.category === topic.category && t.topic === topic.topic);
                                                    const isModified = editingTopic && editingTopic.content !== editingTopic.originalContent;
                                                    return (
                                                        <div key={`${topic.category}/${topic.topic}`} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                                            {/* Topic header */}
                                                            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                                        {topic.title}
                                                                    </span>
                                                                    <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                                                        {topic.topic}
                                                                    </code>
                                                                    {topic.has_override && (
                                                                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                                                            Custom
                                                                        </span>
                                                                    )}
                                                                    {isModified && (
                                                                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                                            Modified
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {topic.roles.map((role) => (
                                                                        <span
                                                                            key={role}
                                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(role)}`}
                                                                        >
                                                                            {getRoleIcon(role)}
                                                                            {role}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            {/* Topic summary */}
                                                            <div className="px-4 py-2 bg-gray-25 dark:bg-gray-850 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                                                {topic.summary}
                                                            </div>
                                                            {/* Content editor */}
                                                            <div className="p-4">
                                                                <textarea
                                                                    value={editingTopic?.content || ''}
                                                                    onChange={(e) => updateTopicContent(topic.category, topic.topic, e.target.value)}
                                                                    placeholder="Enter help content in markdown..."
                                                                    className="w-full h-48 min-h-[8rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y font-mono text-sm"
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                                            <div className="text-center">
                                                <BookOpenIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                                <p>Select a category to view and edit help topics</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {tocPreviews.map((preview) => (
                                    <div key={preview.role} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            {getRoleIcon(preview.role)}
                                            <span className={`font-medium ${getRoleBadgeColor(preview.role)} px-2 py-0.5 rounded-full text-sm`}>
                                                {preview.role}
                                            </span>
                                        </div>
                                        <pre className="text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-3 rounded max-h-64 overflow-y-auto">
                                            {preview.toc || '(No sections visible to this role)'}
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Architecture Info */}
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <h3 className="font-medium text-purple-900 dark:text-purple-300 mb-2">
                    Chat System Architecture
                </h3>
                <div className="text-sm text-purple-700 dark:text-purple-400 space-y-2">
                    <p>
                        <strong>PayloadType</strong> and <strong>ToolConfig</strong> are definitions (single source of truth).
                        They don't know about pages - they just define what exists.
                    </p>
                    <p>
                        <strong>PageConfig</strong> references payloads and tools by name, with optional <strong>TabConfig</strong> and <strong>SubTabConfig</strong> for finer control.
                        The <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">is_global</code> flag determines default availability.
                    </p>
                    <p>
                        <strong>Stream Instructions</strong> are per-stream customizations stored in the database.
                        They're added to the system prompt when chatting about that stream's reports.
                    </p>
                    <p>
                        <strong>Resolution:</strong> Available = global + page + tab + subtab | System prompt = context + payload instructions + stream instructions
                    </p>
                </div>
            </div>

            {/* Stream Instructions Edit Modal - Full size for text editing */}
            {selectedStream && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)] flex flex-col">
                        {/* Header */}
                        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Edit Chat Instructions
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedStream.stream_name}
                                    {selectedStream.has_override && (
                                        <span className="ml-2 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                            Custom Override
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={closeStreamConfig}
                                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-h-0 flex flex-col p-6">
                            {streamError && (
                                <div className="flex-shrink-0 mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                    {streamError}
                                </div>
                            )}
                            <p className="flex-shrink-0 text-sm text-gray-600 dark:text-gray-400 mb-4">
                                These instructions are added to the system prompt when chatting about reports from this stream.
                                Use them to guide the assistant on domain-specific terminology, classification rules, and analysis criteria.
                            </p>
                            <textarea
                                value={streamInstructions}
                                onChange={(e) => setStreamInstructions(e.target.value)}
                                placeholder="Enter custom instructions for this stream..."
                                className="flex-1 min-h-0 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                            />
                        </div>

                        {/* Footer */}
                        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
                            <button
                                onClick={closeStreamConfig}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveStreamConfig}
                                disabled={isSavingStream}
                                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                            >
                                {isSavingStream ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Page Config Edit Modal - Full size for text editing */}
            {selectedPageConfig && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)] flex flex-col">
                        {/* Header */}
                        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Edit Page Persona
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedPageConfig.page}
                                    {selectedPageConfig.has_override && (
                                        <span className="ml-2 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                            Custom Persona
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={closePageConfig}
                                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-h-0 flex flex-col p-6">
                            {pageError && (
                                <div className="flex-shrink-0 mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                    {pageError}
                                </div>
                            )}

                            <p className="flex-shrink-0 text-sm text-gray-600 dark:text-gray-400 mb-4">
                                The persona defines who the assistant is and how it behaves on this page.
                                It appears at the start of the system prompt and sets the tone for all interactions.
                            </p>

                            {/* Default section */}
                            <div className="flex-shrink-0 mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                    Default Persona ({selectedPageConfig.default_is_global ? 'global' : 'page-specific'})
                                </p>
                                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto">
                                    {selectedPageConfig.default_content}
                                </pre>
                            </div>

                            {/* Cheat sheet */}
                            <div className="flex-shrink-0 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">
                                    Suggested sections for persona:
                                </p>
                                <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                                    <p><strong>## Role</strong> - Who the assistant is and what it specializes in</p>
                                    <p><strong>## Style</strong> - Tone, length, formatting preferences</p>
                                    <p><strong>## Handling Ambiguity</strong> - How to handle unclear queries</p>
                                    <p><strong>## Constraints</strong> - What to avoid or never do</p>
                                </div>
                            </div>

                            {/* Override section */}
                            <label className="flex-shrink-0 block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Override {selectedPageConfig.has_override && <span className="text-purple-600 dark:text-purple-400">(active)</span>}
                            </label>
                            <textarea
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                placeholder="Leave empty to use the default, or enter a custom persona..."
                                className="flex-1 min-h-0 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                            />
                        </div>

                        {/* Footer */}
                        {(() => {
                            // Compute if there are unsaved changes
                            const savedContent = selectedPageConfig.has_override ? (selectedPageConfig.content || '') : '';
                            const hasChanges = editingContent !== savedContent;

                            return (
                                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    <div>
                                        {selectedPageConfig.has_override && (
                                            <button
                                                onClick={resetPageConfig}
                                                disabled={isSavingPage}
                                                className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                Reset to Default
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={savePageConfig}
                                            disabled={isSavingPage || !hasChanges}
                                            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                                        >
                                            {isSavingPage ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                            onClick={closePageConfig}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            {hasChanges ? 'Cancel' : 'Close'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Help Content Maximized Editor Modal */}
            {isHelpMaximized && selectedHelpCategory && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)] flex flex-col">
                        {/* Header */}
                        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Edit Help Content: {selectedHelpCategory.label}
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedHelpCategory.topics.length} topics
                                    {selectedHelpCategory.topics.some(t => t.has_override) && (
                                        <span className="ml-2">
                                            ({selectedHelpCategory.topics.filter(t => t.has_override).length} with custom content)
                                        </span>
                                    )}
                                    {modifiedTopics.length > 0 && (
                                        <span className="ml-2 text-amber-600 dark:text-amber-400">
                                            • {modifiedTopics.length} unsaved changes
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={expandAllTopics}
                                    className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                >
                                    Expand All
                                </button>
                                <button
                                    onClick={collapseAllTopics}
                                    className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                >
                                    Collapse All
                                </button>
                                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
                                {selectedHelpCategory.topics.some(t => t.has_override) && (
                                    <button
                                        onClick={resetHelpCategory}
                                        disabled={isSavingHelp}
                                        className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                                    >
                                        Reset All to Defaults
                                    </button>
                                )}
                                <button
                                    onClick={saveHelpCategory}
                                    disabled={isSavingHelp || !hasHelpChanges}
                                    className="px-4 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                                >
                                    {isSavingHelp ? 'Saving...' : `Save${modifiedTopics.length > 0 ? ` (${modifiedTopics.length})` : ''}`}
                                </button>
                                <button
                                    onClick={() => setIsHelpMaximized(false)}
                                    className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                    title="Minimize editor"
                                >
                                    <ArrowsPointingInIcon className="h-5 w-5" />
                                </button>
                                <button
                                    onClick={closeHelpCategory}
                                    className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                                >
                                    <XMarkIcon className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        {/* Content - Topics List */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                            {selectedHelpCategory.topics.map((topic) => {
                                const topicKey = `${topic.category}/${topic.topic}`;
                                const editingTopic = editingTopics.find(t => t.category === topic.category && t.topic === topic.topic);
                                const isModified = editingTopic && editingTopic.content !== editingTopic.originalContent;
                                const isCollapsed = collapsedTopics.has(topicKey);

                                return (
                                    <div key={topicKey} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                        {/* Topic header - clickable to collapse/expand */}
                                        <button
                                            onClick={() => toggleTopicCollapse(topicKey)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                {isCollapsed ? (
                                                    <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                                                ) : (
                                                    <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                                                )}
                                                <span className="font-medium text-gray-900 dark:text-white">
                                                    {topic.title}
                                                </span>
                                                <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                                    {topic.topic}
                                                </code>
                                                {topic.has_override && (
                                                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                                        Custom
                                                    </span>
                                                )}
                                                {isModified && (
                                                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                        Modified
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {topic.roles.map((role) => (
                                                    <span
                                                        key={role}
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(role)}`}
                                                    >
                                                        {getRoleIcon(role)}
                                                        {role}
                                                    </span>
                                                ))}
                                            </div>
                                        </button>

                                        {/* Collapsible content */}
                                        {!isCollapsed && (
                                            <>
                                                {/* Topic summary */}
                                                <div className="px-4 py-2 bg-gray-25 dark:bg-gray-850 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                                    {topic.summary}
                                                </div>
                                                {/* Content editor */}
                                                <div className="p-4">
                                                    <textarea
                                                        value={editingTopic?.content || ''}
                                                        onChange={(e) => updateTopicContent(topic.category, topic.topic, e.target.value)}
                                                        placeholder="Enter help content in markdown..."
                                                        className="w-full h-64 min-h-[10rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y font-mono text-sm"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper Components

function SummaryCard({ icon: Icon, label, value, details, isText = false }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | number;
    details: string;
    isText?: boolean;
}) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Icon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
                    <div className={`font-semibold text-gray-900 dark:text-white ${isText ? 'text-sm' : 'text-2xl'}`}>
                        {value}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{details}</div>
                </div>
            </div>
        </div>
    );
}

function StatusIcon({ active }: { active: boolean }) {
    return active ? (
        <CheckCircleIcon className="h-5 w-5 text-green-500" />
    ) : (
        <XCircleIcon className="h-5 w-5 text-gray-300 dark:text-gray-600" />
    );
}

function SubTabConfigDisplay({ subtabName, config }: { subtabName: string; config: SubTabConfigInfo }) {
    const hasContent = config.payloads.length > 0 || config.tools.length > 0;

    return (
        <div className="ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
            <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
                <Squares2X2Icon className="h-3 w-3" />
                Subtab: {subtabName}
            </h5>
            {hasContent ? (
                <div className="flex flex-wrap gap-2">
                    {config.payloads.map(p => (
                        <span key={p} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            <CubeIcon className="h-3 w-3" />
                            {p}
                        </span>
                    ))}
                    {config.tools.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            <WrenchScrewdriverIcon className="h-3 w-3" />
                            {t}
                        </span>
                    ))}
                </div>
            ) : (
                <span className="text-xs text-gray-400">No subtab-specific payloads or tools</span>
            )}
        </div>
    );
}

function PageConfigCard({ page, isExpanded, onToggle, identity, onEditIdentity }: {
    page: PageConfigInfo;
    isExpanded: boolean;
    onToggle: () => void;
    identity?: PageChatConfig;
    onEditIdentity?: () => void;
}) {
    const tabCount = Object.keys(page.tabs).length;
    const subtabCount = Object.values(page.tabs).reduce(
        (sum, tab) => sum + Object.keys(tab.subtabs || {}).length,
        0
    );

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <button
                    onClick={onToggle}
                    className="flex items-center gap-3 flex-1 text-left"
                >
                    {isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                    )}
                    <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                            {page.page}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {tabCount > 0 ? `${tabCount} tabs` : 'No tabs'}
                            {subtabCount > 0 ? `, ${subtabCount} subtabs` : ''} |
                            {page.payloads.length} page payloads |
                            {page.tools.length} page tools
                        </div>
                    </div>
                </button>
                <div className="flex items-center gap-2">
                    {page.has_context_builder && (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Context Builder
                        </span>
                    )}
                    {identity?.has_override && (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            Custom Persona
                        </span>
                    )}
                    {onEditIdentity && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEditIdentity(); }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                        >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                            Edit
                        </button>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-4">
                    {/* Page-wide config */}
                    {(page.payloads.length > 0 || page.tools.length > 0) && (
                        <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Page-wide (available on all tabs)
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {page.payloads.map(p => (
                                    <span key={p} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                        <CubeIcon className="h-3 w-3" />
                                        {p}
                                    </span>
                                ))}
                                {page.tools.map(t => (
                                    <span key={t} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                        <WrenchScrewdriverIcon className="h-3 w-3" />
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tabs */}
                    {Object.entries(page.tabs).map(([tabName, tabConfig]) => (
                        <div key={tabName} className="space-y-2">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <TagIcon className="h-4 w-4" />
                                Tab: {tabName}
                            </h4>
                            {(tabConfig.payloads.length > 0 || tabConfig.tools.length > 0) && (
                                <div className="flex flex-wrap gap-2">
                                    {tabConfig.payloads.map(p => (
                                        <span key={p} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                            <CubeIcon className="h-3 w-3" />
                                            {p}
                                        </span>
                                    ))}
                                    {tabConfig.tools.map(t => (
                                        <span key={t} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                            <WrenchScrewdriverIcon className="h-3 w-3" />
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {tabConfig.payloads.length === 0 && tabConfig.tools.length === 0 && Object.keys(tabConfig.subtabs || {}).length === 0 && (
                                <span className="text-xs text-gray-400 ml-6">No tab-specific payloads or tools</span>
                            )}

                            {/* Subtabs */}
                            {Object.entries(tabConfig.subtabs || {}).map(([subtabName, subtabConfig]) => (
                                <SubTabConfigDisplay
                                    key={subtabName}
                                    subtabName={subtabName}
                                    config={subtabConfig}
                                />
                            ))}
                        </div>
                    ))}

                    {/* Client Actions */}
                    {page.client_actions.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Client Actions
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {page.client_actions.map(action => (
                                    <span key={action} className="inline-flex px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                        {action}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
