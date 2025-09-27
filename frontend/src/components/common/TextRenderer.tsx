import React, { useState } from 'react';

export interface TextRendererProps {
    text: string;
    maxLength?: number;
    className?: string;
    children?: (text: string) => React.ReactNode;
}

/**
 * Renders text with expandable functionality for long content.
 * Can use a render prop to customize how the text is displayed.
 */
export const TextRenderer: React.FC<TextRendererProps> = ({
    text,
    maxLength = 200,
    className = '',
    children
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const needsExpanding = text.length > maxLength;
    const displayText = needsExpanding && !isExpanded
        ? `${text.substring(0, maxLength)}...`
        : text;

    const toggleExpand = () => setIsExpanded(prev => !prev);

    return (
        <div className={`space-y-2 ${className}`}>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                {children
                    ? children(displayText)
                    : <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{displayText}</div>
                }
            </div>

            {needsExpanding && (
                <button
                    onClick={toggleExpand}
                    className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                >
                    {isExpanded ? "Show Less" : "Show More..."}
                </button>
            )}
        </div>
    );
};

export default TextRenderer; 