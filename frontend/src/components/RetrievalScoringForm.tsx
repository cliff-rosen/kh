import { ScoringConfig } from '../types';

interface RetrievalScoringFormProps {
    scoringConfig: ScoringConfig;
    onChange: (updated: ScoringConfig) => void;
}

export default function RetrievalScoringForm({ scoringConfig, onChange }: RetrievalScoringFormProps) {
    const updateField = (field: keyof ScoringConfig, value: number) => {
        onChange({
            ...scoringConfig,
            [field]: value
        });
    };

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    Workflow configuration will be available after creating the stream. You'll be guided through source selection and query configuration for each category.
                </p>
            </div>

            {/* Scoring Configuration */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Scoring Configuration
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Relevance Weight (0-1)
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={scoringConfig.relevance_weight}
                            onChange={(e) => updateField('relevance_weight', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Weight for relevance to research programs (default: 0.6)
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Evidence Weight (0-1)
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={scoringConfig.evidence_weight}
                            onChange={(e) => updateField('evidence_weight', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Weight for evidence quality (default: 0.4)
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Inclusion Threshold (1-10)
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            step="0.5"
                            value={scoringConfig.inclusion_threshold}
                            onChange={(e) => updateField('inclusion_threshold', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Minimum integrated score for inclusion (default: 7.0)
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Max Items per Report
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={scoringConfig.max_items_per_report}
                            onChange={(e) => updateField('max_items_per_report', parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Maximum articles to include per report (default: 10)
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
