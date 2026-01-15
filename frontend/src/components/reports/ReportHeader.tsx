import {
    ChartBarIcon,
    Cog6ToothIcon,
    TrashIcon,
    ListBulletIcon,
    Squares2X2Icon,
    TableCellsIcon,
    Bars2Icon,
    Bars3BottomLeftIcon,
    SparklesIcon
} from '@heroicons/react/24/outline';
import { ReportWithArticles } from '../../types';

export type ReportView = 'all' | 'by-category' | 'tablizer';
export type CardFormat = 'compact' | 'abstract' | 'ai_summary';

export interface ReportHeaderProps {
    report: ReportWithArticles;
    reportView: ReportView;
    cardFormat: CardFormat;
    hasPipelineData: boolean;
    showAdminControls?: boolean;
    onViewChange: (view: ReportView) => void;
    onCardFormatChange: (format: CardFormat) => void;
    onShowExecutionConfig: () => void;
    onShowAnalytics: () => void;
    onDeleteReport: () => void;
}

export default function ReportHeader({
    report,
    reportView,
    cardFormat,
    hasPipelineData,
    showAdminControls = false,
    onViewChange,
    onCardFormatChange,
    onShowExecutionConfig,
    onShowAnalytics,
    onDeleteReport
}: ReportHeaderProps) {
    return (
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            {/* First line: Title (left) + Config/Analytics icons (right) */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {report.report_name}
                </h2>
                <div className="flex items-center gap-2">
                    {showAdminControls && (
                        <>
                            <button
                                onClick={onShowExecutionConfig}
                                className="p-2 rounded-md transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                                title="View execution configuration snapshot"
                            >
                                <Cog6ToothIcon className="h-5 w-5" />
                            </button>
                            {hasPipelineData && (
                                <button
                                    onClick={onShowAnalytics}
                                    className="p-2 rounded-md transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                                    title="View pipeline analytics and detailed metrics"
                                >
                                    <ChartBarIcon className="h-5 w-5" />
                                </button>
                            )}
                        </>
                    )}
                    <button
                        onClick={onDeleteReport}
                        className="p-2 rounded-md transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete report"
                    >
                        <TrashIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Second line: Dates (left) + View buttons (right) */}
            <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>
                        Generated: {new Date(report.created_at).toLocaleDateString()}
                    </span>
                    {report.retrieval_params?.start_date && report.retrieval_params?.end_date && (
                        <span>
                            Report range: {new Date(report.retrieval_params.start_date).toLocaleDateString()} – {new Date(report.retrieval_params.end_date).toLocaleDateString()}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {/* View mode toggle */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => onViewChange('all')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                reportView === 'all'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            <ListBulletIcon className="h-4 w-4" />
                            All Articles
                        </button>
                        <button
                            onClick={() => onViewChange('by-category')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                reportView === 'by-category'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            <Squares2X2Icon className="h-4 w-4" />
                            By Category
                        </button>
                        <button
                            onClick={() => onViewChange('tablizer')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                reportView === 'tablizer'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            <TableCellsIcon className="h-4 w-4" />
                            Tablizer
                        </button>
                    </div>
                    {/* Card format toggle */}
                    <div className="flex gap-1 border-l border-gray-300 dark:border-gray-600 pl-4">
                        <button
                            onClick={() => onCardFormatChange('compact')}
                            className={`p-1.5 rounded-md transition-colors ${
                                cardFormat === 'compact'
                                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            title="Compact view"
                        >
                            <Bars2Icon className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => onCardFormatChange('abstract')}
                            className={`p-1.5 rounded-md transition-colors ${
                                cardFormat === 'abstract'
                                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            title="Show abstracts"
                        >
                            <Bars3BottomLeftIcon className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => onCardFormatChange('ai_summary')}
                            className={`p-1.5 rounded-md transition-colors ${
                                cardFormat === 'ai_summary'
                                    ? 'bg-purple-200 dark:bg-purple-600 text-purple-900 dark:text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            title="Show AI summaries"
                        >
                            <SparklesIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
