import { XMarkIcon, BugAntIcon } from '@heroicons/react/24/solid';
import { ChatDiagnostics } from '../../types/chat';

interface DiagnosticsPanelProps {
    diagnostics: ChatDiagnostics;
    onClose: () => void;
}

export function DiagnosticsPanel({ diagnostics, onClose }: DiagnosticsPanelProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-4 bg-white dark:bg-gray-800 shadow-xl flex flex-col rounded-lg">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20 flex-shrink-0 rounded-t-lg">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <BugAntIcon className="h-5 w-5 text-orange-500" />
                        Message Diagnostics
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
                    >
                        &times;
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Model</div>
                            <div className="font-mono text-sm text-gray-900 dark:text-white">{diagnostics.model}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens</div>
                            <div className="font-mono text-sm text-gray-900 dark:text-white">{diagnostics.max_tokens}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Temperature</div>
                            <div className="font-mono text-sm text-gray-900 dark:text-white">{diagnostics.temperature}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Max Iterations</div>
                            <div className="font-mono text-sm text-gray-900 dark:text-white">{diagnostics.max_iterations}</div>
                        </div>
                    </div>

                    {/* Tools */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                            Tools Available ({diagnostics.tools.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {diagnostics.tools.map((tool) => (
                                <span key={tool} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs font-mono">
                                    {tool}
                                </span>
                            ))}
                            {diagnostics.tools.length === 0 && (
                                <span className="text-gray-500 dark:text-gray-400 text-sm">No tools available</span>
                            )}
                        </div>
                    </div>

                    {/* Context */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Context</h4>
                        <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200">
                            {JSON.stringify(diagnostics.context, null, 2)}
                        </pre>
                    </div>

                    {/* Messages */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                            Messages ({diagnostics.messages.length})
                        </h4>
                        <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200">
                            {JSON.stringify(diagnostics.messages, null, 2)}
                        </pre>
                    </div>

                    {/* System Prompt */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">System Prompt</h4>
                        <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                            {diagnostics.system_prompt}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}
