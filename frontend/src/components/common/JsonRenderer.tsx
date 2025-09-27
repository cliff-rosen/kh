import React, { useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, ChevronDown as ChevronDownIcon } from 'lucide-react';

export interface JsonRendererProps {
    data: any;
    className?: string;
    maxInitialDepth?: number;
    maxStringLength?: number;
}

/**
 * Helper function to parse JSON strings into objects
 */
const parseJsonIfString = (value: any): any => {
    if (typeof value === 'string') {
        try {
            // Check if the string looks like JSON
            if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
                return JSON.parse(value);
            }
        } catch (e) {
            // If parsing fails, return the original string
            return value;
        }
    }
    return value;
};

/**
 * Component to render a single node in the object tree
 */
const ObjectNode: React.FC<{
    data: any;
    name: string;
    initialExpanded?: boolean;
    level?: number;
    maxStringLength?: number;
}> = ({ data, name, initialExpanded = false, level = 0, maxStringLength = 100 }) => {
    const [expanded, setExpanded] = useState(initialExpanded);

    // Parse the data if it's a JSON string
    const parsedData = parseJsonIfString(data);

    // Determine the type of data for proper rendering
    const type = Array.isArray(parsedData) ? 'array' : typeof parsedData;
    const isExpandable = ['object', 'array'].includes(type) && parsedData !== null;
    const isEmpty = isExpandable && (Object.keys(parsedData).length === 0);

    // For handling text values that might be very long
    const isLongText = type === 'string' && parsedData.length > maxStringLength;
    const [textExpanded, setTextExpanded] = useState(false);

    return (
        <div className="w-full">
            <div
                className={`flex items-start py-1 px-2 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${level > 0 ? 'border-t-0' : ''}`}
                style={{ paddingLeft: `${level * 16}px` }}
            >
                {isExpandable ? (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="mr-1 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none flex-shrink-0"
                    >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                ) : (
                    <span className="w-5 flex-shrink-0"></span>
                )}

                <div className="flex-grow min-w-0">
                    <div className="flex items-start">
                        <span className="font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">{name}</span>
                        <span className="mx-1 text-gray-400 dark:text-gray-500 flex-shrink-0">:</span>

                        {!isExpandable && !isLongText && (
                            <span className={`${type === 'number' ? 'text-blue-600 dark:text-blue-400' : ''} ${type === 'boolean' ? 'text-purple-600 dark:text-purple-400' : ''} ${type === 'string' ? 'text-green-600 dark:text-green-400' : ''} ${parsedData === null ? 'text-gray-500 dark:text-gray-400 italic' : ''} break-words`}>
                                {parsedData === null ? 'null' :
                                    type === 'string' ? `"${parsedData}"` :
                                        String(parsedData)}
                            </span>
                        )}

                        {isExpandable && (
                            <span className="text-gray-500 dark:text-gray-400 italic flex-shrink-0">
                                {type === 'array' ? `Array(${Object.keys(parsedData).length})` : `Object{${Object.keys(parsedData).length}}`}
                                {isEmpty && ' empty'}
                            </span>
                        )}

                        {isLongText && (
                            <div className="group relative flex-grow">
                                <button
                                    onClick={() => setTextExpanded(!textExpanded)}
                                    className="w-full text-left rounded px-2 py-1 transition-colors"
                                >
                                    <div className="flex items-start justify-between">
                                        <span className="text-green-600 dark:text-green-400 break-words flex-grow">
                                            {`"${textExpanded ? parsedData : parsedData.substring(0, maxStringLength) + '...'}"`}
                                        </span>
                                        <span className="ml-2 flex-shrink-0 text-gray-400 dark:text-gray-500">
                                            {textExpanded ? <ChevronUp size={16} /> : <ChevronDownIcon size={16} />}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        {textExpanded ? 'Click to collapse' : 'Click to expand'}
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isExpandable && expanded && !isEmpty && (
                <div>
                    {type === 'array' ? (
                        // Render array items
                        (parsedData as any[]).map((item: any, index: number) => (
                            <ObjectNode
                                key={index}
                                data={item}
                                name={`[${index}]`}
                                level={level + 1}
                                maxStringLength={maxStringLength}
                            />
                        ))
                    ) : (
                        // Render object properties
                        Object.entries(parsedData).map(([key, value]) => (
                            <ObjectNode
                                key={key}
                                data={value}
                                name={key}
                                level={level + 1}
                                maxStringLength={maxStringLength}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * An enhanced JSON renderer component that provides interactive visualization
 * of JSON objects and arrays with collapsible properties and long strings.
 */
export const JsonRenderer: React.FC<JsonRendererProps> = ({
    data,
    className = '',
    maxInitialDepth = 2,
    maxStringLength = 100
}) => {
    if (maxInitialDepth === 0)
        console.log('maxInitialDepth', maxInitialDepth);

    // If the data is empty, show a message
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        return <span className="text-gray-500 dark:text-gray-400 italic">Empty data</span>;
    }

    return (
        <div className={`h-full ${className}`}>
            <div className="h-full p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-auto">
                <ObjectNode
                    data={data}
                    name="root"
                    initialExpanded={true}
                    maxStringLength={maxStringLength}
                />
            </div>
        </div>
    );
};

export default JsonRenderer; 