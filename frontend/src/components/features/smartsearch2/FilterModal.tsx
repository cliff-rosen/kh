import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { X, Filter } from 'lucide-react';

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (filterCriteria: string) => void;
    initialValue?: string;
    title?: string;
    description?: string;
    // Article count information
    currentArticleCount?: number;
    totalAvailable?: number;
    maxArticlesToFilter?: number;
}

export function FilterModal({
    isOpen,
    onClose,
    onConfirm,
    initialValue = '',
    title = 'AI Filter',
    description = 'Define what types of articles you want to keep from your search results.',
    currentArticleCount = 0,
    totalAvailable = 0,
    maxArticlesToFilter = 500
}: FilterModalProps) {
    const [filterCriteria, setFilterCriteria] = useState('');
    const [isValid, setIsValid] = useState(false);

    // Calculate how many articles will actually be filtered
    const articlesToFilter = Math.min(totalAvailable, maxArticlesToFilter);
    const willHitLimit = totalAvailable > maxArticlesToFilter;
    const needsAutoRetrieval = currentArticleCount < articlesToFilter;

    // Initialize with default value when modal opens
    useEffect(() => {
        if (isOpen) {
            setFilterCriteria(initialValue);
            setIsValid(!!initialValue.trim());
        }
    }, [isOpen, initialValue]);

    if (!isOpen) return null;

    const handleFilterCriteriaChange = (value: string) => {
        setFilterCriteria(value);
        setIsValid(value.trim().length > 0);
    };

    const handleConfirm = () => {
        if (isValid) {
            onConfirm(filterCriteria.trim());
        }
    };

    const handleCancel = () => {
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Filter className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            {title}
                        </h2>
                    </div>
                    <button
                        onClick={handleCancel}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 flex flex-col">
                    <div className="mb-4">
                        <p className="text-gray-600 dark:text-gray-400">
                            {description}
                        </p>
                    </div>

                    {/* Article Count Information */}
                    {totalAvailable > 0 && (
                        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <div className="flex items-start gap-3">
                                <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                <div className="text-sm">
                                    <p className="text-blue-900 dark:text-blue-100 font-medium mb-1">
                                        Filtering Information
                                    </p>
                                    <div className="text-blue-700 dark:text-blue-200 space-y-1">
                                        <p>
                                            <strong>{articlesToFilter.toLocaleString()}</strong> articles will be filtered
                                            {willHitLimit && (
                                                <span className="text-blue-600 dark:text-blue-300"> (limited from {totalAvailable.toLocaleString()} total available)</span>
                                            )}
                                        </p>
                                        {needsAutoRetrieval && (
                                            <p>
                                                Auto-retrieval: {(articlesToFilter - currentArticleCount).toLocaleString()} additional articles will be fetched
                                            </p>
                                        )}
                                        <p className="text-xs text-blue-600 dark:text-blue-400">
                                            Currently loaded: {currentArticleCount.toLocaleString()} • Total available: {totalAvailable.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 flex flex-col">
                        <Label htmlFor="filter-criteria" className="text-sm font-medium mb-3 block">
                            Filter Criteria
                        </Label>
                        <Textarea
                            id="filter-criteria"
                            value={filterCriteria}
                            onChange={(e) => handleFilterCriteriaChange(e.target.value)}
                            className="flex-1 min-h-[300px] dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 resize-none"
                            placeholder="Examples:

• Studies examining the effectiveness of meditation on anxiety levels in adults, including randomized controlled trials and meta-analyses published in the last 10 years.

• Research on machine learning applications in medical diagnosis, focusing on peer-reviewed studies with clinical validation.

• Clinical trials investigating the safety and efficacy of new cancer immunotherapy treatments."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!isValid}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        Apply Filter
                    </Button>
                </div>
            </div>
        </div>
    );
}