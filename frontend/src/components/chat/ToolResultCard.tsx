import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { ToolHistoryEntry } from '../../types/chat';

interface ToolResultCardProps {
    tool: ToolHistoryEntry;
    compact?: boolean;
}

function formatToolName(name: string): string {
    return name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatOutput(output: string | Record<string, any>): string {
    if (typeof output === 'string') {
        return output;
    }
    return JSON.stringify(output, null, 2);
}

interface CollapsibleContentProps {
    content: string;
    label: string;
    defaultExpanded?: boolean;
}

function CollapsibleContent({ content, label, defaultExpanded = true }: CollapsibleContentProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const isLong = content.length > 500;

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <div className="font-medium text-gray-600 dark:text-gray-400">{label}</div>
                {isLong && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                )}
            </div>
            <pre className={`bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${isLong && !isExpanded ? 'max-h-32 overflow-hidden' : ''}`}>
                {content}
            </pre>
            {isLong && !isExpanded && (
                <div className="text-xs text-gray-500 mt-1">
                    Content truncated. Click "Expand" to see full output.
                </div>
            )}
        </div>
    );
}

export default function ToolResultCard({ tool, compact = true }: ToolResultCardProps) {
    const [expanded, setExpanded] = useState(false);

    if (compact && !expanded) {
        return (
            <button
                onClick={() => setExpanded(true)}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 border border-blue-300 dark:border-blue-700 rounded text-xs text-blue-700 dark:text-blue-300 transition-colors cursor-pointer"
            >
                <WrenchScrewdriverIcon className="h-3.5 w-3.5" />
                <span className="font-medium">{formatToolName(tool.tool_name)}</span>
                <ChevronRightIcon className="h-3 w-3" />
            </button>
        );
    }

    return (
        <div className="my-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
                <WrenchScrewdriverIcon className="h-4 w-4 text-gray-500" />
                <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
                    {formatToolName(tool.tool_name)}
                </span>
                {expanded ? (
                    <ChevronDownIcon className="h-4 w-4 ml-auto text-gray-400" />
                ) : (
                    <ChevronRightIcon className="h-4 w-4 ml-auto text-gray-400" />
                )}
            </button>

            {expanded && (
                <div className="p-4 space-y-4 text-sm">
                    {/* Input */}
                    <CollapsibleContent
                        label="Input"
                        content={JSON.stringify(tool.input, null, 2)}
                        defaultExpanded={true}
                    />

                    {/* Output */}
                    <CollapsibleContent
                        label="Output"
                        content={formatOutput(tool.output)}
                        defaultExpanded={true}
                    />
                </div>
            )}
        </div>
    );
}

interface ToolHistoryPanelProps {
    tools: ToolHistoryEntry[];
    onClose: () => void;
}

export function ToolHistoryPanel({ tools, onClose }: ToolHistoryPanelProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-4 bg-white dark:bg-gray-800 shadow-xl flex flex-col rounded-lg">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Tool Calls ({tools.length})
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
                    >
                        &times;
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {tools.map((tool, idx) => (
                        <ToolResultCard key={idx} tool={tool} compact={false} />
                    ))}
                </div>
            </div>
        </div>
    );
}
