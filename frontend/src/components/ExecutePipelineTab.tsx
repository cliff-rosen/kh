import { useState, useEffect } from 'react';
import { PlayIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface PipelineStatus {
    stage: string;
    message: string;
    data?: Record<string, any>;
    timestamp: string;
}

interface ExecutePipelineTabProps {
    streamId: number;
}

export default function ExecutePipelineTab({ streamId }: ExecutePipelineTabProps) {
    const [isExecuting, setIsExecuting] = useState(false);
    const [statusLog, setStatusLog] = useState<PipelineStatus[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [reportId, setReportId] = useState<number | null>(null);

    const executePipeline = async () => {
        setIsExecuting(true);
        setStatusLog([]);
        setError(null);
        setReportId(null);

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/research-streams/${streamId}/execute-pipeline`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ run_type: 'test' })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Read SSE stream
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('No response body');
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data.trim()) {
                            try {
                                const status: PipelineStatus = JSON.parse(data);

                                if (status.stage === 'done') {
                                    setIsExecuting(false);
                                    break;
                                }

                                if (status.stage === 'error') {
                                    setError(status.message);
                                    setIsExecuting(false);
                                    break;
                                }

                                // Check if status contains report_id
                                if (status.stage === 'complete' && status.data?.report_id) {
                                    setReportId(status.data.report_id);
                                }

                                setStatusLog(prev => [...prev, status]);
                            } catch (e) {
                                console.error('Failed to parse SSE data:', data, e);
                            }
                        }
                    }
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to execute pipeline');
            setIsExecuting(false);
        }
    };

    const getStageColor = (stage: string) => {
        switch (stage) {
            case 'init':
                return 'text-blue-600 dark:text-blue-400';
            case 'cleanup':
                return 'text-gray-600 dark:text-gray-400';
            case 'retrieval':
                return 'text-indigo-600 dark:text-indigo-400';
            case 'dedup_group':
                return 'text-yellow-600 dark:text-yellow-400';
            case 'filter':
                return 'text-purple-600 dark:text-purple-400';
            case 'dedup_global':
                return 'text-orange-600 dark:text-orange-400';
            case 'categorize':
                return 'text-green-600 dark:text-green-400';
            case 'report':
                return 'text-teal-600 dark:text-teal-400';
            case 'complete':
                return 'text-green-600 dark:text-green-400 font-semibold';
            case 'error':
                return 'text-red-600 dark:text-red-400 font-semibold';
            default:
                return 'text-gray-600 dark:text-gray-400';
        }
    };

    const getStageBadge = (stage: string) => {
        const baseClass = "inline-block px-2 py-0.5 text-xs font-medium rounded uppercase";
        switch (stage) {
            case 'init':
                return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300`;
            case 'cleanup':
                return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300`;
            case 'retrieval':
                return `${baseClass} bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300`;
            case 'dedup_group':
                return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300`;
            case 'filter':
                return `${baseClass} bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300`;
            case 'dedup_global':
                return `${baseClass} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`;
            case 'categorize':
                return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`;
            case 'report':
                return `${baseClass} bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300`;
            case 'complete':
                return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`;
            case 'error':
                return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300`;
            default:
                return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300`;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-200 mb-2">
                    Layer 4: Test & Execute Pipeline
                </h3>
                <p className="text-sm text-orange-800 dark:text-orange-300">
                    Execute the full pipeline end-to-end: retrieval, deduplication, filtering, categorization, and report generation.
                    This creates a test report with real-time progress updates.
                </p>
            </div>

            {/* Execute Button */}
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    onClick={executePipeline}
                    disabled={isExecuting}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                        isExecuting
                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                    }`}
                >
                    {isExecuting ? (
                        <>
                            <ArrowPathIcon className="h-5 w-5 animate-spin" />
                            Executing Pipeline...
                        </>
                    ) : (
                        <>
                            <PlayIcon className="h-5 w-5" />
                            Execute Pipeline
                        </>
                    )}
                </button>

                {reportId && (
                    <a
                        href={`/reports/${reportId}`}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors"
                    >
                        <CheckCircleIcon className="h-5 w-5" />
                        View Report
                    </a>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <ExclamationCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-medium text-red-900 dark:text-red-200">Pipeline Execution Failed</h4>
                            <p className="text-sm text-red-800 dark:text-red-300 mt-1">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Log */}
            {statusLog.length > 0 && (
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-600">
                        <h4 className="font-medium text-gray-900 dark:text-white">Execution Log</h4>
                    </div>
                    <div className="bg-white dark:bg-gray-900 p-4 space-y-3 max-h-[500px] overflow-y-auto font-mono text-sm">
                        {statusLog.map((status, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 font-mono">
                                    {new Date(status.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={getStageBadge(status.stage)}>
                                    {status.stage}
                                </span>
                                <div className="flex-1">
                                    <p className={`${getStageColor(status.stage)}`}>
                                        {status.message}
                                    </p>
                                    {status.data && Object.keys(status.data).length > 0 && (
                                        <details className="mt-1">
                                            <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                                                Show details
                                            </summary>
                                            <pre className="text-xs text-gray-600 dark:text-gray-400 mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded overflow-x-auto">
                                                {JSON.stringify(status.data, null, 2)}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {statusLog.length === 0 && !isExecuting && !error && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <PlayIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Click "Execute Pipeline" to test your research stream configuration</p>
                </div>
            )}
        </div>
    );
}
