import { useState } from 'react';
import { PartialStreamConfig } from '../types/stream-chat';
import { PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface StreamConfigPreviewProps {
    config: PartialStreamConfig;
    highlightedField?: string | null;
    onUpdateField?: (fieldName: string, value: any) => void;
}

export default function StreamConfigPreview({ config, highlightedField, onUpdateField }: StreamConfigPreviewProps) {
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<any>(null);

    // Helper to determine if a field should be highlighted
    const isHighlighted = (fieldName: string) => highlightedField === fieldName;

    // Highlight styling
    const getFieldClassName = (fieldName: string) => {
        return isHighlighted(fieldName)
            ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 rounded-lg p-3 -m-1 transition-all'
            : '';
    };

    const startEditing = (fieldName: string, currentValue: any) => {
        setEditingField(fieldName);
        setEditValue(currentValue);
    };

    const cancelEditing = () => {
        setEditingField(null);
        setEditValue(null);
    };

    const saveEdit = (fieldName: string) => {
        if (onUpdateField) {
            // Convert comma-separated string to array for array fields
            let valueToSave = editValue;
            if (fieldName === 'focus_areas' || fieldName === 'competitors' || fieldName === 'keywords' || fieldName === 'business_goals') {
                valueToSave = editValue
                    ? editValue.split(',').map((item: string) => item.trim()).filter((item: string) => item)
                    : [];
            }
            onUpdateField(fieldName, valueToSave);
        }
        setEditingField(null);
        setEditValue(null);
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-full flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Research Stream Configuration
                </h3>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
                {/* Stream Name */}
                <div className={getFieldClassName('stream_name')}>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Stream Name {isHighlighted('stream_name') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                        </label>
                        {config.stream_name && editingField !== 'stream_name' && (
                            <button
                                onClick={() => startEditing('stream_name', config.stream_name)}
                                className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                <PencilIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {editingField === 'stream_name' ? (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editValue || ''}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                            />
                            <button
                                onClick={() => saveEdit('stream_name')}
                                className="p-1 text-green-600 hover:text-green-700 dark:text-green-400"
                            >
                                <CheckIcon className="h-5 w-5" />
                            </button>
                            <button
                                onClick={cancelEditing}
                                className="p-1 text-red-600 hover:text-red-700 dark:text-red-400"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="text-gray-900 dark:text-white">
                            {config.stream_name || <span className="text-gray-400 italic">Not set</span>}
                        </div>
                    )}
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
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Stream Type {isHighlighted('stream_type') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                        </label>
                        {config.stream_type && editingField !== 'stream_type' && (
                            <button
                                onClick={() => startEditing('stream_type', config.stream_type)}
                                className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                <PencilIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {editingField === 'stream_type' ? (
                        <div className="flex gap-2">
                            <select
                                value={editValue || ''}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                            >
                                <option value="">Select type...</option>
                                <option value="competitive">Competitive</option>
                                <option value="regulatory">Regulatory</option>
                                <option value="clinical">Clinical</option>
                                <option value="market">Market</option>
                                <option value="scientific">Scientific</option>
                                <option value="mixed">Mixed</option>
                            </select>
                            <button
                                onClick={() => saveEdit('stream_type')}
                                className="p-1 text-green-600 hover:text-green-700 dark:text-green-400"
                            >
                                <CheckIcon className="h-5 w-5" />
                            </button>
                            <button
                                onClick={cancelEditing}
                                className="p-1 text-red-600 hover:text-red-700 dark:text-red-400"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="text-gray-900 dark:text-white capitalize">
                            {config.stream_type || <span className="text-gray-400 italic">Not set</span>}
                        </div>
                    )}
                </div>

                {/* Focus Areas */}
                <div className={getFieldClassName('focus_areas')}>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Focus Areas {isHighlighted('focus_areas') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                        </label>
                        {config.focus_areas && config.focus_areas.length > 0 && editingField !== 'focus_areas' && (
                            <button
                                onClick={() => startEditing('focus_areas', config.focus_areas?.join(', ') || '')}
                                className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                <PencilIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {editingField === 'focus_areas' ? (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editValue || ''}
                                onChange={(e) => setEditValue(e.target.value)}
                                placeholder="Enter areas separated by commas"
                                className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                            />
                            <button
                                onClick={() => saveEdit('focus_areas')}
                                className="p-1 text-green-600 hover:text-green-700 dark:text-green-400"
                            >
                                <CheckIcon className="h-5 w-5" />
                            </button>
                            <button
                                onClick={cancelEditing}
                                className="p-1 text-red-600 hover:text-red-700 dark:text-red-400"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ) : (
                        config.focus_areas && Array.isArray(config.focus_areas) && config.focus_areas.length > 0 ? (
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
                        )
                    )}
                </div>

                {/* Competitors */}
                <div className={getFieldClassName('competitors')}>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Competitors to Monitor {isHighlighted('competitors') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                        </label>
                        {config.competitors && config.competitors.length > 0 && editingField !== 'competitors' && (
                            <button
                                onClick={() => startEditing('competitors', config.competitors?.join(', ') || '')}
                                className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                <PencilIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {editingField === 'competitors' ? (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editValue || ''}
                                onChange={(e) => setEditValue(e.target.value)}
                                placeholder="Enter companies separated by commas"
                                className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                            />
                            <button
                                onClick={() => saveEdit('competitors')}
                                className="p-1 text-green-600 hover:text-green-700 dark:text-green-400"
                            >
                                <CheckIcon className="h-5 w-5" />
                            </button>
                            <button
                                onClick={cancelEditing}
                                className="p-1 text-red-600 hover:text-red-700 dark:text-red-400"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ) : (
                        config.competitors && Array.isArray(config.competitors) && config.competitors.length > 0 ? (
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
                        )
                    )}
                </div>

                {/* Report Frequency */}
                <div className={getFieldClassName('report_frequency')}>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Report Frequency {isHighlighted('report_frequency') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                        </label>
                        {config.report_frequency && editingField !== 'report_frequency' && (
                            <button
                                onClick={() => startEditing('report_frequency', config.report_frequency)}
                                className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                <PencilIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {editingField === 'report_frequency' ? (
                        <div className="flex gap-2">
                            <select
                                value={editValue || ''}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                            >
                                <option value="">Select frequency...</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Biweekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                            <button
                                onClick={() => saveEdit('report_frequency')}
                                className="p-1 text-green-600 hover:text-green-700 dark:text-green-400"
                            >
                                <CheckIcon className="h-5 w-5" />
                            </button>
                            <button
                                onClick={cancelEditing}
                                className="p-1 text-red-600 hover:text-red-700 dark:text-red-400"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="text-gray-900 dark:text-white capitalize">
                            {config.report_frequency || <span className="text-gray-400 italic">Not set</span>}
                        </div>
                    )}
                </div>

                {/* Phase 1 Fields Divider */}
                {(config.purpose || config.keywords || config.business_goals) && (
                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                            Enhanced Configuration
                        </h4>
                    </div>
                )}

                {/* Purpose */}
                {config.purpose && (
                    <div className={getFieldClassName('purpose')}>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Purpose {isHighlighted('purpose') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                            </label>
                            {editingField !== 'purpose' && (
                                <button
                                    onClick={() => startEditing('purpose', config.purpose)}
                                    className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    <PencilIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {editingField === 'purpose' ? (
                            <div className="flex gap-2">
                                <textarea
                                    value={editValue || ''}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    rows={3}
                                    className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    autoFocus
                                />
                                <div className="flex flex-col gap-1">
                                    <button
                                        onClick={() => saveEdit('purpose')}
                                        className="p-1 text-green-600 hover:text-green-700 dark:text-green-400"
                                    >
                                        <CheckIcon className="h-5 w-5" />
                                    </button>
                                    <button
                                        onClick={cancelEditing}
                                        className="p-1 text-red-600 hover:text-red-700 dark:text-red-400"
                                    >
                                        <XMarkIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-gray-900 dark:text-white">
                                {config.purpose}
                            </div>
                        )}
                    </div>
                )}

                {/* Business Goals */}
                {config.business_goals && config.business_goals.length > 0 && (
                    <div className={getFieldClassName('business_goals')}>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Business Goals {isHighlighted('business_goals') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                            </label>
                            {editingField !== 'business_goals' && (
                                <button
                                    onClick={() => startEditing('business_goals', config.business_goals?.join(', ') || '')}
                                    className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    <PencilIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {editingField === 'business_goals' ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={editValue || ''}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    placeholder="Enter goals separated by commas"
                                    className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    autoFocus
                                />
                                <button
                                    onClick={() => saveEdit('business_goals')}
                                    className="p-1 text-green-600 hover:text-green-700 dark:text-green-400"
                                >
                                    <CheckIcon className="h-5 w-5" />
                                </button>
                                <button
                                    onClick={cancelEditing}
                                    className="p-1 text-red-600 hover:text-red-700 dark:text-red-400"
                                >
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>
                        ) : (
                            <ul className="list-disc list-inside space-y-1 text-sm text-gray-900 dark:text-white">
                                {config.business_goals.map((goal, idx) => (
                                    <li key={idx}>{goal}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* Keywords */}
                {config.keywords && config.keywords.length > 0 && (
                    <div className={getFieldClassName('keywords')}>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Search Keywords {isHighlighted('keywords') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                            </label>
                            {editingField !== 'keywords' && (
                                <button
                                    onClick={() => startEditing('keywords', config.keywords?.join(', ') || '')}
                                    className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    <PencilIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {editingField === 'keywords' ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={editValue || ''}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    placeholder="Enter keywords separated by commas"
                                    className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    autoFocus
                                />
                                <button
                                    onClick={() => saveEdit('keywords')}
                                    className="p-1 text-green-600 hover:text-green-700 dark:text-green-400"
                                >
                                    <CheckIcon className="h-5 w-5" />
                                </button>
                                <button
                                    onClick={cancelEditing}
                                    className="p-1 text-red-600 hover:text-red-700 dark:text-red-400"
                                >
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {config.keywords.map((keyword, idx) => (
                                    <span
                                        key={idx}
                                        className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm"
                                    >
                                        {keyword}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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
        </div>
    );
}

function getCompletionPercentage(config: PartialStreamConfig): number {
    const requiredFields = [
        config.stream_name,
        config.stream_type,
        config.focus_areas?.length,
        config.report_frequency,
        config.purpose,
        config.keywords?.length
    ];

    const completed = requiredFields.filter(field => field).length;
    return Math.round((completed / requiredFields.length) * 100);
}
