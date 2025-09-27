import React, { useState } from 'react';
import { SchemaType } from '@/types/base';
import {
    isCanonicalType,
    getCanonicalTypeName,
    resolveCanonicalSchema
} from '@/types/canonical_types';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface SchemaRendererProps {
    schema: SchemaType;
    depth?: number;
    compact?: boolean;
}

export const SchemaRenderer: React.FC<SchemaRendererProps> = ({
    schema,
    depth = 0,
    compact = false
}) => {
    const [isExpanded, setIsExpanded] = useState(depth < 2); // Auto-expand first 2 levels

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'string': return 'text-green-600 dark:text-green-400';
            case 'number': return 'text-blue-600 dark:text-blue-400';
            case 'boolean': return 'text-purple-600 dark:text-purple-400';
            case 'object': return 'text-orange-600 dark:text-orange-400';
            // Custom canonical types
            case 'email': return 'text-indigo-600 dark:text-indigo-400';
            case 'search_result': return 'text-cyan-600 dark:text-cyan-400';
            case 'webpage': return 'text-teal-600 dark:text-teal-400';
            case 'pubmed_article': return 'text-emerald-600 dark:text-emerald-400';
            case 'newsletter': return 'text-yellow-600 dark:text-yellow-400';
            case 'daily_newsletter_recap': return 'text-rose-600 dark:text-rose-400';
            default: return 'text-gray-600 dark:text-gray-400';
        }
    };

    const getTypeName = (type: string) => {
        if (isCanonicalType(type)) {
            return getCanonicalTypeName(type as any);
        }
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    // Resolve canonical types to their full structure
    const resolvedSchema = React.useMemo(() => {
        if (isCanonicalType(schema.type) && (!schema.fields || Object.keys(schema.fields).length === 0)) {
            // If it's a canonical type but doesn't have fields defined, resolve it
            return resolveCanonicalSchema(schema);
        }
        return schema;
    }, [schema]);

    const hasNestedFields = (resolvedSchema.type === 'object' || isCanonicalType(resolvedSchema.type)) && resolvedSchema.fields && Object.keys(resolvedSchema.fields).length > 0;
    const isCanonicalTypeFlag = isCanonicalType(resolvedSchema.type);

    if (compact) {
        return (
            <span className="inline-flex items-center">
                {isCanonicalTypeFlag && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 mr-1">
                        canonical
                    </span>
                )}
                <span className={`font-mono text-xs ${getTypeColor(resolvedSchema.type)}`}>
                    {getTypeName(resolvedSchema.type)}
                </span>
                {resolvedSchema.is_array && (
                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">[]</span>
                )}
                {hasNestedFields && (
                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                        ({Object.keys(resolvedSchema.fields!).length} fields)
                    </span>
                )}
            </span>
        );
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                    {isCanonicalTypeFlag && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 mr-1">
                            canonical
                        </span>
                    )}
                    <span className={`font-mono text-sm ${getTypeColor(resolvedSchema.type)}`}>
                        {getTypeName(resolvedSchema.type)}
                    </span>
                    {resolvedSchema.is_array && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">[]</span>
                    )}
                </div>

                {hasNestedFields && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                        ) : (
                            <ChevronRight className="w-3 h-3" />
                        )}
                        {Object.keys(resolvedSchema.fields!).length} field{Object.keys(resolvedSchema.fields!).length !== 1 ? 's' : ''}
                    </button>
                )}
            </div>

            {resolvedSchema.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    {resolvedSchema.description}
                </p>
            )}

            {hasNestedFields && isExpanded && (
                <div className="ml-4 pl-3 border-l-2 border-gray-200 dark:border-gray-700 space-y-2">
                    {Object.entries(resolvedSchema.fields!).map(([fieldName, fieldSchema]) => (
                        <div key={fieldName} className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    {fieldName}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">:</span>
                            </div>
                            <div className="ml-2">
                                <SchemaRenderer
                                    schema={fieldSchema}
                                    depth={depth + 1}
                                    compact={false}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}; 