import { useState, useCallback, useRef } from 'react';
import {
    MagnifyingGlassIcon,
    FolderIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import { useResearchStream } from '../context/ResearchStreamContext';
import { explorerApi, type ExplorerArticle, type PubMedPagination } from '../lib/api/explorerApi';
import { collectionApi } from '../lib/api/collectionApi';
import { Collection } from '../types/collection';
import ArticleViewerModal from '../components/articles/ArticleViewerModal';
import AddToCollectionModal from '../components/explorer/AddToCollectionModal';
import CreateCollectionModal from '../components/explorer/CreateCollectionModal';

const PUBMED_PAGE_SIZE = 20;

export default function ExplorerPage() {
    const { researchStreams } = useResearchStream();

    // Search state
    const [query, setQuery] = useState('');
    const [selectedStreamIds, setSelectedStreamIds] = useState<number[]>([]);
    const [searchCollections, setSearchCollections] = useState(false);
    const [searchPubmed, setSearchPubmed] = useState(false);
    const [searchStreams, setSearchStreams] = useState(true);
    const [results, setResults] = useState<ExplorerArticle[]>([]);
    const [localCount, setLocalCount] = useState(0);
    const [sourcesSearched, setSourcesSearched] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // PubMed pagination — accumulate across pages
    const [pubmedPagination, setPubmedPagination] = useState<PubMedPagination | null>(null);
    const totalPubmedLoaded = useRef(0);
    const totalPubmedOverlaps = useRef(0);

    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Modals
    const [viewerArticles, setViewerArticles] = useState<any[]>([]);
    const [viewerIndex, setViewerIndex] = useState(0);
    const [showAddToCollection, setShowAddToCollection] = useState(false);
    const [showCreateCollection, setShowCreateCollection] = useState(false);
    const [collections, setCollections] = useState<Collection[]>([]);

    const articleKey = (a: ExplorerArticle) =>
        a.article_id ? `id:${a.article_id}` : `pmid:${a.pmid}`;

    const buildSearchParams = useCallback((pubmedOffset = 0) => ({
        q: query.trim(),
        include_streams: searchStreams,
        stream_ids: searchStreams && selectedStreamIds.length > 0 ? selectedStreamIds : undefined,
        include_collections: searchCollections,
        include_pubmed: searchPubmed,
        pubmed_limit: PUBMED_PAGE_SIZE,
        pubmed_offset: pubmedOffset,
    }), [query, searchStreams, selectedStreamIds, searchCollections, searchPubmed]);

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;
        setLoading(true);
        setHasSearched(true);
        setSelectedIds(new Set());
        totalPubmedLoaded.current = 0;
        totalPubmedOverlaps.current = 0;
        try {
            const resp = await explorerApi.search(buildSearchParams(0));
            setResults(resp.articles);
            setLocalCount(resp.local_count);
            setSourcesSearched(resp.sources_searched);
            setPubmedPagination(resp.pubmed);
            if (resp.pubmed) {
                totalPubmedLoaded.current = resp.pubmed.returned;
                totalPubmedOverlaps.current = resp.pubmed.overlap_count;
            }
        } catch (err) {
            console.error('Explorer search failed:', err);
        } finally {
            setLoading(false);
        }
    }, [query, buildSearchParams]);

    const handleLoadMorePubMed = useCallback(async () => {
        if (!pubmedPagination?.has_more || loadingMore) return;
        const nextOffset = pubmedPagination.offset + PUBMED_PAGE_SIZE;
        setLoadingMore(true);
        try {
            const resp = await explorerApi.search(buildSearchParams(nextOffset));
            const newPubmedArticles = resp.articles.filter(a => !a.is_local);
            setResults(prev => [...prev, ...newPubmedArticles]);
            setPubmedPagination(resp.pubmed);
            if (resp.pubmed) {
                totalPubmedLoaded.current += resp.pubmed.returned;
                totalPubmedOverlaps.current += resp.pubmed.overlap_count;
            }
        } catch (err) {
            console.error('Failed to load more PubMed results:', err);
        } finally {
            setLoadingMore(false);
        }
    }, [buildSearchParams, pubmedPagination, loadingMore]);

    const toggleSelect = (key: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === results.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(results.map(articleKey)));
        }
    };

    const selectedArticles = results.filter(a => selectedIds.has(articleKey(a)));

    const openViewer = (article: ExplorerArticle) => {
        const viewerList = results.map(a => ({
            article_id: a.article_id || 0,
            title: a.title,
            authors: a.authors,
            journal: a.journal,
            pmid: a.pmid,
            doi: a.doi,
            abstract: a.abstract,
            url: a.url,
            pub_year: a.pub_year,
            pub_month: a.pub_month,
            pub_day: a.pub_day,
        }));
        setViewerArticles(viewerList);
        setViewerIndex(results.findIndex(a => articleKey(a) === articleKey(article)));
    };

    const openAddToCollection = async () => {
        try {
            const colls = await collectionApi.list();
            setCollections(colls);
            setShowAddToCollection(true);
        } catch (err) {
            console.error('Failed to load collections:', err);
        }
    };

    const formatAuthors = (authors: any): string => {
        if (!authors) return '';
        if (typeof authors === 'string') return authors;
        if (Array.isArray(authors) && authors.length > 0) {
            const display = authors.slice(0, 3).join(', ');
            return authors.length > 3 ? display + ' et al.' : display;
        }
        return '';
    };

    const pubmedTotal = pubmedPagination?.total ?? 0;

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center gap-2 mb-3">
                    <MagnifyingGlassIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Explorer</h1>
                </div>

                {/* Search bar */}
                <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="Search articles by title, abstract, keywords..."
                            className="w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={loading || !query.trim()}
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </div>

                {/* Source toggles */}
                <div className="flex flex-wrap items-center gap-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Sources:</span>

                    <label className="inline-flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={searchStreams}
                            onChange={e => setSearchStreams(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">Streams</span>
                    </label>
                    {searchStreams && researchStreams.length > 0 && (
                        <select
                            value={selectedStreamIds.length === 0 ? '' : selectedStreamIds[0]}
                            onChange={e => setSelectedStreamIds(e.target.value ? [Number(e.target.value)] : [])}
                            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                            <option value="">All streams</option>
                            {researchStreams.map(s => (
                                <option key={s.stream_id} value={s.stream_id}>{s.stream_name}</option>
                            ))}
                        </select>
                    )}

                    <label className="inline-flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={searchCollections}
                            onChange={e => setSearchCollections(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">Collections</span>
                    </label>

                    <label className="inline-flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={searchPubmed}
                            onChange={e => setSearchPubmed(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">PubMed</span>
                    </label>
                </div>
            </div>

            {/* Results */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {!hasSearched ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <MagnifyingGlassIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                            <p className="text-gray-500 dark:text-gray-400">Search across your streams, collections, and PubMed</p>
                        </div>
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : results.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-gray-500 dark:text-gray-400">No results found</p>
                    </div>
                ) : (
                    <div className="p-4">
                        {/* Status panel */}
                        <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                    {/* Local source counts */}
                                    {localCount > 0 && (
                                        <span className="text-gray-700 dark:text-gray-300">
                                            <span className="font-semibold">{localCount}</span>
                                            {' from '}
                                            {sourcesSearched.filter(s => s !== 'pubmed').join(' & ') || 'local'}
                                        </span>
                                    )}

                                    {/* PubMed status */}
                                    {searchPubmed && pubmedPagination && (
                                        <span className="text-gray-700 dark:text-gray-300">
                                            <span className="font-semibold">{pubmedTotal.toLocaleString()}</span>
                                            {' found on PubMed'}
                                            {pubmedTotal > 0 && (
                                                <span className="text-gray-500 dark:text-gray-400">
                                                    {' '}(showing {totalPubmedLoaded.current + totalPubmedOverlaps.current} of {pubmedTotal.toLocaleString()}
                                                    {totalPubmedOverlaps.current > 0 && (
                                                        <>, {totalPubmedOverlaps.current} already in your local results</>
                                                    )}
                                                    )
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={toggleSelectAll}
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0 ml-4"
                                >
                                    {selectedIds.size === results.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                        </div>

                        {/* Unified article list */}
                        <div className="space-y-2">
                            {results.map(article => (
                                <ArticleCard
                                    key={articleKey(article)}
                                    article={article}
                                    isSelected={selectedIds.has(articleKey(article))}
                                    onToggleSelect={() => toggleSelect(articleKey(article))}
                                    onOpen={() => openViewer(article)}
                                    formatAuthors={formatAuthors}
                                />
                            ))}
                        </div>

                        {/* Load More for PubMed */}
                        {searchPubmed && pubmedPagination?.has_more && (
                            <div className="mt-4 flex flex-col items-center gap-2">
                                <button
                                    onClick={handleLoadMorePubMed}
                                    disabled={loadingMore}
                                    className="px-5 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                                >
                                    {loadingMore ? (
                                        <span className="inline-flex items-center gap-2">
                                            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></span>
                                            Loading...
                                        </span>
                                    ) : (
                                        'Load More PubMed Results'
                                    )}
                                </button>
                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                    Showing {totalPubmedLoaded.current + totalPubmedOverlaps.current} of {pubmedTotal.toLocaleString()} PubMed matches
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Sticky action bar */}
            {selectedIds.size > 0 && (
                <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {selectedIds.size} selected
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Clear
                            </button>
                            <button
                                onClick={openAddToCollection}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                                <FolderIcon className="h-4 w-4" />
                                Add to Collection
                            </button>
                            <button
                                onClick={() => setShowCreateCollection(true)}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            >
                                <PlusIcon className="h-4 w-4" />
                                New Collection
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Article Viewer Modal */}
            {viewerArticles.length > 0 && (
                <ArticleViewerModal
                    articles={viewerArticles}
                    initialIndex={viewerIndex}
                    onClose={() => setViewerArticles([])}
                />
            )}

            {/* Add to Existing Collection Modal */}
            {showAddToCollection && (
                <AddToCollectionModal
                    collections={collections}
                    selectedArticles={selectedArticles}
                    onClose={() => setShowAddToCollection(false)}
                    onComplete={() => { setShowAddToCollection(false); setSelectedIds(new Set()); }}
                />
            )}

            {/* Create New Collection Modal */}
            {showCreateCollection && (
                <CreateCollectionModal
                    selectedArticles={selectedArticles}
                    onClose={() => setShowCreateCollection(false)}
                    onComplete={() => { setShowCreateCollection(false); setSelectedIds(new Set()); }}
                />
            )}
        </div>
    );
}


/** Reusable article card */
function ArticleCard({ article, isSelected, onToggleSelect, onOpen, formatAuthors }: {
    article: ExplorerArticle;
    isSelected: boolean;
    onToggleSelect: () => void;
    onOpen: () => void;
    formatAuthors: (authors: any) => string;
}) {
    return (
        <div
            className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                isSelected
                    ? 'border-blue-300 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
        >
            <div className="flex-shrink-0 pt-1">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelect}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
            </div>
            <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={onOpen}
            >
                <h4 className="font-medium text-blue-600 dark:text-blue-400 mb-1 hover:underline">
                    {article.title}
                </h4>
                {article.authors && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                        {formatAuthors(article.authors)}
                    </p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-500 mb-1.5">
                    {article.journal && <span>{article.journal}</span>}
                    {article.pub_year && <span>· {article.pub_year}</span>}
                    {article.pmid && <span>· PMID: {article.pmid}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {article.sources.map((src, i) => (
                        <span
                            key={i}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                                src.type === 'stream'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                    : src.type === 'collection'
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                    : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            }`}
                        >
                            {src.type === 'collection' && <FolderIcon className="h-3 w-3" />}
                            {src.name}
                            {src.report_name && ` · ${src.report_name}`}
                        </span>
                    ))}
                    {!article.is_local && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                            PubMed only — will be imported on add
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
