import { useState, useEffect } from 'react';
import { XMarkIcon, SparklesIcon, ClockIcon, ChevronDownIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

const RECENT_TEMPLATES_KEY = 'tablizer_recent_templates';
const MAX_RECENT_TEMPLATES = 10;

interface RecentTemplate {
    name: string;
    prompt: string;
    outputType: 'text' | 'number' | 'boolean';
    timestamp: number;
}

interface AvailableColumn {
    id: string;
    label: string;
}

interface AddColumnModalProps {
    availableColumns: AvailableColumn[];
    onAdd: (columnName: string, promptTemplate: string, inputColumns: string[], outputType: 'text' | 'number' | 'boolean') => void;
    onClose: () => void;
}

function loadRecentTemplates(): RecentTemplate[] {
    try {
        const stored = localStorage.getItem(RECENT_TEMPLATES_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveRecentTemplate(template: RecentTemplate): void {
    try {
        const existing = loadRecentTemplates();
        // Remove duplicates (same prompt)
        const filtered = existing.filter(t => t.prompt !== template.prompt);
        // Add new at front, limit to max
        const updated = [template, ...filtered].slice(0, MAX_RECENT_TEMPLATES);
        localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify(updated));
    } catch {
        // Ignore storage errors
    }
}

export default function AddColumnModal({ availableColumns, onAdd, onClose }: AddColumnModalProps) {
    const [columnName, setColumnName] = useState('');
    const [promptTemplate, setPromptTemplate] = useState('');
    const [outputType, setOutputType] = useState<'text' | 'number' | 'boolean'>('boolean');
    const [recentTemplates, setRecentTemplates] = useState<RecentTemplate[]>([]);
    const [showRecentDropdown, setShowRecentDropdown] = useState(false);

    useEffect(() => {
        setRecentTemplates(loadRecentTemplates());
    }, []);

    // Extract which columns are used in the template
    const usedColumns = availableColumns
        .filter(col => promptTemplate.includes(`{${col.id}}`))
        .map(col => col.id);

    const handleInsertField = (columnId: string) => {
        setPromptTemplate(prev => prev + `{${columnId}}`);
    };

    const handleSelectRecentTemplate = (template: RecentTemplate) => {
        setColumnName(template.name);
        setPromptTemplate(template.prompt);
        setOutputType(template.outputType);
        setShowRecentDropdown(false);
    };

    const handleSubmit = () => {
        if (!columnName.trim() || !promptTemplate.trim()) return;

        // Save to recent templates
        saveRecentTemplate({
            name: columnName,
            prompt: promptTemplate,
            outputType,
            timestamp: Date.now()
        });

        onAdd(columnName, promptTemplate, usedColumns, outputType);
    };

    const isValid = columnName.trim() && promptTemplate.trim();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
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

                {/* Body - Two Column Layout */}
                <div className="flex-1 overflow-hidden flex">
                    {/* Left Column - Main Form */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-5">
                        {/* Instructions Box */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <div className="flex gap-3">
                                <InformationCircleIcon className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-800 dark:text-blue-200">
                                    <p className="font-medium mb-1">How AI Columns Work</p>
                                    <p className="text-blue-700 dark:text-blue-300">
                                        Write a prompt that will be run for each row. Use the field buttons on the right to insert data from each record.
                                        The AI will analyze the content and return a value for your new column.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Recent Templates Dropdown */}
                        {recentTemplates.length > 0 && (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowRecentDropdown(!showRecentDropdown)}
                                    className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                                >
                                    <ClockIcon className="h-4 w-4" />
                                    Use a recent template
                                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${showRecentDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showRecentDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                                        {recentTemplates.map((template, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => handleSelectRecentTemplate(template)}
                                                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-600 border-b border-gray-100 dark:border-gray-600 last:border-0"
                                            >
                                                <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                    {template.name}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                    {template.prompt.substring(0, 60)}...
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                        template.outputType === 'boolean'
                                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                            : template.outputType === 'number'
                                                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                            : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                                                    }`}>
                                                        {template.outputType}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Column Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Column Name
                            </label>
                            <input
                                type="text"
                                value={columnName}
                                onChange={(e) => setColumnName(e.target.value)}
                                placeholder="e.g., Is Clinical Trial, Study Design, Sample Size"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>

                        {/* Output Type */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                What type of answer do you want?
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setOutputType('boolean')}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        outputType === 'boolean'
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                    }`}
                                >
                                    <div className="font-medium text-sm text-gray-900 dark:text-white">Yes / No</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Best for filtering</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOutputType('text')}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        outputType === 'text'
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                    }`}
                                >
                                    <div className="font-medium text-sm text-gray-900 dark:text-white">Text</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Classifications, summaries</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOutputType('number')}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        outputType === 'number'
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                    }`}
                                >
                                    <div className="font-medium text-sm text-gray-900 dark:text-white">Number</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Scores, counts</div>
                                </button>
                            </div>
                        </div>

                        {/* Prompt Template */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Your Prompt
                            </label>
                            <textarea
                                value={promptTemplate}
                                onChange={(e) => setPromptTemplate(e.target.value)}
                                placeholder={outputType === 'boolean'
                                    ? "Example: Is this article about a randomized controlled trial (RCT)?"
                                    : outputType === 'number'
                                    ? "Example: What is the sample size of this study? Return just the number, or 0 if not mentioned."
                                    : "Example: What is the study design? Classify as: RCT, Cohort, Case-Control, Cross-sectional, Review, or Other."
                                }
                                rows={4}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                                Click fields on the right to insert them into your prompt →
                            </p>
                        </div>

                        {/* Validation message */}
                        {promptTemplate && usedColumns.length === 0 && (
                            <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                                💡 Tip: Insert at least one field (like title or abstract) so the AI has data to analyze.
                            </p>
                        )}
                    </div>

                    {/* Right Column - Available Fields */}
                    <div className="w-64 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 overflow-y-auto">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                            Available Fields
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                            Click to insert into your prompt. These will be replaced with actual values for each row.
                        </p>
                        <div className="space-y-2">
                            {availableColumns.map(col => (
                                <button
                                    key={col.id}
                                    type="button"
                                    onClick={() => handleInsertField(col.id)}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-lg border transition-colors ${
                                        promptTemplate.includes(`{${col.id}}`)
                                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
                                            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    <div className="font-medium">{col.label}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                        {`{${col.id}}`}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Quick Insert All */}
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => {
                                    const allFields = availableColumns
                                        .filter(col => ['title', 'abstract'].includes(col.id))
                                        .map(col => `${col.label}: {${col.id}}`)
                                        .join('\n');
                                    setPromptTemplate(prev => prev + (prev ? '\n\n' : '') + allFields);
                                }}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                            >
                                + Insert Title & Abstract
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
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
                        className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <SparklesIcon className="h-4 w-4" />
                        Add Column
                    </button>
                </div>
            </div>
        </div>
    );
}
