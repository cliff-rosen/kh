import { useState } from 'react';
import { PlayIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { researchStreamApi, PipelineStatus } from '../lib/api/researchStreamApi';

interface ExecutePipelineTabProps {
    streamId: number;
}

export default function ExecutePipelineTab({ streamId }: ExecutePipelineTabProps) {
    const [isExecuting, setIsExecuting] = useState(false);
    const [statusLog, setStatusLog] = useState<PipelineStatus[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [reportId, setReportId] = useState<number | null>(null);

    // Calculate default dates (last 7 days)
    const getDefaultDates = () => {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        return {
            startDate: weekAgo.toISOString().split('T')[0], // YYYY-MM-DD
            endDate: today.toISOString().split('T')[0]
        };
    };

    const defaults = getDefaultDates();
    const [startDate, setStartDate] = useState(defaults.startDate);
    const [endDate, setEndDate] = useState(defaults.endDate);

    const executePipeline = async () => {
        setIsExecuting(true);
        setStatusLog([]);
        setError(null);
        setReportId(null);

        try {
            // Convert YYYY-MM-DD to YYYY/MM/DD for backend
            const formattedStartDate = startDate.replace(/-/g, '/');
            const formattedEndDate = endDate.replace(/-/g, '/');

            // Use the API method to execute pipeline
            const stream = researchStreamApi.executePipeline(streamId, {
                run_type: 'test',
                start_date: formattedStartDate,
                end_date: formattedEndDate
            });

            for await (const status of stream) {
                // Check for completion or error
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

                // Add status to log
                setStatusLog(prev => [...prev, status]);
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
                    Full Pipeline Execution
                </h3>
                <p className="text-sm text-orange-800 dark:text-orange-300">
                    Execute the complete pipeline end-to-end: retrieval, deduplication, filtering, categorization, and report generation.
                    This creates a full test report with real-time progress updates.
                </p>
            </div>

            {/* Date Range Selection */}
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">Date Range for Retrieval</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Retrieves articles that entered PubMed during this date range (using entry date).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            disabled={isExecuting}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            disabled={isExecuting}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                        />
                    </div>
                </div>
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
                        href={`/reports?stream=${streamId}&report=${reportId}`}
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
