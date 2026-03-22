import { useState, useEffect } from 'react';
import { ArrowPathIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { toolsApi } from '../../lib/api/toolsApi';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import PubMedTable from '../pubmed/PubMedTable';

export default function KeyAuthorArticles() {
    const [articles, setArticles] = useState<CanonicalResearchArticle[]>([]);
    const [authors, setAuthors] = useState<string[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [authorFilter, setAuthorFilter] = useState('');

    const fetchArticles = async (author?: string) => {
        try {
            setLoading(true);
            setError(null);
            const filters = author ? { author } : undefined;
            const response = await toolsApi.getKeyAuthorArticles(filters);
            setArticles(response.articles);
            setTotalCount(response.total_count);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch key author articles');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        toolsApi.getKeyAuthors()
            .then(res => {
                setAuthors(res.authors);
                // Don't auto-fetch all authors on load -- too many PubMed calls
                // User picks an author first
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const handleFilterChange = (author: string) => {
        setAuthorFilter(author);
        if (author) {
            fetchArticles(author);
        } else {
            // "All" clears results -- searching all authors at once is too slow
            setArticles([]);
            setTotalCount(0);
        }
    };

    return (
        <div className="space-y-6">
            {/* Filter Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <FunnelIcon className="h-4 w-4" />
                        Filter by author:
                    </div>
                    <button
                        onClick={() => handleFilterChange('')}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            !authorFilter
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                        All
                    </button>
                    {authors.map((author) => (
                        <button
                            key={author}
                            onClick={() => handleFilterChange(author)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                authorFilter === author
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            {author}
                        </button>
                    ))}
                </div>
            </div>

            {/* Status */}
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Count */}
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {totalCount} article{totalCount !== 1 ? 's' : ''}
                        {authorFilter && <> matching <span className="font-medium text-gray-900 dark:text-white">{authorFilter}</span></>}
                    </div>

                    {/* Articles Table - reuses the standard PubMedTable component */}
                    {articles.length > 0 ? (
                        <PubMedTable articles={articles} />
                    ) : (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                            {authorFilter ? 'No articles found.' : 'Select an author above to search PubMed for their recent publications.'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
