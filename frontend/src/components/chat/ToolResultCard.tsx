import { useState } from 'react';
import { ChevronRightIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { ToolHistoryEntry } from '../../types/chat';

interface ToolResultCardProps {
    tool: ToolHistoryEntry;
    onClick?: () => void;
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

/** Inline clickable chip that opens tool details */
export default function ToolResultCard({ tool, onClick }: ToolResultCardProps) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 border border-blue-300 dark:border-blue-700 rounded text-xs text-blue-700 dark:text-blue-300 transition-colors cursor-pointer"
        >
            <WrenchScrewdriverIcon className="h-3.5 w-3.5" />
            <span className="font-medium">{formatToolName(tool.tool_name)}</span>
            <ChevronRightIcon className="h-3 w-3" />
        </button>
    );
}

/** Expanded view of a tool call - used inside panels (diagnostic view) */
export function ToolResultExpanded({ tool }: { tool: ToolHistoryEntry }) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800">
                <WrenchScrewdriverIcon className="h-5 w-5 text-gray-500" />
                <span className="font-medium text-gray-700 dark:text-gray-300">
                    {formatToolName(tool.tool_name)}
                </span>
            </div>
            <div className="p-4 space-y-4 text-sm">
                <CollapsibleContent
                    label="Input"
                    content={JSON.stringify(tool.input, null, 2)}
                    defaultExpanded={false}
                />
                <CollapsibleContent
                    label="Output"
                    content={formatOutput(tool.output)}
                    defaultExpanded={true}
                />
            </div>
        </div>
    );
}

interface ToolHistoryPanelProps {
    tools: ToolHistoryEntry[];
    onClose: () => void;
}

export function ToolHistoryPanel({ tools, onClose }: ToolHistoryPanelProps) {
    const title = tools.length === 1
        ? formatToolName(tools[0].tool_name)
        : `Tool Calls (${tools.length})`;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-4 bg-white dark:bg-gray-800 shadow-xl flex flex-col rounded-lg">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {title}
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
                        <ToolResultExpanded key={idx} tool={tool} />
                    ))}
                </div>
            </div>
        </div>
    );
}
