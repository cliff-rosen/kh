import { useState } from 'react';
import { WebSource, WebSourceConfig } from '../../types';
import { PlusIcon, TrashIcon, GlobeAltIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';

interface WebSourcesEditorProps {
    config: WebSourceConfig | null | undefined;
    onChange: (updated: WebSourceConfig) => void;
}

interface ValidationResult {
    source_type?: string | null;
    title?: string | null;
    entry_count?: number | null;
    error?: string | null;
}

export default function WebSourcesEditor({ config, onChange }: WebSourcesEditorProps) {
    const sources = config?.sources || [];
    const [validating, setValidating] = useState<Record<string, boolean>>({});
    const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({});

    const ensureConfig = (): WebSourceConfig => {
        return config || { sources: [], max_articles_per_source: 20 };
    };

    const addSource = () => {
        const current = ensureConfig();
        const newSource: WebSource = {
            source_id: `ws_${Date.now()}`,
            url: '',
            source_type: 'site',
            directive: '',
            title: null,
            site_memo: null,
            enabled: true,
        };
        onChange({
            ...current,
            sources: [...current.sources, newSource],
        });
    };

    const removeSource = (index: number) => {
        const current = ensureConfig();
        onChange({
            ...current,
            sources: current.sources.filter((_, i) => i !== index),
        });
    };

    const updateSource = (index: number, field: keyof WebSource, value: any) => {
        const current = ensureConfig();
        const updated = [...current.sources];
        updated[index] = { ...updated[index], [field]: value };
        onChange({ ...current, sources: updated });
    };

    const updateMaxArticles = (value: number) => {
        const current = ensureConfig();
        onChange({ ...current, max_articles_per_source: value });
    };

    const validateUrl = async (index: number) => {
        const source = sources[index];
        if (!source.url) return;

        setValidating(prev => ({ ...prev, [source.source_id]: true }));
        setValidationResults(prev => {
            const next = { ...prev };
            delete next[source.source_id];
            return next;
        });

        try {
            const response = await api.post('/api/research-streams/web-sources/validate', {
                url: source.url,
            });
            const result: ValidationResult = response.data;

            setValidationResults(prev => ({ ...prev, [source.source_id]: result }));

            // If validation succeeded, update the source with type and title
            if (result.source_type) {
                const current = ensureConfig();
                const updated = [...current.sources];
                updated[index] = {
                    ...updated[index],
                    source_type: result.source_type as 'feed' | 'site',
                    title: result.title || null,
                };
                onChange({ ...current, sources: updated });
            }
        } catch (err: any) {
            setValidationResults(prev => ({
                ...prev,
                [source.source_id]: { error: err.message || 'Validation failed' },
            }));
        } finally {
            setValidating(prev => ({ ...prev, [source.source_id]: false }));
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <GlobeAltIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Web Sources
                    </h3>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        (RSS/Atom feeds &amp; agent-monitored sites)
                    </span>
                </div>
                <button
                    type="button"
                    onClick={addSource}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                >
                    <PlusIcon className="h-4 w-4" />
                    Add Web Source
                </button>
            </div>

            {sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    <GlobeAltIcon className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">No web sources configured.</p>
                    <p className="text-xs mt-1">Add a website URL to monitor for new content.</p>
                </div>
            ) : (
                <>
                    {/* Max articles per source */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Max articles per source:
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={config?.max_articles_per_source || 20}
                            onChange={(e) => updateMaxArticles(parseInt(e.target.value) || 20)}
                            className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                    </div>

                    {/* Sources list */}
                    <div className="flex flex-col gap-3">
                        {sources.map((source, index) => {
                            const vResult = validationResults[source.source_id];
                            const isValidating = validating[source.source_id];

                            return (
                                <div
                                    key={source.source_id}
                                    className="border border-gray-300 dark:border-gray-600 rounded-lg p-4"
                                >
                                    {/* Source header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                Source {index + 1}
                                            </h4>
                                            {/* Type badge */}
                                            {source.source_type && (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    source.source_type === 'feed'
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                                }`}>
                                                    {source.source_type === 'feed' ? 'RSS/Atom Feed' : 'Site (Agent)'}
                                                </span>
                                            )}
                                            {/* Title from validation */}
                                            {source.title && (
                                                <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                                                    {source.title}
                                                </span>
                                            )}
                                            <label className="flex items-center gap-1.5">
                                                <input
                                                    type="checkbox"
                                                    checked={source.enabled}
                                                    onChange={(e) => updateSource(index, 'enabled', e.target.checked)}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-xs text-gray-500 dark:text-gray-400">Enabled</span>
                                            </label>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeSource(index)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </div>

                                    {/* URL + Validate button */}
                                    <div className="mb-3">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Website URL
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="url"
                                                placeholder="https://openai.com/blog"
                                                value={source.url}
                                                onChange={(e) => updateSource(index, 'url', e.target.value)}
                                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => validateUrl(index)}
                                                disabled={!source.url || isValidating}
                                                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors whitespace-nowrap"
                                            >
                                                {isValidating ? 'Validating...' : 'Validate'}
                                            </button>
                                        </div>
                                        {/* Validation result */}
                                        {vResult && (
                                            <div className={`mt-2 flex items-center gap-1.5 text-sm ${
                                                vResult.error
                                                    ? 'text-red-600 dark:text-red-400'
                                                    : 'text-green-600 dark:text-green-400'
                                            }`}>
                                                {vResult.error ? (
                                                    <>
                                                        <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0" />
                                                        <span>{vResult.error}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
                                                        <span>
                                                            Detected as <strong>{vResult.source_type === 'feed' ? 'RSS/Atom feed' : 'website'}</strong>
                                                            {vResult.title && <> &mdash; {vResult.title}</>}
                                                            {vResult.entry_count != null && <> ({vResult.entry_count} entries)</>}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Directive */}
                                    <div className="mb-3">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Directive
                                        </label>
                                        <textarea
                                            placeholder="What to look for (e.g., 'New product announcements and research papers')"
                                            value={source.directive}
                                            onChange={(e) => updateSource(index, 'directive', e.target.value)}
                                            className="w-full min-h-[60px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-y"
                                        />
                                    </div>

                                    {/* Site memo (read-only, shown only if present) */}
                                    {source.site_memo && (
                                        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                                            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Site Memo <span className="font-normal text-gray-400">(learned by agent)</span>
                                            </h5>
                                            <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded p-2 whitespace-pre-wrap max-h-32 overflow-auto">
                                                {source.site_memo}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
