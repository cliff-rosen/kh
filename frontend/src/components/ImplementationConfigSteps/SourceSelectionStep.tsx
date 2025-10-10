import { useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { useImplementationConfig } from '../../context/ImplementationConfigContext';

export default function SourceSelectionStep() {
    const { availableSources, currentChannel, selectedSources, selectSources } = useImplementationConfig();
    const [tempSelected, setTempSelected] = useState<Set<string>>(new Set(selectedSources));

    const toggleSource = (sourceId: string) => {
        const newSelected = new Set(tempSelected);
        if (newSelected.has(sourceId)) {
            newSelected.delete(sourceId);
        } else {
            newSelected.add(sourceId);
        }
        setTempSelected(newSelected);
    };

    const handleContinue = () => {
        if (tempSelected.size === 0) {
            alert('Please select at least one source');
            return;
        }
        selectSources(Array.from(tempSelected));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Select Information Sources
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Choose which sources you want to configure for this channel. You'll create and test query expressions for each selected source.
                </p>
            </div>

            {/* Source Selection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableSources.map((source) => {
                    const isSelected = tempSelected.has(source.source_id);

                    return (
                        <div
                            key={source.source_id}
                            onClick={() => toggleSource(source.source_id)}
                            className={`
                                relative border-2 rounded-lg p-4 cursor-pointer transition-all
                                ${isSelected
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                                }
                            `}
                        >
                            {/* Checkmark indicator */}
                            <div className={`
                                absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center
                                ${isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700'
                                }
                            `}>
                                {isSelected && <CheckIcon className="h-4 w-4" />}
                            </div>

                            {/* Source Info */}
                            <div className="pr-8">
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                                    {source.name}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {source.description}
                                </p>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                                        {source.source_type}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {source.query_syntax}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Selection Summary */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Selected Sources: {tempSelected.size}
                        </p>
                        {tempSelected.size > 0 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                You'll configure {tempSelected.size} query expression{tempSelected.size > 1 ? 's' : ''}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleContinue}
                        disabled={tempSelected.size === 0}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Continue
                    </button>
                </div>
            </div>
        </div>
    );
}
