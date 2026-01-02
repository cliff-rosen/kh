import { useState } from 'react';
import { XMarkIcon, BugAntIcon } from '@heroicons/react/24/solid';
import { ChatDiagnostics } from '../../types/chat';

interface DiagnosticsPanelProps {
    diagnostics: ChatDiagnostics;
    onClose: () => void;
}

export function DiagnosticsPanel({ diagnostics, onClose }: DiagnosticsPanelProps) {
    const [activeTab, setActiveTab] = useState<'input' | 'output'>('input');

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-4 bg-white dark:bg-gray-800 shadow-xl flex flex-col rounded-lg">
                {/* Header */}
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

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
                    <button
                        onClick={() => setActiveTab('input')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                            activeTab === 'input'
                                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                    >
                        LLM Input
                    </button>
                    <button
                        onClick={() => setActiveTab('output')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                            activeTab === 'output'
                                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                    >
                        LLM Output
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'input' && (
                        <>
                            {/* Model Config */}
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

                            {/* System Prompt */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                    System Prompt ({diagnostics.system_prompt.length} chars)
                                </h4>
                                <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-96 overflow-y-auto">
                                    {diagnostics.system_prompt}
                                </pre>
                            </div>

                            {/* Messages */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                    Message History ({diagnostics.messages.length})
                                </h4>
                                <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                                    {JSON.stringify(diagnostics.messages, null, 2)}
                                </pre>
                            </div>
                        </>
                    )}

                    {activeTab === 'output' && (
                        <>
                            {/* Raw LLM Response */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                    Raw LLM Response {diagnostics.raw_llm_response && `(${diagnostics.raw_llm_response.length} chars)`}
                                </h4>
                                {diagnostics.raw_llm_response ? (
                                    <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                        {diagnostics.raw_llm_response}
                                    </pre>
                                ) : (
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">No raw response captured</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
