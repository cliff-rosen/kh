import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { CoverageTestModal } from './CoverageTestModal';

interface ExpressionsStepProps {
    expandedExpressions: Array<{ concept: string; expression: string; count: number; selected?: boolean }>;
    setExpandedExpressions: (expressions: Array<{ concept: string; expression: string; count: number; selected?: boolean }>) => void;
    generatedKeywords: string;
    setGeneratedKeywords: (keywords: string) => void;
    estimatedResults: number | null;
    setEstimatedResults: (results: number | null) => void;
    isGenerating: boolean;
    selectedSource: 'pubmed' | 'google_scholar';
    testKeywordCombination: (expressions: string[], source: 'pubmed' | 'google_scholar') => Promise<{ combined_query: string; estimated_results: number; source: string; }>;
    setError: (error: string | null) => void;
    evidenceSpec?: string;
}

export function ExpressionsStep({
    expandedExpressions,
    setExpandedExpressions,
    generatedKeywords,
    setGeneratedKeywords,
    estimatedResults,
    setEstimatedResults,
    isGenerating,
    selectedSource,
    testKeywordCombination,
    setError,
    evidenceSpec
}: ExpressionsStepProps) {
    const [showCoverageModal, setShowCoverageModal] = useState(false);
    const [hasAutoTested, setHasAutoTested] = useState(false);
    const [queryCandidate, setQueryCandidate] = useState('');
    const [showEvidenceSpec, setShowEvidenceSpec] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    // Calculate the default combined query from selected expressions
    const getDefaultCombinedQuery = () => {
        const selectedExpressions = expandedExpressions.filter(exp => exp.selected);
        return selectedExpressions.length > 0
            ? selectedExpressions.map(exp => `(${exp.expression})`).join(' AND ')
            : '';
    };

    // Initialize query candidate ONLY on first mount
    useEffect(() => {
        const defaultQuery = getDefaultCombinedQuery();
        if (!queryCandidate) {
            setQueryCandidate(defaultQuery);
        }
    }, []); // Empty dependency array - only runs once on mount

    const handleRefreshFromExpressions = () => {
        const defaultQuery = getDefaultCombinedQuery();
        setQueryCandidate(defaultQuery);
        // Clear test results since we have a new candidate
        setGeneratedKeywords('');
        setEstimatedResults(null);
    };

    const handleTestCandidate = async () => {
        if (!queryCandidate.trim()) return;

        setIsTesting(true);
        try {
            // Test the actual query candidate string directly
            console.log('Testing query candidate:', queryCandidate);

            // We need to test the candidate as a single query string
            // The API expects an array of expressions, so we pass the candidate as a single item
            const response = await testKeywordCombination(
                [queryCandidate], // Pass the candidate as a single expression
                selectedSource
            );

            console.log('Test response:', {
                combined_query: response.combined_query,
                estimated_results: response.estimated_results,
                source: response.source
            });

            // Store the tested query and its results
            setGeneratedKeywords(queryCandidate); // Store what we actually tested
            setEstimatedResults(response.estimated_results);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to test candidate';
            setError(errorMessage);
            console.error('Test candidate error:', err);
        } finally {
            setIsTesting(false);
        }
    };

    // Automatically test candidate ONLY when step first loads
    useEffect(() => {
        // Auto-test ONLY on initial load: has candidate, no keywords, hasn't tested, not generating
        if (queryCandidate && !generatedKeywords && !hasAutoTested && !isGenerating) {
            setHasAutoTested(true);
            handleTestCandidate();
        }
    }, [queryCandidate, hasAutoTested, isGenerating]); // Include queryCandidate to test once it's set

    const handleExpressionSelectionChange = (index: number, checked: boolean) => {
        const newExpressions = [...expandedExpressions];
        newExpressions[index] = { ...newExpressions[index], selected: checked };
        setExpandedExpressions(newExpressions);
        // DON'T automatically update query candidate - user controls when to refresh
    };

    const handleExpressionTextChange = (index: number, text: string) => {
        const newExpressions = [...expandedExpressions];
        newExpressions[index] = { ...newExpressions[index], expression: text };
        setExpandedExpressions(newExpressions);
        // DON'T automatically update query candidate - user controls when to refresh
    };

    const selectedCount = expandedExpressions.filter(exp => exp.selected).length;
    const hasSelectedExpressions = selectedCount > 0;

    // Check if current candidate matches any previously tested query
    const candidateMatchesLastTested = !!(generatedKeywords && generatedKeywords === queryCandidate);

    const handleCandidateChange = (newCandidate: string) => {
        setQueryCandidate(newCandidate);
        // When user manually edits the candidate, it may no longer match tested results
    };

    return (
        <>
            <div className="space-y-4">
                <div>
                    <Badge variant="outline" className="mb-3">Step 4 of 4</Badge>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                        Test & Accept Search Query
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Select expressions and test their combination. When you find a combination you like, accept it to use for your search.
                    </p>
                </div>

                {/* Evidence Spec Reference */}
                {evidenceSpec && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                        <button
                            onClick={() => setShowEvidenceSpec(!showEvidenceSpec)}
                            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Evidence Specification Reference
                                </span>
                            </div>
                            {showEvidenceSpec ? (
                                <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            )}
                        </button>
                        {showEvidenceSpec && (
                            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                    {evidenceSpec}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <div>
                    <Label className="text-sm font-medium mb-3 block">
                        Boolean Expressions ({selectedCount} selected)
                    </Label>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {expandedExpressions.map((expression, index) => (
                            <div key={index} className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                                <input
                                    type="checkbox"
                                    id={`expression-${index}`}
                                    checked={expression.selected || false}
                                    onChange={(e) => handleExpressionSelectionChange(index, e.target.checked)}
                                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                                />
                                <div className="flex-1 min-w-0">
                                    <label htmlFor={`expression-${index}`} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1 cursor-pointer">
                                        {expression.concept}
                                    </label>
                                    <input
                                        type="text"
                                        value={expression.expression}
                                        onChange={(e) => handleExpressionTextChange(index, e.target.value)}
                                        className="w-full text-sm font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-gray-100"
                                        placeholder="Boolean expression..."
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Estimated results: {expression.count.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Combined Query Section */}
                    {hasSelectedExpressions && (
                        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                                Current Query Candidate
                            </h4>
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                                        Query {candidateMatchesLastTested && estimatedResults !== null && '(Tested)'}
                                    </Label>
                                    <Textarea
                                        value={queryCandidate}
                                        onChange={(e) => handleCandidateChange(e.target.value)}
                                        rows={3}
                                        className="text-sm font-mono dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                                        placeholder="Query candidate will appear here..."
                                    />
                                    {candidateMatchesLastTested && estimatedResults !== null && (
                                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                            ✓ Query tested and optimized (~{estimatedResults.toLocaleString()} results)
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        onClick={handleRefreshFromExpressions}
                                        variant="ghost"
                                        size="sm"
                                        disabled={!hasSelectedExpressions}
                                    >
                                        Refresh from Selected Expressions
                                    </Button>

                                    <Button
                                        onClick={handleTestCandidate}
                                        disabled={isTesting || isGenerating || !queryCandidate.trim() || candidateMatchesLastTested}
                                        variant="outline"
                                        size="sm"
                                    >
                                        {isTesting ? (
                                            <>
                                                <div className="animate-spin mr-2 h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                                                Processing...
                                            </>
                                        ) : candidateMatchesLastTested ? (
                                            <>Already Tested</>
                                        ) : (
                                            <>Test Candidate</>
                                        )}
                                    </Button>

                                    <Button
                                        onClick={() => setShowCoverageModal(true)}
                                        disabled={!queryCandidate.trim()}
                                        variant="outline"
                                        size="sm"
                                    >
                                        Test Coverage with Known Articles
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                        Selected expressions will be combined with AND. Test the combination to see the final search query.
                    </p>
                </div>
            </div>

            {/* Coverage Test Modal */}
            {showCoverageModal && (
                <CoverageTestModal
                    query={queryCandidate}
                    source={selectedSource}
                    onClose={() => setShowCoverageModal(false)}
                />
            )}
        </>
    );
}