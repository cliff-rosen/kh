import React from 'react';
import { ArrayRenderer } from './ArrayRenderer';
import { TextRenderer } from './TextRenderer';
import { ObjectRenderer } from './ObjectRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import JsonRenderer from './JsonRenderer';
import { CanonicalTypeRenderer } from './CanonicalTypeRenderer';
import { isCanonicalType, CanonicalType } from '@/types/canonical_types';

export interface VariableRendererProps {
    value: any;
    schema?: any; // Optional schema information
    isMarkdown?: boolean;
    maxTextLength?: number;
    maxArrayItems?: number;
    maxArrayItemLength?: number;
    className?: string;
    useEnhancedJsonView?: boolean;
}

/**
 * A universal component for rendering variable values of different types.
 * Handles arrays, objects, text (including markdown), and primitive values.
 */
export const VariableRenderer: React.FC<VariableRendererProps> = ({
    value,
    schema,
    isMarkdown = false,
    maxTextLength = 200,
    maxArrayItems = 5,
    maxArrayItemLength = 100,
    className = '',
    useEnhancedJsonView = true
}) => {
    // Handle undefined or null values
    if (value === undefined || value === null) {
        return (
            <span className="text-gray-400 dark:text-gray-500 italic">
                Not set
            </span>
        );
    }

    // Check if this is a canonical type
    if (schema && isCanonicalType(schema.type)) {
        return (
            <CanonicalTypeRenderer
                data={value}
                type={schema.type as CanonicalType}
                isArray={schema.is_array}
                className={className}
            />
        );
    }

    // Check if this is an array of objects
    const isArrayOfObjects = Array.isArray(value) &&
        value.length > 0 &&
        value.every(item => typeof item === 'object' && item !== null);

    // Handle arrays
    if (Array.isArray(value)) {
        // Use JsonRenderer for arrays of objects or if enhanced JSON view is enabled
        if (isArrayOfObjects || useEnhancedJsonView) {
            return (
                <JsonRenderer
                    data={value}
                    maxInitialDepth={2} // Expand first two levels by default
                    className={className}
                />
            );
        }

        // Otherwise use the original ArrayRenderer
        return (
            <ArrayRenderer
                items={value}
                maxInitialItems={maxArrayItems}
                maxItemLength={maxArrayItemLength}
                className={className}
            />
        );
    }

    // Handle objects
    if (typeof value === 'object') {
        // Special handling for file objects
        if (schema?.type === 'file' && value.file_id) {
            return <span className={`text-blue-600 dark:text-blue-400 ${className}`}>File: {value.name || value.file_id}</span>;
        }

        // Use the enhanced JSON view for objects if enabled
        if (useEnhancedJsonView) {
            return (
                <JsonRenderer
                    data={value}
                    maxInitialDepth={2} // Expand first two levels by default
                    className={className}
                />
            );
        }

        // Otherwise use the original ObjectRenderer
        return <ObjectRenderer object={value} className={className} />;
    }

    // Handle text that should be rendered as markdown
    const stringValue = String(value);
    const hasMarkdownSyntax = /(\*|#|\||\n|```|>|-)/.test(stringValue);

    if (isMarkdown || hasMarkdownSyntax) {
        return (
            <div className={`h-full ${className}`}>
                <TextRenderer text={stringValue} maxLength={maxTextLength}>
                    {(text: string) => <MarkdownRenderer content={text} />}
                </TextRenderer>
            </div>
        );
    }

    // For simple primitive values
    return <span className={`text-gray-900 dark:text-gray-100 ${className}`}>{stringValue}</span>;
};

export default VariableRenderer; 