import { CheckIcon, XMarkIcon, RectangleStackIcon } from '@heroicons/react/24/solid';

interface CategoryItem {
    id: string;
    name: string;
    description: string;
    topics: string[];
    specific_inclusions: string[];
}

export interface PresentationConfigProposalData {
    categories: CategoryItem[];
}

interface PresentationConfigProposalCardProps {
    data: PresentationConfigProposalData;
    onAccept?: (data: PresentationConfigProposalData) => void;
    onReject?: () => void;
}

export default function PresentationConfigProposalCard({ data, onAccept, onReject }: PresentationConfigProposalCardProps) {
    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <RectangleStackIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                        Presentation Categories Proposal
                    </h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {data.categories.length} categories for organizing report results
                </p>
            </div>

            {/* Categories */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                    Categories ({data.categories.length})
                </p>
                <div className="space-y-3">
                    {data.categories.map((cat, idx) => (
                        <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                            <div className="flex items-start justify-between mb-1">
                                <p className="font-medium text-gray-900 dark:text-white">
                                    {cat.name}
                                </p>
                                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2 font-mono">
                                    {cat.id}
                                </span>
                            </div>
                            {cat.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {cat.description}
                                </p>
                            )}
                            {cat.topics.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {cat.topics.map((topic, tidx) => (
                                        <span key={tidx} className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                                            {topic}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                {onAccept && (
                    <button
                        onClick={() => onAccept(data)}
                        className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <CheckIcon className="h-5 w-5" />
                        Accept Categories
                    </button>
                )}
                {onReject && (
                    <button
                        onClick={onReject}
                        className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <XMarkIcon className="h-5 w-5" />
                        Dismiss
                    </button>
                )}
            </div>
        </div>
    );
}
