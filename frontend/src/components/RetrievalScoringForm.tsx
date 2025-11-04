import { ScoringConfig, WorkflowConfig } from '../types';

interface RetrievalScoringFormProps {
    scoringConfig: ScoringConfig;
    workflowConfig: WorkflowConfig;
    onScoringChange: (updated: ScoringConfig) => void;
    onWorkflowChange: (updated: WorkflowConfig) => void;
}

export default function RetrievalScoringForm({
    scoringConfig,
    workflowConfig,
    onScoringChange,
    onWorkflowChange
}: RetrievalScoringFormProps) {
    const updateScoringField = (field: keyof ScoringConfig, value: number) => {
        onScoringChange({
            ...scoringConfig,
            [field]: value
        });
    };

    const updateWorkflowField = (field: keyof WorkflowConfig, value: any) => {
        onWorkflowChange({
            ...workflowConfig,
            [field]: value
        });
    };

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                    Layer 2: Retrieval & Scoring
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    Configure how content is retrieved and filtered. This should be derived from your semantic space to ensure comprehensive coverage.
                </p>
            </div>

            {/* Workflow Configuration */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Workflow Configuration
                </h3>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Article Limit per Week
                    </label>
                    <input
                        type="number"
                        min="1"
                        value={workflowConfig.article_limit_per_week}
                        onChange={(e) => updateWorkflowField('article_limit_per_week', parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Maximum number of articles to retrieve per week (default: 10)
                    </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                        Category-specific workflow configuration will be available after creating the stream. You'll be guided through source selection and query configuration for each category.
                    </p>
                </div>
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
                            onChange={(e) => updateScoringField('relevance_weight', parseFloat(e.target.value))}
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
                            onChange={(e) => updateScoringField('evidence_weight', parseFloat(e.target.value))}
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
                            onChange={(e) => updateScoringField('inclusion_threshold', parseFloat(e.target.value))}
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
                            onChange={(e) => updateScoringField('max_items_per_report', parseInt(e.target.value))}
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
