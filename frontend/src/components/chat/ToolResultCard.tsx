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
        return output.length > 200 ? output.substring(0, 200) + '...' : output;
    }
    return JSON.stringify(output, null, 2);
}

export default function ToolResultCard({ tool, compact = true }: ToolResultCardProps) {
    const [expanded, setExpanded] = useState(false);

    if (compact && !expanded) {
        return (
            <button
                onClick={() => setExpanded(true)}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-300 transition-colors"
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
                <div className="p-3 space-y-3 text-sm">
                    {/* Input */}
                    <div>
                        <div className="font-medium text-gray-600 dark:text-gray-400 mb-1">Input</div>
                        <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto text-gray-700 dark:text-gray-300">
                            {JSON.stringify(tool.input, null, 2)}
                        </pre>
                    </div>

                    {/* Output */}
                    <div>
                        <div className="font-medium text-gray-600 dark:text-gray-400 mb-1">Output</div>
                        <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto text-gray-700 dark:text-gray-300 max-h-60 overflow-y-auto whitespace-pre-wrap">
                            {formatOutput(tool.output)}
                        </pre>
                    </div>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                        Tool Calls ({tools.length})
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                        &times;
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {tools.map((tool, idx) => (
                        <ToolResultCard key={idx} tool={tool} compact={false} />
                    ))}
                </div>
            </div>
        </div>
    );
}
