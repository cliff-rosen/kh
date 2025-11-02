import { Category } from '../types';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface PresentationFormProps {
    categories: Category[];
    onChange: (updated: Category[]) => void;
}

export default function PresentationForm({ categories, onChange }: PresentationFormProps) {
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

    const handleTopicsChange = (index: number, value: string) => {
        const topics = value.split(',').map(s => s.trim()).filter(s => s);
        updateCategory(index, 'topics', topics);
    };

    const handleSpecificInclusionsChange = (index: number, value: string) => {
        const inclusions = value.split('\n').map(s => s.trim()).filter(s => s);
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
        <div className="space-y-6">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-green-900 dark:text-green-200 mb-2">
                    Layer 3: Presentation Taxonomy
                </h3>
                <p className="text-sm text-green-800 dark:text-green-300">
                    Define categories for organizing results in reports. These should be derived from your semantic space and optimized for how users consume information.
                </p>
            </div>

            {/* Categories */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Presentation Categories *
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
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Categories organize results for user consumption and decision-making
                </p>

                {categories.map((category, index) => (
                    <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                Category {index + 1}
                            </h3>
                            {categories.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeCategory(index)}
                                    className="text-red-600 dark:text-red-400 hover:text-red-700"
                                >
                                    <TrashIcon className="h-5 w-5" />
                                </button>
                            )}
                        </div>

                        {/* Category Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Category Name *
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., Medical & Health Sciences"
                                value={category.name}
                                onChange={(e) => handleCategoryNameChange(index, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                required
                            />
                            {category.id && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    ID: {category.id}
                                </p>
                            )}
                        </div>

                        {/* Topics */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Topics *
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., Mesothelioma research, Lung cancer research, Disease pathology"
                                value={category.topics.join(', ')}
                                onChange={(e) => handleTopicsChange(index, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                required
                            />
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Topics covered by this category (comma-separated)
                            </p>
                        </div>

                        {/* Specific Inclusions */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Specific Inclusion Criteria
                            </label>
                            <textarea
                                placeholder="One criterion per line, e.g.:\nAny peer-reviewed research on disease mechanisms\nPopulation-based exposure studies"
                                rows={3}
                                value={category.specific_inclusions.join('\n')}
                                onChange={(e) => handleSpecificInclusionsChange(index, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Category-specific inclusion rules (one per line)
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
