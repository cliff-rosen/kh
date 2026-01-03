import { useState } from 'react';
import { XMarkIcon, SparklesIcon, PlayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface AvailableColumn {
    id: string;
    label: string;
}

interface AddColumnModalProps {
    availableColumns: AvailableColumn[];
    onAdd: (columnName: string, promptTemplate: string, inputColumns: string[], outputType: 'text' | 'number' | 'boolean') => void;
    onClose: () => void;
}

export default function AddColumnModal({ availableColumns, onAdd, onClose }: AddColumnModalProps) {
    const [columnName, setColumnName] = useState('');
    const [promptTemplate, setPromptTemplate] = useState('');
    const [outputType, setOutputType] = useState<'text' | 'number' | 'boolean'>('text');
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewResult, setPreviewResult] = useState<string | null>(null);

    // Extract which columns are used in the template
    const usedColumns = availableColumns
        .filter(col => promptTemplate.includes(`{${col.id}}`))
        .map(col => col.id);

    const handleInsertSlug = (columnId: string) => {
        setPromptTemplate(prev => prev + `{${columnId}}`);
    };

    const handleInsertCitation = () => {
        // Build a citation-style template with all available columns
        const citationParts = availableColumns.map(col => `${col.label}: {${col.id}}`);
        const citation = citationParts.join('\n');
        setPromptTemplate(prev => prev + (prev ? '\n\n' : '') + citation);
    };

    const handlePreview = async () => {
        // This would preview with the first row's data
        setIsPreviewing(true);
        setPreviewResult(null);

        try {
            // Simulate a preview
            await new Promise(resolve => setTimeout(resolve, 1000));
            setPreviewResult('(Preview would show result here)');
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleSubmit = () => {
        if (!columnName.trim() || !promptTemplate.trim()) return;
        onAdd(columnName, promptTemplate, usedColumns, outputType);
    };

    const isValid = columnName.trim() && promptTemplate.trim() && usedColumns.length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <SparklesIcon className="h-5 w-5 text-purple-500" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Add AI Column
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Column Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Column Name
                        </label>
                        <input
                            type="text"
                            value={columnName}
                            onChange={(e) => setColumnName(e.target.value)}
                            placeholder="e.g., Study Design, Relevance Score, Key Findings"
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>

                    {/* Available Fields */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Available Fields (click to insert)
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {availableColumns.map(col => (
                                <button
                                    key={col.id}
                                    type="button"
                                    onClick={() => handleInsertSlug(col.id)}
                                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                                        promptTemplate.includes(`{${col.id}}`)
                                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
                                            : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    {`{${col.id}}`}
                                    <span className="ml-1 text-gray-500 dark:text-gray-400">
                                        {col.label}
                                    </span>
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={handleInsertCitation}
                                className="px-3 py-1 text-sm rounded-full border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                            >
                                + Insert All (Citation Format)
                            </button>
                        </div>
                    </div>

                    {/* Prompt Template */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Prompt Template
                        </label>
                        <textarea
                            value={promptTemplate}
                            onChange={(e) => setPromptTemplate(e.target.value)}
                            placeholder={`Example:
Based on this research article:

Title: {title}
Abstract: {abstract}

Classify the study design as one of: RCT, Cohort, Case-Control, Cross-sectional, Case Report, Review, Meta-analysis, Other

Return only the classification, nothing else.`}
                            rows={8}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                        />
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Use {'{column_name}'} to insert values from that column. The prompt will be run for each row.
                        </p>
                    </div>

                    {/* Output Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Output Type
                        </label>
                        <div className="flex flex-wrap gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="outputType"
                                    value="text"
                                    checked={outputType === 'text'}
                                    onChange={() => setOutputType('text')}
                                    className="text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Text</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="outputType"
                                    value="number"
                                    checked={outputType === 'number'}
                                    onChange={() => setOutputType('number')}
                                    className="text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Number (scores, counts)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="outputType"
                                    value="boolean"
                                    checked={outputType === 'boolean'}
                                    onChange={() => setOutputType('boolean')}
                                    className="text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Yes/No (for filtering)</span>
                            </label>
                        </div>
                    </div>

                    {/* Preview */}
                    {previewResult && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                            <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">Preview Result</p>
                            <p className="text-sm text-green-700 dark:text-green-300">{previewResult}</p>
                        </div>
                    )}

                    {/* Validation message */}
                    {promptTemplate && usedColumns.length === 0 && (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                            Your template doesn't reference any columns. Insert at least one field like {'{title}'} or {'{abstract}'}.
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <button
                        type="button"
                        onClick={handlePreview}
                        disabled={!isValid || isPreviewing}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isPreviewing ? (
                            <>
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                Previewing...
                            </>
                        ) : (
                            <>
                                <PlayIcon className="h-4 w-4" />
                                Preview (first row)
                            </>
                        )}
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!isValid}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <SparklesIcon className="h-4 w-4" />
                            Add Column
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
