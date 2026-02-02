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
} from '@heroicons/react/24/outline';
import { adminApi, type ChatConfigResponse, type PageConfigInfo, type SubTabConfigInfo, type HelpSectionSummary, type HelpSectionDetail, type HelpTOCPreview, type StreamConfigInfo, type PageConfigIdentityInfo, type ToolInfo } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

type ConfigTab = 'streams' | 'pages' | 'payloads' | 'tools' | 'help';

const configTabs: { id: ConfigTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'streams', label: 'Streams', icon: BeakerIcon },
    { id: 'pages', label: 'Pages', icon: DocumentTextIcon },
    { id: 'payloads', label: 'Payloads', icon: CubeIcon },
    { id: 'tools', label: 'Tools', icon: WrenchScrewdriverIcon },
    { id: 'help', label: 'Help', icon: BookOpenIcon },
];

// Help content utilities
interface SectionGroup {
    area: string;
    label: string;
    sections: HelpSectionSummary[];
}

function getHelpArea(sectionId: string): string {
    const parts = sectionId.split('/');
    return parts.length > 1 ? parts[0] : 'general';
}

function getHelpAreaLabel(area: string): string {
    const labels: Record<string, string> = {
        'general': 'Getting Started',
        'reports': 'Reports',
        'streams': 'Streams',
        'tools': 'Tools',
        'operations': 'Operations',
    };
    return labels[area] || area.charAt(0).toUpperCase() + area.slice(1);
}

function getHelpAreaOrder(area: string): number {
    const order: Record<string, number> = {
        'general': 0,
        'reports': 1,
        'streams': 2,
        'tools': 3,
        'operations': 4,
    };
    return order[area] ?? 99;
}

