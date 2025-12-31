import { useState, useEffect } from 'react';
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
} from '@heroicons/react/24/outline';
import { adminApi, type ChatConfigResponse, type PageConfigInfo } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';

export function ChatConfigList() {
    const [config, setConfig] = useState<ChatConfigResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

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
        <div className="space-y-8">
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
                    value="global + page + tab"
                    details="+ stream instructions"
                    isText
                />
            </div>

            {/* Page Configurations */}
            <Section title="Page Configurations" icon={DocumentTextIcon}>
                <div className="space-y-3">
                    {config.pages.map((page) => (
                        <PageConfigCard
                            key={page.page}
                            page={page}
                            isExpanded={expandedPages.has(page.page)}
                            onToggle={() => togglePage(page.page)}
                        />
                    ))}
                </div>
            </Section>

            {/* Payload Types */}
            <Section title="Payload Types" icon={CubeIcon}>
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
            </Section>

            {/* Tools */}
            <Section title="Tools" icon={WrenchScrewdriverIcon}>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Category
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Scope
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Payload Type
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Streaming
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {config.tools.map((tool) => (
                                <tr key={tool.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="font-medium text-gray-900 dark:text-white">
                                            {tool.name}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                            {tool.description}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                            {tool.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {tool.is_global ? (
                                            <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                                                <GlobeAltIcon className="h-4 w-4" />
                                                Global
                                            </span>
                                        ) : (
                                            <span className="text-gray-500 dark:text-gray-400">Page-specific</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {tool.payload_type ? (
                                            <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                                                {tool.payload_type}
                                            </code>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <StatusIcon active={tool.streaming} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            {/* Stream Instructions */}
            <Section title="Stream-Specific Instructions" icon={BeakerIcon}>
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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {config.stream_instructions.map((stream) => (
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
                                        <StatusIcon active={stream.has_instructions} />
                                    </td>
                                    <td className="px-6 py-4">
                                        {stream.instructions_preview ? (
                                            <div className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                                                <pre className="whitespace-pre-wrap font-mono text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                    {stream.instructions_preview}
                                                </pre>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 text-sm">No instructions configured</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {config.stream_instructions.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
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
            </Section>

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
                        <strong>PageConfig</strong> references payloads and tools by name.
                        The <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">is_global</code> flag determines default availability.
                    </p>
                    <p>
                        <strong>Stream Instructions</strong> are per-stream customizations stored in the database.
                        They're added to the system prompt when chatting about that stream's reports.
                    </p>
                    <p>
                        <strong>Resolution:</strong> System prompt = base instructions + page context + payload instructions + stream instructions
                    </p>
                </div>
            </div>
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

function Section({ title, icon: Icon, children }: {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            </div>
            {children}
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

function PageConfigCard({ page, isExpanded, onToggle }: {
    page: PageConfigInfo;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const tabCount = Object.keys(page.tabs).length;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
                <div className="flex items-center gap-3">
                    {isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                    )}
                    <div className="text-left">
                        <div className="font-medium text-gray-900 dark:text-white">
                            {page.page}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {tabCount > 0 ? `${tabCount} tabs` : 'No tabs'} |
                            {page.payloads.length} page payloads |
                            {page.tools.length} page tools
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {page.has_context_builder && (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Context Builder
                        </span>
                    )}
                </div>
            </button>

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
                        <div key={tabName}>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                <TagIcon className="h-4 w-4" />
                                Tab: {tabName}
                            </h4>
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
                                {tabConfig.payloads.length === 0 && tabConfig.tools.length === 0 && (
                                    <span className="text-xs text-gray-400">No tab-specific payloads or tools</span>
                                )}
                            </div>
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
