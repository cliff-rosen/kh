import { useState } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { collectionApi } from '../../lib/api/collectionApi';
import { api } from '../../lib/api/index';

interface AddArticleModalProps {
    collectionId: number;
    onClose: () => void;
    onAdded: () => void;
}

export default function AddArticleModal({ collectionId, onClose, onAdded }: AddArticleModalProps) {
    const [pmid, setPmid] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [tab, setTab] = useState<'pmid' | 'search'>('pmid');

    const addByPmid = async () => {
        if (!pmid.trim()) return;
        setLoading(true);
        setMessage('');
        try {
            // Look up article by PMID using existing article search endpoint
            const response = await api.get(`/api/articles/db-search?pmid=${pmid.trim()}`);
            const article = response.data;
            if (article && article.article_id) {
                await collectionApi.addArticle(collectionId, article.article_id);
                setMessage('Article added!');
                setPmid('');
                onAdded();
            } else {
                setMessage('Article not found in database. Try searching PubMed first.');
            }
        } catch (err: any) {
            setMessage(err?.response?.data?.detail || 'Failed to add article');
        } finally {
            setLoading(false);
        }
    };

    const search = async () => {
        if (!searchQuery.trim()) return;
        setLoading(true);
        setMessage('');
        try {
            const response = await api.get(`/api/articles/db-search?q=${encodeURIComponent(searchQuery.trim())}&limit=20`);
            setSearchResults(response.data.articles || []);
            if ((response.data.articles || []).length === 0) {
                setMessage('No articles found.');
            }
        } catch (err) {
            setMessage('Search failed.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const addArticle = async (articleId: number) => {
        try {
            await collectionApi.addArticle(collectionId, articleId);
            setMessage('Article added!');
            onAdded();
        } catch (err) {
            console.error('Failed to add article:', err);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Article</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700 px-6">
                    <button
                        onClick={() => setTab('pmid')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                            tab === 'pmid'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}
                    >
                        By PMID
                    </button>
                    <button
                        onClick={() => setTab('search')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                            tab === 'search'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}
                    >
                        Search
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6">
                    {tab === 'pmid' ? (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Enter a PubMed ID to add an article. If it's not in the database, it will be fetched from PubMed.
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={pmid}
                                    onChange={(e) => setPmid(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addByPmid()}
                                    placeholder="e.g. 12345678"
                                    className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                    onClick={addByPmid}
                                    disabled={loading || !pmid.trim()}
                                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && search()}
                                        placeholder="Search articles..."
                                        className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                                <button
                                    onClick={search}
                                    disabled={loading || !searchQuery.trim()}
                                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Search
                                </button>
                            </div>
                            {searchResults.length > 0 && (
                                <div className="space-y-2">
                                    {searchResults.map((a: any) => (
                                        <div
                                            key={a.article_id}
                                            className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-md"
                                        >
                                            <div className="flex-1 min-w-0 mr-3">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{a.title}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {a.journal} {a.pub_year ? `(${a.pub_year})` : ''} {a.pmid ? `PMID: ${a.pmid}` : ''}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => addArticle(a.article_id)}
                                                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 flex-shrink-0"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {message && (
                        <p className={`mt-3 text-sm ${message.includes('added') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {message}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