export function ChatConfigPanel() {
    const [config, setConfig] = useState<ChatConfigResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ConfigTab>('streams');
    const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

    // Stream config editing state
    const [streamConfigs, setStreamConfigs] = useState<StreamConfigInfo[]>([]);
    const [selectedStream, setSelectedStream] = useState<StreamConfigInfo | null>(null);
    const [streamInstructions, setStreamInstructions] = useState<string>('');
    const [isLoadingStreams, setIsLoadingStreams] = useState(false);
    const [isSavingStream, setIsSavingStream] = useState(false);
    const [streamError, setStreamError] = useState<string | null>(null);

    // Page config editing state
    const [pageConfigs, setPageConfigs] = useState<PageConfigIdentityInfo[]>([]);
    const [selectedPageConfig, setSelectedPageConfig] = useState<PageConfigIdentityInfo | null>(null);
    const [editingIdentity, setEditingIdentity] = useState<string>('');
    const [editingGuidelines, setEditingGuidelines] = useState<string>('');
    const [pageEditTab, setPageEditTab] = useState<'identity' | 'guidelines'>('identity');
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

    // Help content state
    const [helpSections, setHelpSections] = useState<HelpSectionSummary[]>([]);
    const [tocPreviews, setTocPreviews] = useState<HelpTOCPreview[]>([]);
    const [selectedHelpSection, setSelectedHelpSection] = useState<HelpSectionDetail | null>(null);
    const [isLoadingHelp, setIsLoadingHelp] = useState(false);
    const [isLoadingHelpSection, setIsLoadingHelpSection] = useState(false);
    const [isReloadingHelp, setIsReloadingHelp] = useState(false);
    const [helpError, setHelpError] = useState<string | null>(null);
    const [helpViewMode, setHelpViewMode] = useState<'sections' | 'toc-preview'>('sections');
    const [collapsedHelpAreas, setCollapsedHelpAreas] = useState<Set<string>>(new Set());

    // Group help sections by area
    const groupedHelpSections = useMemo((): SectionGroup[] => {
        const groups: Record<string, HelpSectionSummary[]> = {};

        for (const section of helpSections) {
            const area = getHelpArea(section.id);
            if (!groups[area]) {
                groups[area] = [];
            }
            groups[area].push(section);
        }

        // Sort sections within each group by order
        for (const area in groups) {
            groups[area].sort((a, b) => a.order - b.order);
        }

        // Convert to array and sort by area order
        return Object.entries(groups)
            .map(([area, sects]) => ({
                area,
                label: getHelpAreaLabel(area),
                sections: sects,
            }))
            .sort((a, b) => getHelpAreaOrder(a.area) - getHelpAreaOrder(b.area));
    }, [helpSections]);

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

    const openStreamConfig = (stream: StreamConfigInfo) => {
        setSelectedStream(stream);
        setStreamInstructions(stream.instructions || '');
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

    const openPageConfig = (page: PageConfigIdentityInfo) => {
        setSelectedPageConfig(page);
        // Only show the override value, not the effective value (default is shown separately)
        setEditingIdentity(page.has_identity_override ? (page.identity || '') : '');
        setEditingGuidelines(page.has_guidelines_override ? (page.guidelines || '') : '');
        setPageEditTab('identity');
        setPageError(null);
    };

    const closePageConfig = () => {
        setSelectedPageConfig(null);
        setEditingIdentity('');
        setEditingGuidelines('');
        setPageError(null);
    };

    const savePageConfig = async () => {
        if (!selectedPageConfig) return;

        setIsSavingPage(true);
        setPageError(null);

        try {
            const trimmedIdentity = editingIdentity.trim();
            const trimmedGuidelines = editingGuidelines.trim();
            const updated = await adminApi.updatePageConfig(
                selectedPageConfig.page,
                {
                    identity: trimmedIdentity.length > 0 ? trimmedIdentity : null,
                    guidelines: trimmedGuidelines.length > 0 ? trimmedGuidelines : null,
                }
            );

            // Update state to reflect saved values (keep modal open)
            setSelectedPageConfig(updated);
            setEditingIdentity(updated.has_identity_override ? (updated.identity || '') : '');
            setEditingGuidelines(updated.has_guidelines_override ? (updated.guidelines || '') : '');
            await loadPageConfigs();
        } catch (err) {
            setPageError(handleApiError(err));
        } finally {
            setIsSavingPage(false);
        }
    };

    const resetPageConfig = async () => {
        if (!selectedPageConfig || (!selectedPageConfig.has_identity_override && !selectedPageConfig.has_guidelines_override)) return;

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
    const loadHelpContent = async () => {
        setIsLoadingHelp(true);
        setHelpError(null);
        try {
            const [sectionsRes, tocRes] = await Promise.all([
                adminApi.getHelpSections(),
                adminApi.getHelpTocPreview(),
            ]);
            setHelpSections(sectionsRes.sections);
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
            await loadHelpContent();
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsReloadingHelp(false);
        }
    };

    const handleViewHelpSection = async (sectionId: string) => {
        setIsLoadingHelpSection(true);
        try {
            const detail = await adminApi.getHelpSection(sectionId);
            setSelectedHelpSection(detail);
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsLoadingHelpSection(false);
        }
    };

    const toggleHelpArea = (area: string) => {
        setCollapsedHelpAreas(prev => {
            const next = new Set(prev);
            if (next.has(area)) {
                next.delete(area);
            } else {
                next.add(area);
            }
            return next;
        });
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

    // Load help content when switching to help tab
    useEffect(() => {
        if (activeTab === 'help' && helpSections.length === 0 && !isLoadingHelp) {
            loadHelpContent();
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
                                                        {stream.instructions ? (
                                                            <div className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                                                                <pre className="whitespace-pre-wrap font-mono text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                                    {stream.instructions.length > 200
                                                                        ? stream.instructions.substring(0, 200) + '...'
                                                                        : stream.instructions}
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
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Help documentation shown to users via chat. Content is organized by area and filtered by user role.
                            </p>
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
                                    onClick={() => setHelpViewMode('sections')}
                                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                                        helpViewMode === 'sections'
                                            ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <BookOpenIcon className="h-4 w-4" />
                                        All Sections ({helpSections.length})
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
                        ) : helpViewMode === 'sections' ? (
                            <div className="space-y-4">
                                {groupedHelpSections.map((group) => (
                                    <div key={group.area} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                                        <button
                                            onClick={() => toggleHelpArea(group.area)}
                                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                        >
                                            <div className="flex items-center gap-2">
                                                {collapsedHelpAreas.has(group.area) ? (
                                                    <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                                                ) : (
                                                    <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                                                )}
                                                <span className="font-medium text-gray-900 dark:text-white">
                                                    {group.label}
                                                </span>
                                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                                    ({group.sections.length} sections)
                                                </span>
                                            </div>
                                        </button>
                                        {!collapsedHelpAreas.has(group.area) && (
                                            <div className="border-t border-gray-200 dark:border-gray-700">
                                                {group.sections.map((section) => (
                                                    <div
                                                        key={section.id}
                                                        className="px-4 py-3 border-b last:border-b-0 border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                                                    >
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                                        {section.title}
                                                                    </span>
                                                                    <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                                                        {section.id}
                                                                    </code>
                                                                </div>
                                                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                                    {section.summary}
                                                                </p>
                                                                <div className="flex items-center gap-2">
                                                                    {section.roles.map((role) => (
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
                                                            <button
                                                                onClick={() => handleViewHelpSection(section.id)}
                                                                disabled={isLoadingHelpSection}
                                                                className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
                                                            >
                                                                <EyeIcon className="h-4 w-4" />
                                                                View
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {groupedHelpSections.length === 0 && (
                                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                        No help sections found. Click "Reload from Files" to load help content.
                                    </div>
                                )}
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

            {/* Help Section View Modal */}
            {selectedHelpSection && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-4xl h-[calc(100vh-8rem)] flex flex-col">
                        {/* Header */}
                        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {selectedHelpSection.title}
                                </h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                        {selectedHelpSection.id}
                                    </code>
                                    {selectedHelpSection.roles.map((role) => (
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
                            <button
                                onClick={() => setSelectedHelpSection(null)}
                                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <MarkdownRenderer content={selectedHelpSection.content} />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end">
                            <button
                                onClick={() => setSelectedHelpSection(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Close
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
                                    Edit Page Configuration
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedPageConfig.page}
                                    {selectedPageConfig.has_identity_override && (
                                        <span className="ml-2 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                            Custom Identity
                                        </span>
                                    )}
                                    {selectedPageConfig.has_guidelines_override && (
                                        <span className="ml-2 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                            Custom Guidelines
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

                        {/* Tabs */}
                        <div className="flex-shrink-0 px-6 pt-4 border-b border-gray-200 dark:border-gray-700">
                            <nav className="flex gap-6">
                                <button
                                    onClick={() => setPageEditTab('identity')}
                                    className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                                        pageEditTab === 'identity'
                                            ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                    }`}
                                >
                                    Identity
                                    {selectedPageConfig.has_identity_override && (
                                        <span className="ml-1.5 inline-flex w-2 h-2 rounded-full bg-purple-500" />
                                    )}
                                </button>
                                <button
                                    onClick={() => setPageEditTab('guidelines')}
                                    className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                                        pageEditTab === 'guidelines'
                                            ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                    }`}
                                >
                                    Guidelines
                                    {selectedPageConfig.has_guidelines_override && (
                                        <span className="ml-1.5 inline-flex w-2 h-2 rounded-full bg-amber-500" />
                                    )}
                                </button>
                            </nav>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-h-0 flex flex-col p-6">
                            {pageError && (
                                <div className="flex-shrink-0 mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                    {pageError}
                                </div>
                            )}

                            {pageEditTab === 'identity' ? (
                                <>
                                    <p className="flex-shrink-0 text-sm text-gray-600 dark:text-gray-400 mb-4">
                                        The identity defines the persona and role of the assistant on this page.
                                        It appears at the start of the system prompt.
                                    </p>

                                    {/* Default section */}
                                    <div className="flex-shrink-0 mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                            Default Identity ({selectedPageConfig.default_identity_is_global ? 'global' : 'page-specific'})
                                        </p>
                                        <pre className="text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto">
                                            {selectedPageConfig.default_identity}
                                        </pre>
                                    </div>

                                    {/* Override section */}
                                    <label className="flex-shrink-0 block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Override {selectedPageConfig.has_identity_override && <span className="text-purple-600 dark:text-purple-400">(active)</span>}
                                    </label>
                                    <textarea
                                        value={editingIdentity}
                                        onChange={(e) => setEditingIdentity(e.target.value)}
                                        placeholder="Leave empty to use the default, or enter a custom identity..."
                                        className="flex-1 min-h-0 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                                    />
                                </>
                            ) : (
                                <>
                                    <p className="flex-shrink-0 text-sm text-gray-600 dark:text-gray-400 mb-4">
                                        Guidelines define behavioral rules for the assistant: response style, when to make suggestions, and constraints.
                                        They appear at the end of the system prompt.
                                    </p>

                                    {/* Default section */}
                                    <div className="flex-shrink-0 mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                            Default Guidelines ({selectedPageConfig.default_guidelines_is_global ? 'global' : 'page-specific'})
                                        </p>
                                        <pre className="text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto">
                                            {selectedPageConfig.default_guidelines}
                                        </pre>
                                    </div>

                                    {/* Cheat sheet */}
                                    <div className="flex-shrink-0 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">
                                            Suggested sections for overrides:
                                        </p>
                                        <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                                            <p><strong>## Style</strong> - Tone, length, formatting preferences</p>
                                            <p><strong>## Suggestions</strong> - When to use SUGGESTED_VALUES / SUGGESTED_ACTIONS</p>
                                            <p><strong>## Constraints</strong> - What to avoid or never do</p>
                                        </div>
                                    </div>

                                    {/* Override section */}
                                    <label className="flex-shrink-0 block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Override {selectedPageConfig.has_guidelines_override && <span className="text-amber-600 dark:text-amber-400">(active)</span>}
                                    </label>
                                    <textarea
                                        value={editingGuidelines}
                                        onChange={(e) => setEditingGuidelines(e.target.value)}
                                        placeholder="Leave empty to use the default, or enter custom guidelines for this page..."
                                        className="flex-1 min-h-0 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                                    />
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        {(() => {
                            // Compute if there are unsaved changes
                            const savedIdentity = selectedPageConfig.has_identity_override ? (selectedPageConfig.identity || '') : '';
                            const savedGuidelines = selectedPageConfig.has_guidelines_override ? (selectedPageConfig.guidelines || '') : '';
                            const hasChanges = editingIdentity !== savedIdentity || editingGuidelines !== savedGuidelines;

                            return (
                                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    <div>
                                        {(selectedPageConfig.has_identity_override || selectedPageConfig.has_guidelines_override) && (
                                            <button
                                                onClick={resetPageConfig}
                                                disabled={isSavingPage}
                                                className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                Reset All to Defaults
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
    identity?: PageConfigIdentityInfo;
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
                    {identity?.has_identity_override && (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            Custom Identity
                        </span>
                    )}
                    {identity?.has_guidelines_override && (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            Custom Guidelines
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
