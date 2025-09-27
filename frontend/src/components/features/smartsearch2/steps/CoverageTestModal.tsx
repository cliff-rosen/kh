import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { X, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useSmartSearch2 } from '@/context/SmartSearch2Context';

interface CoverageTestModalProps {
    query: string;
    source: 'pubmed' | 'google_scholar';
    onClose: () => void;
}

interface Article {
    pmid: string;
    title: string;
    abstract?: string;
    authors?: string[];
    journal?: string;
    year?: number;
}

interface CoverageResult {
    found_articles: Article[];
    missing_articles: string[];
    covered_ids: string[];
    coverage_percentage: number;
    coverage_count: number;
    total_target: number;
    estimated_count?: number;
}

interface FullArticle {
    id: string;
    title: string;
    abstract?: string;
    authors?: string[];
    journal?: string;
    year?: number;
    is_covered?: boolean;
}

export function CoverageTestModal({ query, source, onClose }: CoverageTestModalProps) {
    const [targetPmids, setTargetPmids] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [coverageResult, setCoverageResult] = useState<CoverageResult | null>(null);
    const [fullArticles, setFullArticles] = useState<FullArticle[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingArticles, setIsLoadingArticles] = useState(false);

    const { testCoverage, fetchArticles } = useSmartSearch2();

    const handleTestCoverage = async () => {
        if (!targetPmids.trim()) {
            setError('Please enter at least one PMID');
            return;
        }

        // Parse PMIDs from input (comma/space/newline separated)
        const pmids = targetPmids
            .split(/[,\s\n]+/)
            .map(pmid => pmid.trim())
            .filter(pmid => pmid.length > 0)
            .filter(pmid => /^\d+$/.test(pmid)); // Only numeric PMIDs

        if (pmids.length === 0) {
            setError('Please enter valid numeric PMIDs');
            return;
        }

        setIsTesting(true);
        setError(null);
        setCoverageResult(null);

        try {
            // First fetch full article details
            setIsLoadingArticles(true);
            const articles = await fetchArticles(pmids);

            // Call the coverage testing through context
            const data = await testCoverage(query, pmids);

            // Process the response to include all necessary data
            setCoverageResult({
                found_articles: data.found_articles || [],
                missing_articles: data.missing_articles || pmids.filter(pmid =>
                    !data.covered_ids?.includes(pmid)
                ),
                covered_ids: data.covered_ids || [],
                coverage_percentage: data.coverage_percentage || 0,
                coverage_count: data.coverage_count || 0,
                total_target: pmids.length,
                estimated_count: data.estimated_count
            });

            // Merge articles with coverage information
            const articlesWithCoverage = articles.map(article => {
                const normalizedId = extractPubMedId(article.id);
                return {
                    ...article,
                    is_covered: data.covered_ids?.includes(normalizedId) || false
                };
            });
            setFullArticles(articlesWithCoverage);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to test coverage';
            setError(errorMessage);
            console.error('Coverage test failed:', err);
        } finally {
            setIsTesting(false);
            setIsLoadingArticles(false);
        }
    };

    const extractPubMedId = (articleId: string): string => {
        if (articleId.startsWith('pubmed_')) {
            return articleId.replace('pubmed_', '');
        }
        if (articleId.startsWith('pmid:')) {
            return articleId.replace('pmid:', '');
        }
        if (articleId.startsWith('PMID:')) {
            return articleId.replace('PMID:', '');
        }
        // If it's already just the numeric ID
        return articleId;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-[95vw] h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Test Coverage - Search Designer
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                    {/* Query Display */}
                    <div>
                        <Label className="text-sm font-medium mb-2 block">
                            Search Query ({source === 'pubmed' ? 'PubMed' : 'Google Scholar'})
                        </Label>
                        <Textarea
                            value={query}
                            readOnly
                            rows={3}
                            className="text-sm font-mono bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                        />
                    </div>

                    {/* PMID Input */}
                    <div>
                        <Label className="text-sm font-medium mb-2 block">
                            Known Target Articles (PMIDs)
                        </Label>
                        <Textarea
                            value={targetPmids}
                            onChange={(e) => setTargetPmids(e.target.value)}
                            rows={4}
                            className="dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                            placeholder="Enter PMIDs separated by commas, spaces, or new lines&#10;Example: 12345678, 23456789, 34567890"
                            disabled={isTesting}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Enter the PMIDs of articles you know should be found by this search
                        </p>
                    </div>

                    {/* Test Button */}
                    <div>
                        <Button
                            onClick={handleTestCoverage}
                            disabled={isTesting || isLoadingArticles || !targetPmids.trim()}
                            className="w-full"
                        >
                            {isTesting || isLoadingArticles ? (
                                <>
                                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                    {isLoadingArticles ? 'Loading Articles...' : 'Testing Coverage...'}
                                </>
                            ) : (
                                'Test Query Coverage'
                            )}
                        </Button>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Results Display */}
                    {(coverageResult || isLoadingArticles) && (
                        <>
                            {/* Summary Stats */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-3">
                                    Coverage Test Results
                                </h3>

                                {coverageResult && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                            <p className="text-xs text-blue-600 dark:text-blue-400">Coverage</p>
                                            <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                                {coverageResult.coverage_percentage}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-blue-600 dark:text-blue-400">Found</p>
                                            <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                                {coverageResult.coverage_count}/{coverageResult.total_target}
                                            </p>
                                        </div>
                                        {coverageResult.estimated_count !== undefined && (
                                            <div>
                                                <p className="text-xs text-blue-600 dark:text-blue-400">Total Results</p>
                                                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                                    {coverageResult.estimated_count.toLocaleString()}
                                                </p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-xs text-blue-600 dark:text-blue-400">Missing</p>
                                            <p className="text-lg font-bold text-red-600 dark:text-red-400">
                                                {coverageResult.missing_articles.length}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Articles List - Search Designer Style */}
                            {isLoadingArticles ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                                    <span className="ml-3 text-gray-600 dark:text-gray-400">Loading articles...</span>
                                </div>
                            ) : fullArticles.length > 0 ? (
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                                        Target Articles ({fullArticles.length})
                                    </h4>
                                    <div className="space-y-1">
                                        {fullArticles.map((article) => (
                                            <div
                                                key={article.id}
                                                className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                                            >
                                                {article.is_covered !== undefined && (
                                                    article.is_covered ? (
                                                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                                                    ) : (
                                                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                                    )
                                                )}
                                                <span className="font-mono text-sm text-gray-900 dark:text-gray-100 flex-shrink-0">
                                                    {extractPubMedId(article.id)}
                                                </span>
                                                <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1">
                                                    {article.title}
                                                </span>
                                                <a
                                                    href={`https://pubmed.ncbi.nlm.nih.gov/${extractPubMedId(article.id)}/`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex-shrink-0"
                                                >
                                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                </a>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Coverage Summary */}
                                    {coverageResult && (
                                        <div className="mt-4 flex justify-between items-center">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                Total Articles: {fullArticles.length}
                                                <span className="ml-2">
                                                    | Covered: {fullArticles.filter(a => a.is_covered).length}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            {/* Suggestions */}
                            {coverageResult && coverageResult.coverage_percentage < 100 && (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-4">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                                                Improve Coverage
                                            </p>
                                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                                Your query is missing {coverageResult.missing_articles.length} target article(s).
                                                Consider adjusting your Boolean expressions or adding more search terms to improve coverage.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}