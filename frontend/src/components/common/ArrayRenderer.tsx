import React, { useState } from 'react';
import { ObjectRenderer } from './ObjectRenderer';
import { TextRenderer } from './TextRenderer';

export interface ArrayRendererProps {
    items: any[];
    maxInitialItems?: number;
    className?: string;
    maxItemLength?: number;
}

/**
 * Renders an array of items with expandable functionality.
 * Shows a limited number of items initially with a "Show More" button.
 */
export const ArrayRenderer: React.FC<ArrayRendererProps> = ({
    items,
    maxInitialItems = 5,
    className = '',
    maxItemLength = 100
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!items.length) {
        return <span className="text-gray-500 dark:text-gray-400 italic">Empty array</span>;
    }

    // Check if this is an array of objects (special case that needs enhanced handling)
    const isArrayOfObjects = items.length > 0 &&
        items.every(item => typeof item === 'object' && item !== null);

    const displayItems = isExpanded ? items : items.slice(0, maxInitialItems);
    const hasMore = items.length > maxInitialItems;

    const toggleExpand = () => setIsExpanded(prev => !prev);

    // Helper function to render an individual item based on its type
    const renderItem = (item: any, _index: number) => {
        // For objects, use the ObjectRenderer with a smaller max properties setting
        if (typeof item === 'object' && item !== null) {
            return <ObjectRenderer object={item} maxInitialProperties={3} />;
        }

        // For strings, use TextRenderer to handle long text
        if (typeof item === 'string') {
            return (
                <TextRenderer text={item} maxLength={maxItemLength}>
                    {(text: string) => (
                        <span className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{text}</span>
                    )}
                </TextRenderer>
            );
        }

        // For other primitive types, convert to string
        return <span className="text-gray-800 dark:text-gray-200">{String(item)}</span>;
    };

    return (
        <div className={`space-y-2 rounded-md ${className}`}>
            {isArrayOfObjects && (
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Array of {items.length} objects with properties:
                    {Object.keys(items[0]).slice(0, 3).join(', ')}
                    {Object.keys(items[0]).length > 3 ? '...' : ''}
                </div>
            )}

            <div className="space-y-2 pl-1 border-l-2 border-gray-200 dark:border-gray-700">
                {displayItems.map((item, index) => (
                    <div
                        key={index}
                        className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                    >
                        <div className="flex items-start">
                            <span className="inline-block px-1.5 py-0.5 mr-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
                                {index + 1}
                            </span>
                            <div className="flex-1 overflow-hidden">
                                {renderItem(item, index)}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {hasMore && (
                <button
                    onClick={toggleExpand}
                    className="mt-2 px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                >
                    {isExpanded
                        ? "Show Less"
                        : `Show ${items.length - maxInitialItems} More Items...`}
                </button>
            )}
        </div>
    );
};

export default ArrayRenderer; 