import { useState } from 'react';
import { StreamInProgress } from '../types/stream-building';
import { PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface StreamConfigPreviewProps {
    config: StreamInProgress;
    highlightedField?: string | null;
    onUpdateField?: (fieldName: string, value: any) => void;
}

export default function StreamConfigPreview({ config, highlightedField, onUpdateField }: StreamConfigPreviewProps) {
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<any>(null);

    const isHighlighted = (fieldName: string) => highlightedField === fieldName;

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
            onUpdateField(fieldName, editValue);
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
                {/* 1. Stream Name */}
                <div className={getFieldClassName('stream_name')}>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Stream Name * {isHighlighted('stream_name') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
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
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                            />
                            <button onClick={() => saveEdit('stream_name')} className="p-1 text-green-600 hover:text-green-700">
                                <CheckIcon className="h-5 w-5" />
                            </button>
                            <button onClick={cancelEditing} className="p-1 text-red-600 hover:text-red-700">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="text-gray-900 dark:text-white font-medium">
                            {config.stream_name || <span className="text-gray-400 italic font-normal">Not set</span>}
                        </div>
                    )}
                </div>

                {/* 2. Purpose */}
                <div className={getFieldClassName('purpose')}>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Purpose * {isHighlighted('purpose') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                        </label>
                        {config.purpose && editingField !== 'purpose' && (
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
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                placeholder="What's the purpose? What decisions will this inform?"
                                autoFocus
                            />
                            <div className="flex flex-col gap-1">
                                <button onClick={() => saveEdit('purpose')} className="p-1 text-green-600 hover:text-green-700">
                                    <CheckIcon className="h-5 w-5" />
                                </button>
                                <button onClick={cancelEditing} className="p-1 text-red-600 hover:text-red-700">
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-gray-900 dark:text-white">
                            {config.purpose || <span className="text-gray-400 italic">Not set</span>}
                        </div>
                    )}
                </div>

                {/* 3. Channels */}
                <div className={getFieldClassName('channels')}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Monitoring Channels * {isHighlighted('channels') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
                    </label>
                    {config.channels && Array.isArray(config.channels) && config.channels.length > 0 ? (
                        <div className="space-y-3">
                            {config.channels.map((channel, idx) => (
                                <div key={idx} className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                            Channel {idx + 1}: {channel.name || <span className="text-gray-400 italic">Unnamed</span>}
                                        </h4>
                                        {channel.type && (
                                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs capitalize">
                                                {channel.type}
                                            </span>
                                        )}
                                    </div>

                                    {channel.focus && (
                                        <div className="mb-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Focus:</span>
                                            <p className="text-sm text-gray-900 dark:text-white mt-1">{channel.focus}</p>
                                        </div>
                                    )}

                                    {channel.keywords && channel.keywords.length > 0 && (
                                        <div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Keywords:</span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {channel.keywords.map((keyword, kidx) => (
                                                    <span key={kidx} className="px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs">
                                                        {keyword}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {!channel.name && !channel.focus && !channel.type && (!channel.keywords || channel.keywords.length === 0) && (
                                        <span className="text-gray-400 italic text-sm">Channel incomplete</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-gray-400 italic text-sm">No channels added</span>
                    )}
                </div>

                {/* 4. Report Frequency */}
                <div className={getFieldClassName('report_frequency')}>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Report Frequency * {isHighlighted('report_frequency') && <span className="text-blue-600 dark:text-blue-400 text-xs">(selecting...)</span>}
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
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                            >
                                <option value="">Select frequency...</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Bi-weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                            <button onClick={() => saveEdit('report_frequency')} className="p-1 text-green-600 hover:text-green-700">
                                <CheckIcon className="h-5 w-5" />
                            </button>
                            <button onClick={cancelEditing} className="p-1 text-red-600 hover:text-red-700">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="text-gray-900 dark:text-white capitalize">
                            {config.report_frequency || <span className="text-gray-400 italic">Not set</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* Progress Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Configuration Progress</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{getCompletionPercentage(config)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${getCompletionPercentage(config)}%` }}
                    ></div>
                </div>
            </div>
        </div>
    );
}

function getCompletionPercentage(config: StreamInProgress): number {
    const requiredFields = [
        config.stream_name,
        config.purpose,
        config.channels?.length && config.channels.length > 0,
        config.report_frequency
    ];

    // Check if channels are complete
    let channelsComplete = false;
    if (config.channels && config.channels.length > 0) {
        channelsComplete = config.channels.every(ch =>
            ch.name && ch.focus && ch.type && ch.keywords && ch.keywords.length > 0
        );
    }

    const completed = requiredFields.filter(field => field).length;
    const total = requiredFields.length;

    // Adjust for channel completeness
    let percentage = (completed / total) * 100;
    if (config.channels?.length && !channelsComplete) {
        percentage = percentage * 0.8; // Reduce percentage if channels are incomplete
    }

    return Math.round(percentage);
}
