import { PartialStreamConfig } from '../types/stream-chat';

interface StreamConfigPreviewProps {
    config: PartialStreamConfig;
}

export default function StreamConfigPreview({ config }: StreamConfigPreviewProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 h-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                Research Stream Configuration
            </h3>

            <div className="space-y-6">
                {/* Stream Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Stream Name
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
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Stream Type
                    </label>
                    <div className="text-gray-900 dark:text-white capitalize">
                        {config.stream_type || <span className="text-gray-400 italic">Not set</span>}
                    </div>
                </div>

                {/* Focus Areas */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Focus Areas
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
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Competitors to Monitor
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
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Report Frequency
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
