import { PartialStreamConfig } from '../types/stream-chat';

interface StreamConfigPreviewProps {
    config: PartialStreamConfig;
    highlightedField?: string | null;
}

export default function StreamConfigPreview({ config, highlightedField }: StreamConfigPreviewProps) {
    // Helper to determine if a field should be highlighted
    const isHighlighted = (fieldName: string) => highlightedField === fieldName;

    // Highlight styling
    const getFieldClassName = (fieldName: string) => {
        return isHighlighted(fieldName)
            ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 rounded-lg p-3 -m-1 transition-all'
            : '';
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 h-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                Research Stream Configuration
            </h3>

            <div className="space-y-6">
                {/* Stream Name */}
                <div className={getFieldClassName('stream_name')}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Stream Name {isHighlighted('stream_name') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                    </label>
                    <div className="text-gray-900 dark:text-white">
                        {config.stream_name || <span className="text-gray-400 italic">Not set</span>}
                    </div>
                </div>

                {/* Description */}
                {config.description && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Description
                        </label>
                        <div className="text-sm text-gray-900 dark:text-white">
                            {config.description}
                        </div>
                    </div>
                )}

                {/* Stream Type */}
                <div className={getFieldClassName('stream_type')}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Stream Type {isHighlighted('stream_type') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                    </label>
                    <div className="text-gray-900 dark:text-white capitalize">
                        {config.stream_type || <span className="text-gray-400 italic">Not set</span>}
                    </div>
                </div>

                {/* Focus Areas */}
                <div className={getFieldClassName('focus_areas')}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Focus Areas {isHighlighted('focus_areas') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                    </label>
                    {config.focus_areas && Array.isArray(config.focus_areas) && config.focus_areas.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {config.focus_areas.map((area, idx) => (
                                <span
                                    key={idx}
                                    className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm"
                                >
                                    {area}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <span className="text-gray-400 italic text-sm">None added</span>
                    )}
                </div>

                {/* Competitors */}
                <div className={getFieldClassName('competitors')}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Competitors to Monitor {isHighlighted('competitors') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                    </label>
                    {config.competitors && Array.isArray(config.competitors) && config.competitors.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {config.competitors.map((competitor, idx) => (
                                <span
                                    key={idx}
                                    className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm"
                                >
                                    {competitor}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <span className="text-gray-400 italic text-sm">None added</span>
                    )}
                </div>

                {/* Report Frequency */}
                <div className={getFieldClassName('report_frequency')}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Report Frequency {isHighlighted('report_frequency') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                    </label>
                    <div className="text-gray-900 dark:text-white capitalize">
                        {config.report_frequency || <span className="text-gray-400 italic">Not set</span>}
                    </div>
                </div>
            </div>

            {/* Completeness Indicator */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Configuration Progress</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                        {getCompletionPercentage(config)}%
                    </span>
                </div>
                <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${getCompletionPercentage(config)}%` }}
                    ></div>
                </div>
            </div>
        </div>
    );
}

function getCompletionPercentage(config: PartialStreamConfig): number {
    const fields = [
        config.stream_name,
        config.stream_type,
        config.focus_areas?.length,
        config.competitors?.length,
        config.report_frequency
    ];

    const completed = fields.filter(field => field).length;
    return Math.round((completed / fields.length) * 100);
}
