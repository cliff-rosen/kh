import { useState, useRef } from 'react';
import { XMarkIcon, ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { collectionApi } from '../../lib/api/collectionApi';
import { articleApi, type BulkPmidResult } from '../../lib/api/articleApi';

interface AddArticleModalProps {
    collectionId: number;
    onClose: () => void;
    onAdded: () => void;
}

/** Parse PMIDs from freeform text — handles commas, semicolons, newlines, spaces, tabs */
function parsePmids(text: string): string[] {
    return text
        .split(/[\s,;]+/)
        .map(s => s.trim())
        .filter(s => /^\d+$/.test(s));
}

/** Parse a CSV file and extract PMIDs from the first column that looks like PMIDs */
function parseCsvPmids(csvText: string): string[] {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];

    // Try to find a PMID column by header name
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    let pmidCol = header.findIndex(h => h === 'pmid' || h === 'pubmed_id' || h === 'pubmedid');

    // If no header match, use the first column that has numeric values
    if (pmidCol === -1) {
        const firstDataLine = lines.length > 1 ? lines[1].split(',') : lines[0].split(',');
        pmidCol = firstDataLine.findIndex(cell => /^\s*"?\d{5,}"?\s*$/.test(cell));
        if (pmidCol === -1) pmidCol = 0;
    }

    // Skip header if it has a text header
    const startLine = /^\d+$/.test(header[pmidCol] || '') ? 0 : 1;

    const pmids: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
        const cells = lines[i].split(',');
        const val = (cells[pmidCol] || '').trim().replace(/"/g, '');
        if (/^\d+$/.test(val)) {
            pmids.push(val);
        }
    }
    return pmids;
}

type Phase = 'input' | 'resolving' | 'results';

export default function AddArticleModal({ collectionId, onClose, onAdded }: AddArticleModalProps) {
    const [pmidText, setPmidText] = useState('');
    const [phase, setPhase] = useState<Phase>('input');
    const [resolveResult, setResolveResult] = useState<BulkPmidResult | null>(null);
    const [addingProgress, setAddingProgress] = useState({ done: 0, total: 0 });
    const [addComplete, setAddComplete] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const pmids = parsePmids(pmidText);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const csvPmids = parseCsvPmids(text);
            if (csvPmids.length > 0) {
                setPmidText(prev => {
                    const existing = parsePmids(prev);
                    const merged = [...new Set([...existing, ...csvPmids])];
                    return merged.join('\n');
                });
            } else {
                setError('No PMIDs found in CSV file.');
            }
        };
        reader.readAsText(file);
        // Reset so same file can be re-uploaded
        e.target.value = '';
    };

    const handleResolveAndAdd = async () => {
        if (pmids.length === 0) return;
        setError('');
        setPhase('resolving');

        try {
            // Step 1: Resolve PMIDs to articles
            const result = await articleApi.bulkResolvePmids(pmids);
            setResolveResult(result);

            // Step 2: Add found articles to collection
            const total = result.found.length;
            setAddingProgress({ done: 0, total });

            for (let i = 0; i < result.found.length; i++) {
                try {
                    await collectionApi.addArticle(collectionId, result.found[i].article_id);
                } catch {
                    // INSERT IGNORE on backend — skip duplicates silently
                }
                setAddingProgress({ done: i + 1, total });
            }

            setAddComplete(true);
            setPhase('results');
            if (result.found.length > 0) {
                onAdded();
            }
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to resolve PMIDs');
            setPhase('input');
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Articles</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6">
                    {phase === 'input' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    PubMed IDs
                                </label>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                    Enter one or more PMIDs, separated by commas, spaces, or newlines.
                                    Articles not yet in the database will be imported from PubMed automatically.
                                </p>
                                <textarea
                                    value={pmidText}
                                    onChange={e => { setPmidText(e.target.value); setError(''); }}
                                    rows={5}
                                    placeholder="e.g. 12345678, 23456789, 34567890&#10;or one per line"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
                                    autoFocus
                                />
                                {pmidText.trim() && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {pmids.length} PMID{pmids.length !== 1 ? 's' : ''} detected
                                    </p>
                                )}
                            </div>

                            {/* CSV upload */}
                            <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <ArrowUpTrayIcon className="h-4 w-4" />
                                    Import from CSV
                                </button>
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                    CSV with a "pmid" column
                                </span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.txt"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                            </div>

                            {error && (
                                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                            )}
                        </div>
                    )}

                    {phase === 'resolving' && (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            {!addComplete && addingProgress.total === 0 && (
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Looking up {pmids.length} PMID{pmids.length !== 1 ? 's' : ''}...
                                </p>
                            )}
                            {addingProgress.total > 0 && (
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Adding articles... {addingProgress.done} / {addingProgress.total}
                                </p>
                            )}
                        </div>
                    )}

                    {phase === 'results' && resolveResult && (
                        <div className="space-y-4">
                            {/* Success */}
                            {resolveResult.found.length > 0 && (
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                    <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                                        <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
                                        <span className="font-medium">
                                            {resolveResult.found.length} article{resolveResult.found.length !== 1 ? 's' : ''} added
                                        </span>
                                    </div>
                                    <div className="mt-2 space-y-1 ml-7">
                                        {resolveResult.found.map(a => (
                                            <p key={a.article_id} className="text-xs text-green-700 dark:text-green-400 truncate">
                                                PMID {a.pmid} — {a.title}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Failures */}
                            {resolveResult.not_found.length > 0 && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                    <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                                        <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
                                        <span className="font-medium">
                                            {resolveResult.not_found.length} PMID{resolveResult.not_found.length !== 1 ? 's' : ''} not found
                                        </span>
                                    </div>
                                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 ml-7">
                                        {resolveResult.not_found.join(', ')}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                    {phase === 'input' && (
                        <>
                            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800">
                                Cancel
                            </button>
                            <button
                                onClick={handleResolveAndAdd}
                                disabled={pmids.length === 0}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                Add {pmids.length} Article{pmids.length !== 1 ? 's' : ''}
                            </button>
                        </>
                    )}
                    {phase === 'results' && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
