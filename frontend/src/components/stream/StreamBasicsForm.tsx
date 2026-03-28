import { useAuth } from '../../context/AuthContext';
import { ReportFrequency, ScheduleConfig } from '../../types';

export type StreamScope = 'personal' | 'organization' | 'global';

interface StreamBasicsFormProps {
    streamName: string;
    onStreamNameChange: (name: string) => void;
    scope: StreamScope;
    onScopeChange: (scope: StreamScope) => void;
    scheduleConfig: ScheduleConfig;
    onScheduleConfigChange: (config: ScheduleConfig) => void;
}

const SCOPE_OPTIONS: { value: StreamScope; label: string; description: string }[] = [
    { value: 'personal', label: 'Personal', description: 'Only you can see this stream' },
    { value: 'organization', label: 'Organization', description: 'All org members can subscribe' },
    { value: 'global', label: 'Global', description: 'Platform-wide, orgs can subscribe' },
];

export default function StreamBasicsForm({
    streamName,
    onStreamNameChange,
    scope,
    onScopeChange,
    scheduleConfig,
    onScheduleConfigChange,
}: StreamBasicsFormProps) {
    const { user, isPlatformAdmin, isOrgAdmin } = useAuth();

    // Determine available scopes based on user role
    const availableScopes = SCOPE_OPTIONS.filter((opt) => {
        if (opt.value === 'personal') return true;
        if (opt.value === 'organization') return (isOrgAdmin || isPlatformAdmin) && !!user?.org_id;
        if (opt.value === 'global') return isPlatformAdmin;
        return false;
    });

    return (
        <div className="space-y-6">
            {/* Stream Name */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Stream Name *
                </label>
                <input
                    type="text"
                    placeholder="e.g., Asbestos (Non-Talc) Literature"
                    value={streamName}
                    onChange={(e) => onStreamNameChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                />
            </div>

            {/* Scope selector - only show if user has options */}
            {availableScopes.length > 1 && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Stream Visibility *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {availableScopes.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => onScopeChange(opt.value)}
                                className={`p-3 rounded-lg border-2 text-left transition-all ${
                                    scope === opt.value
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                }`}
                            >
                                <div className={`font-medium ${
                                    scope === opt.value
                                        ? 'text-blue-700 dark:text-blue-300'
                                        : 'text-gray-900 dark:text-white'
                                }`}>
                                    {opt.label}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {opt.description}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Report Frequency */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Report Frequency *
                </label>
                <select
                    value={scheduleConfig.frequency}
                    onChange={(e) => onScheduleConfigChange({
                        ...scheduleConfig,
                        frequency: e.target.value as ReportFrequency,
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                    <option value={ReportFrequency.DAILY}>Daily</option>
                    <option value={ReportFrequency.WEEKLY}>Weekly</option>
                    <option value={ReportFrequency.BIWEEKLY}>Bi-weekly</option>
                    <option value={ReportFrequency.MONTHLY}>Monthly</option>
                </select>
            </div>
        </div>
    );
}
