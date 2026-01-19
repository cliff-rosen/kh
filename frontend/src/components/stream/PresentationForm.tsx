import { useState } from 'react';
import { Category } from '../../types';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface PresentationFormProps {
    categories: Category[];
    onChange: (updated: Category[]) => void;
}

export default function PresentationForm({ categories, onChange }: PresentationFormProps) {
    // Track which categories have expanded inclusion criteria
    const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

    const toggleExpanded = (index: number) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const addCategory = () => {
        onChange([
            ...categories,
            {
                id: '',
                name: '',
                topics: [],
                specific_inclusions: []
            }
        ]);
    };

    const removeCategory = (index: number) => {
        if (categories.length === 1) {
            alert('At least one category is required');
            return;
        }
        onChange(categories.filter((_, i) => i !== index));
    };

    const updateCategory = (index: number, field: keyof Category, value: any) => {
        const updated = [...categories];
        updated[index] = { ...updated[index], [field]: value };
        onChange(updated);
    };

    const handleSpecificInclusionsChange = (index: number, value: string) => {
        // Don't trim during editing - preserve user input including spaces
        const inclusions = value.split('\n');
        updateCategory(index, 'specific_inclusions', inclusions);
    };

    const generateCategoryId = (name: string): string => {
        return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    };

    const handleCategoryNameChange = (index: number, value: string) => {
        const updated = [...categories];
        updated[index] = {
            ...updated[index],
            name: value,
            id: generateCategoryId(value)
        };
        onChange(updated);
    };

    return (
        <div className="space-y-3">
            {/* Categories Header */}
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Presentation Categories
                </label>
                <button
                    type="button"
                    onClick={addCategory}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                >
                    <PlusIcon className="h-4 w-4" />
                    Add Category
                </button>
            </div>

            {categories.map((category, index) => {
                const isExpanded = expandedCategories.has(index);
                const hasInclusions = category.specific_inclusions.filter(s => s.trim()).length > 0;

                return (
                    <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                        {/* Category header row */}
                        <div className="flex items-center gap-3">
                            {/* Expand/collapse button */}
                            <button
                                type="button"
                                onClick={() => toggleExpanded(index)}
                                className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            >
                                {isExpanded ? (
                                    <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                                ) : (
                                    <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                                )}
                            </button>

                            {/* Category name input */}
                            <input
                                type="text"
                                placeholder="Category name"
                                value={category.name}
                                onChange={(e) => handleCategoryNameChange(index, e.target.value)}
                                className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                required
                            />

                            {/* Inclusion count badge */}
                            {hasInclusions && !isExpanded && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                                    {category.specific_inclusions.filter(s => s.trim()).length} criteria
                                </span>
                            )}

                            {/* Delete button */}
                            {categories.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeCategory(index)}
                                    className="flex-shrink-0 text-red-600 dark:text-red-400 hover:text-red-700 p-1"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {/* ID display */}
                        {category.id && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 ml-9 mt-1">
                                ID: {category.id}
                            </p>
                        )}

                        {/* Expanded content - Inclusion Criteria */}
                        {isExpanded && (
                            <div className="mt-3 ml-9">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Inclusion Criteria
                                </label>
                                <textarea
                                    placeholder="What articles belong in this category (one criterion per line)"
                                    rows={4}
                                    value={category.specific_inclusions.join('\n')}
                                    onChange={(e) => handleSpecificInclusionsChange(index, e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
