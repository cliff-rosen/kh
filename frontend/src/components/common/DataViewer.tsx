import React, { useState } from 'react';
import { VariableRenderer } from './VariableRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';

interface DataViewerProps {
    data: any;
    title?: string;
    isMarkdown?: boolean;
    initiallyExpanded?: boolean;
    maxHeight?: number;
    className?: string;
    isInline?: boolean;
}

/**
 * Enhanced data viewer component for displaying job inputs and outputs
 * with better expand/collapse functionality and improved visualization
 */
export const DataViewer: React.FC<DataViewerProps> = ({
    data,
    title,
    isMarkdown = false,
    initiallyExpanded = false,
    maxHeight = 300,
    className = '',
    isInline = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

    // Determine if the data is complex (object or array)
    const isComplexData = data !== null && typeof data === 'object';

    // Determine if the data is large enough to warrant collapsing
    const isLargeData = isComplexData && (
        (Array.isArray(data) && data.length > 3) ||
        (!Array.isArray(data) && Object.keys(data).length > 5) ||
        (typeof data === 'string' && data.length > 200)
    );

    // Determine if we should show the expand/collapse toggle
    const showToggle = isLargeData;

    // Format the data for display in the collapsed state
    const getCollapsedPreview = () => {
        if (Array.isArray(data)) {
            return `Array[${data.length}]`;
        } else if (typeof data === 'object' && data !== null) {
            return `Object{${Object.keys(data).length} properties}`;
        } else if (typeof data === 'string' && data.length > 100) {
            return `${data.substring(0, 100)}...`;
        }
        return String(data);
    };

    // For simple inline display (used in evaluation results)
    if (isInline && !isComplexData) {
        return (
            <span className={`text-gray-700 dark:text-gray-300 ${className}`}>
                {String(data)}
            </span>
        );
    }

    return (
        <div className={`${isInline ? '' : 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'} overflow-hidden ${className}`}>
            {/* Header with title and expand/collapse toggle */}
            {(title || showToggle) && (
                <div className={`flex items-center justify-between ${isInline ? 'py-1' : 'px-4 py-2 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700'}`}>
                    {title && (
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {title}
                        </h3>
                    )}
                    {showToggle && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="flex items-center text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                            {isExpanded ? 'Collapse' : 'Expand'}
                            <svg
                                className={`ml-1 h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    )}
                </div>
            )}

            {/* Content area */}
            <div className={`${isInline ? 'py-0' : 'p-4'} ${isExpanded ? '' : 'relative'}`}>
                {/* Collapsed view */}
                {!isExpanded && isLargeData ? (
                    <div
                        className="cursor-pointer text-gray-700 dark:text-gray-300"
                        onClick={() => setIsExpanded(true)}
                    >
                        <div className="flex items-center">
                            <span className="text-gray-600 dark:text-gray-400">{getCollapsedPreview()}</span>
                            <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(click to expand)</span>
                        </div>
                    </div>
                ) : (
                    // Expanded view
                    <div
                        className={`${isExpanded && isLargeData ? `max-h-[${maxHeight}px] overflow-y-auto` : ''}`}
                    >
                        {isMarkdown && typeof data === 'string' ? (
                            <MarkdownRenderer content={data} />
                        ) : (
                            <VariableRenderer
                                value={data}
                                isMarkdown={isMarkdown}
                                maxArrayItems={isExpanded ? 20 : 5}
                                maxTextLength={isExpanded ? 2000 : 200}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DataViewer; 