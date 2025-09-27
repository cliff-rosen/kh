import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { TrashIcon, MagnifyingGlassIcon, CheckCircleIcon, XCircleIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

interface PubMedArticle {
  id: string;
  source: string;
  title: string;
  authors: string[];
  journal?: string;
  publication_year?: number;
  abstract?: string;
  is_covered?: boolean;
}

interface SearchPhrase {
  id: string;
  phrase: string;
  estimated_count?: number;
  coverage_count?: number;
  coverage_percentage?: number;
}

export default function PubMedSearchDesigner() {
  const [articles, setArticles] = useState<PubMedArticle[]>([]);
  const [inputPubmedIds, setInputPubmedIds] = useState('');
  const [searchPhrases, setSearchPhrases] = useState<SearchPhrase[]>([]);
  const [currentSearchPhrase, setCurrentSearchPhrase] = useState('');
  const [isTestingSearch, setIsTestingSearch] = useState(false);
  const [isFetchingArticles, setIsFetchingArticles] = useState(false);
  const [analyzingArticleId, setAnalyzingArticleId] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Record<string, { analysis: string; suggestions: string[] }>>({});
  const [collapsedAnalyses, setCollapsedAnalyses] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // Extract PubMed ID from article ID (handles different formats)
  const extractPubMedId = (articleId: string): string => {
    if (articleId.startsWith('pubmed_')) {
      return articleId.replace('pubmed_', '');
    }
    if (articleId.startsWith('pmid:')) {
      return articleId.replace('pmid:', '');
    }
    // If it's already just the numeric ID
    return articleId;
  };

  const handleFetchArticles = async () => {
    if (!inputPubmedIds.trim()) return;

    // Parse IDs from input (comma, space, tab, or newline separated)
    const idList = inputPubmedIds
      .split(/[,\s\t\n]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (idList.length === 0) {
      toast({
        title: 'No IDs found',
        description: 'Please enter valid PubMed IDs',
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicates (normalize IDs for comparison)
    const existingIds = articles.map(a => extractPubMedId(a.id));
    const newIds = idList.filter(id => !existingIds.includes(extractPubMedId(id)));

    if (newIds.length === 0) {
      toast({
        title: 'All IDs already added',
        description: 'These PubMed IDs have already been added',
        variant: 'destructive',
      });
      return;
    }

    setIsFetchingArticles(true);
    try {
      const response = await api.post('/api/pubmed/fetch-articles', {
        pubmed_ids: newIds
      });

      const newArticles = response.data.articles || [];
      setArticles([...articles, ...newArticles]);
      setInputPubmedIds('');

      toast({
        title: 'Success',
        description: `Fetched ${newArticles.length} articles`,
      });
    } catch (error) {
      console.error('Failed to fetch articles:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch PubMed articles',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingArticles(false);
    }
  };

  const handleRemoveArticle = (id: string) => {
    setArticles(articles.filter(article => article.id !== id));
    // Re-test search phrases if any exist
    if (searchPhrases.length > 0) {
      retestAllSearchPhrases();
    }
  };

  const handleClearAllArticles = () => {
    setArticles([]);
    // Clear search phrases since they're no longer relevant
    setSearchPhrases([]);
  };

  const testSearchPhrase = async () => {
    if (!currentSearchPhrase.trim()) return;

    setIsTestingSearch(true);
    try {
      const response = await api.post('/api/pubmed/test-search', {
        search_phrase: currentSearchPhrase.trim(),
        pubmed_ids: articles.map(a => extractPubMedId(a.id))
      });

      console.log('Test search response:', response.data);

      const newSearchPhrase: SearchPhrase = {
        id: Date.now().toString(),
        phrase: currentSearchPhrase.trim(),
        estimated_count: response.data.estimated_count,
        coverage_count: response.data.coverage_count,
        coverage_percentage: response.data.coverage_percentage
      };

      setSearchPhrases([...searchPhrases, newSearchPhrase]);

      // Update coverage status for articles
      if (response.data.covered_ids) {
        setArticles(articles.map(article => ({
          ...article,
          is_covered: response.data.covered_ids.includes(extractPubMedId(article.id))
        })));
      }

      setCurrentSearchPhrase('');

      toast({
        title: 'Search Tested',
        description: `Found ${response.data.estimated_count?.toLocaleString()} results. Covers ${response.data.coverage_count} of your PubMed IDs (${response.data.coverage_percentage}%)`,
      });
    } catch (error) {
      console.error('Failed to test search phrase:', error);
      toast({
        title: 'Error',
        description: 'Failed to test search phrase',
        variant: 'destructive',
      });
    } finally {
      setIsTestingSearch(false);
    }
  };

  const retestAllSearchPhrases = async () => {
    // Re-test all search phrases against current articles
    const updatedPhrases = [];
    for (const phrase of searchPhrases) {
      try {
        const response = await api.post('/api/pubmed/test-search', {
          search_phrase: phrase.phrase,
          pubmed_ids: articles.map(a => extractPubMedId(a.id))
        });
        updatedPhrases.push({
          ...phrase,
          coverage_count: response.data.coverage_count,
          coverage_percentage: response.data.coverage_percentage
        });
      } catch (error) {
        console.error(`Failed to retest phrase: ${phrase.phrase}`, error);
        updatedPhrases.push(phrase);
      }
    }
    setSearchPhrases(updatedPhrases);
  };

  const removeSearchPhrase = (id: string) => {
    setSearchPhrases(searchPhrases.filter(phrase => phrase.id !== id));
  };

  const analyzeWhyNotMatched = async (article: PubMedArticle) => {
    // Only analyze if we have search phrases and this article is not covered
    if (searchPhrases.length === 0 || article.is_covered !== false) return;

    const lastSearchPhrase = searchPhrases[searchPhrases.length - 1];

    setAnalyzingArticleId(article.id);
    try {
      const response = await api.post('/api/pubmed/analyze-mismatch', {
        pubmed_id: extractPubMedId(article.id),
        search_phrase: lastSearchPhrase.phrase,
        title: article.title,
        abstract: article.abstract
      });

      setAnalysisResults(prev => ({
        ...prev,
        [article.id]: {
          analysis: response.data.analysis,
          suggestions: response.data.suggestions || []
        }
      }));

      // Ensure the analysis is visible when first created
      setCollapsedAnalyses(prev => ({
        ...prev,
        [article.id]: false
      }));

      toast({
        title: 'Analysis Complete',
        description: 'See why this article wasn\'t matched below',
      });
    } catch (error) {
      console.error('Failed to analyze mismatch:', error);
      toast({
        title: 'Analysis Failed',
        description: 'Could not analyze why this article wasn\'t matched',
        variant: 'destructive',
      });
    } finally {
      setAnalyzingArticleId(null);
    }
  };

  const toggleAnalysisCollapsed = (articleId: string) => {
    setCollapsedAnalyses(prev => ({
      ...prev,
      [articleId]: !prev[articleId]
    }));
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">PubMed Search Designer</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Design and test PubMed search phrases to ensure coverage of your target articles
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PubMed IDs Section */}
        <Card className="dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-gray-100">Target PubMed Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Textarea
                placeholder="Enter PubMed IDs (comma, space, or line separated)\nExample: 35184731, 35184732, 35184733"
                value={inputPubmedIds}
                onChange={(e) => setInputPubmedIds(e.target.value)}
                rows={3}
                className="dark:bg-gray-700 dark:text-gray-100"
              />
              <Button
                onClick={handleFetchArticles}
                disabled={!inputPubmedIds.trim() || isFetchingArticles}
                className="w-full"
              >
                <DocumentDuplicateIcon className="h-4 w-4 mr-2" />
                {isFetchingArticles ? 'Fetching...' : 'Fetch Article Metadata'}
              </Button>
            </div>

            <div className="space-y-1 mt-4">
              {articles.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    No articles added yet. Enter PubMed IDs above to fetch articles.
                  </p>
                </div>
              ) : (
                articles.map((article) => (
                  <div key={article.id}>
                    <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600">
                      {article.is_covered !== undefined && (
                        article.is_covered ? (
                          <CheckCircleIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircleIcon className="h-4 w-4 text-red-500 flex-shrink-0" />
                        )
                      )}
                      <span className="font-mono text-sm text-gray-900 dark:text-gray-100 flex-shrink-0">
                        {extractPubMedId(article.id)}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1">
                        {article.title}
                      </span>
                      {article.is_covered === false && searchPhrases.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => analyzeWhyNotMatched(article)}
                          disabled={analyzingArticleId === article.id}
                          className="h-6 px-2 text-xs flex-shrink-0 text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                          title="Analyze why this article wasn't matched"
                        >
                          {analyzingArticleId === article.id ? (
                            <div className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full" />
                          ) : (
                            'Why?'
                          )}
                        </Button>
                      )}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveArticle(article.id)}
                        className="h-6 w-6 p-0 flex-shrink-0"
                      >
                        <TrashIcon className="h-3 w-3" />
                      </Button>
                    </div>
                    {analysisResults[article.id] && !collapsedAnalyses[article.id] && (
                      <div className="mt-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg ml-7">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Analysis Result
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleAnalysisCollapsed(article.id)}
                            className="h-6 px-2 text-xs text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            Hide
                          </Button>
                        </div>
                        <div className="text-sm text-gray-900 dark:text-gray-100 mb-2">
                          <strong>Why not matched:</strong> {analysisResults[article.id].analysis}
                        </div>
                        {analysisResults[article.id].suggestions.length > 0 && (
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>Suggested modifications:</strong>
                            <ul className="list-disc list-inside mt-1">
                              {analysisResults[article.id].suggestions.map((suggestion, idx) => (
                                <li key={idx} className="text-xs">{suggestion}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {articles.length > 0 && (
              <div className="mt-4 flex justify-between items-center">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total Articles: {articles.length}
                  {searchPhrases.length > 0 && (
                    <span className="ml-2">
                      | Covered: {articles.filter(a => a.is_covered).length}
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAllArticles}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  Clear All
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search Phrase Builder Section */}
        <Card className="dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-gray-100">Search Phrase Builder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Textarea
                placeholder="Enter your PubMed search phrase (e.g., 'diabetes AND metformin')"
                value={currentSearchPhrase}
                onChange={(e) => setCurrentSearchPhrase(e.target.value)}
                rows={3}
                className="dark:bg-gray-700 dark:text-gray-100"
              />

              <Button
                onClick={testSearchPhrase}
                disabled={!currentSearchPhrase.trim() || isTestingSearch}
                className="w-full"
              >
                <MagnifyingGlassIcon className="h-4 w-4 mr-2" />
                {isTestingSearch ? 'Testing...' : 'Test Search Phrase'}
              </Button>

              <div className="space-y-2">
                {searchPhrases.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">
                      No search phrases tested yet. Enter a phrase above to test coverage.
                    </p>
                  </div>
                ) : (
                  searchPhrases.map((phrase) => (
                    <div
                      key={phrase.id}
                      className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 font-mono text-sm break-all text-gray-900 dark:text-gray-100">
                          {phrase.phrase}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSearchPhrase(phrase.id)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="secondary">
                          {phrase.estimated_count !== undefined
                            ? `${phrase.estimated_count.toLocaleString()} results`
                            : 'Count not available'}
                        </Badge>
                        {articles.length > 0 && (
                          <Badge
                            variant={phrase.coverage_percentage === 100 ? "default" : "outline"}
                          >
                            {phrase.coverage_count}/{articles.length} covered ({phrase.coverage_percentage}%)
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Section */}
      {searchPhrases.length > 0 && articles.length > 0 && (
        <Card className="mt-6 dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-gray-100">Coverage Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {articles.length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total Target Articles
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {articles.filter(a => a.is_covered).length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Articles Covered
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {articles.filter(a => !a.is_covered).length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Articles Not Covered
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {Math.round((articles.filter(a => a.is_covered).length / articles.length) * 100)}%
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Overall Coverage
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}