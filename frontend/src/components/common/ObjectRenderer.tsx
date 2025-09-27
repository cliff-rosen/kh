import React, { useState } from 'react';

export interface ObjectRendererProps {
    object: Record<string, any>;
    maxInitialProperties?: number;
    className?: string;
}

/**
 * Renders a JavaScript object with syntax highlighting and expandable properties.
 */
export const ObjectRenderer: React.FC<ObjectRendererProps> = ({
    object,
    maxInitialProperties = 5,
    className = ''
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Convert object to formatted JSON string
    const formattedJson = JSON.stringify(object, null, 2);

    // Get all entries and determine if we need to truncate
    const entries = Object.entries(object);
    const hasMoreProperties = entries.length > maxInitialProperties;
    const displayEntries = isExpanded
        ? entries
        : entries.slice(0, maxInitialProperties);

    const toggleExpand = () => setIsExpanded(prev => !prev);

    // For empty objects
    if (entries.length === 0) {
        return <span className="text-gray-500 dark:text-gray-400 italic">Empty object</span>;
    }

    // Helper function to format a value for display
    const formatValue = (value: any): string => {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';

        if (typeof value === 'object') {
            if (Array.isArray(value)) {
                if (value.length === 0) return 'Empty array';

                // Check if it's an array of objects
                const isArrayOfObjects = value.length > 0 &&
                    value.every(item => typeof item === 'object' && item !== null);

                if (isArrayOfObjects) {
                    return `Array of ${value.length} objects`;
                }

                // For small arrays of primitives, show the values
                if (value.length <= 3 && value.every(item => typeof item !== 'object')) {
                    return `[${value.map(item => formatValue(item)).join(', ')}]`;
                }

                return `Array(${value.length})`;
            }

            // For regular objects
            const keys = Object.keys(value);
            if (keys.length === 0) return 'Empty object';

            // Show a preview of the first few keys
            if (keys.length <= 3) {
                return `{ ${keys.map(k => `${k}: ${formatSimpleValue(value[k])}`).join(', ')} }`;
            }

            return `Object(${keys.length} properties)`;
        }

        return String(value);
    };

    // Helper function for formatting simple values (used in object previews)
    const formatSimpleValue = (value: any): string => {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'object') {
            return Array.isArray(value) ? `Array(${value.length})` : 'Object';
        }
        if (typeof value === 'string') {
            return value.length > 10 ? `"${value.substring(0, 10)}..."` : `"${value}"`;
        }
        return String(value);
    };

    return (
        <div className={`space-y-2 ${className}`}>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                <div className="space-y-1">
                    {displayEntries.map(([key, value]) => (
                        <div key={key} className="grid grid-cols-12 gap-2">
                            <div className="col-span-4 truncate font-medium text-blue-600 dark:text-blue-400">
                                {key}:
                            </div>
                            <div className="col-span-8 text-gray-800 dark:text-gray-200 truncate">
                                {formatValue(value)}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Show full JSON on hover or click */}
                <details className="mt-3">
                    <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                        View raw JSON
                    </summary>
                    <pre className="text-xs overflow-x-auto p-2 mt-2 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
                        {formattedJson}
                    </pre>
                </details>
            </div>

            {hasMoreProperties && (
                <button
                    onClick={toggleExpand}
                    className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                >
                    {isExpanded
                        ? "Show Less"
                        : `Show ${entries.length - maxInitialProperties} More Properties...`}
                </button>
            )}
        </div>
    );
};

export default ObjectRenderer; 