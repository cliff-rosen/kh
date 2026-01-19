import { Category } from '../../types';
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

    const handleSpecificInclusionsChange = (index: number, value: string) => {
        // Don't trim during editing - preserve user input including spaces
        // Split by newlines but keep the raw text to preserve typing experience
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
        <div className="space-y-4">
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

            {categories.map((category, index) => (
                <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
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

                    {/* Specific Inclusions */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Inclusion Criteria
                        </label>
                        <textarea
                            placeholder="Describe what articles belong in this category (one criterion per line):

Example criteria:
- Any peer-reviewed research on disease mechanisms
- Population-based exposure studies
- Clinical trials involving human subjects
- Epidemiological studies with outcome data"
                            rows={6}
                            value={category.specific_inclusions.join('\n')}
                            onChange={(e) => handleSpecificInclusionsChange(index, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
