import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ExternalLink, Calendar, Users, BookOpen, Hash, 
  FileText, ChevronDown, ChevronRight
} from 'lucide-react';
import { CanonicalResearchArticle } from '@/types/canonical_types';

interface OverviewTabProps {
  article: CanonicalResearchArticle;
  featureData: Record<string, any>;
  collectionName?: string;
  collectionFeatures?: Array<{ id: string; name: string; description: string; type: string }>;
}

export function OverviewTab({ article, featureData, collectionFeatures }: OverviewTabProps) {
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());

  const toggleFeatureExpansion = (featureId: string) => {
    setExpandedFeatures(prev => {
      const newSet = new Set(prev);
      if (newSet.has(featureId)) {
        newSet.delete(featureId);
      } else {
        newSet.add(featureId);
      }
      return newSet;
    });
  };
  const getPubMedId = () => {
    if (article.source === 'pubmed' && article.id.includes('pubmed_')) {
      return article.id.replace('pubmed_', '');
    }
    return null;
  };

  const getPubMedUrl = () => {
    const pmid = getPubMedId();
    return pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null;
  };

  const getSourceBadge = (source: string) => {
    const config = source === 'pubmed'
      ? { label: 'PubMed', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' }
      : { label: 'Scholar', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatPublicationDate = () => {
    if (article.publication_date) return article.publication_date;
    if (article.publication_year) return article.publication_year.toString();
    return 'Not specified';
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
          {article.title}
        </h1>

        {/* Article Identifiers */}
        <div className="flex items-center gap-3 flex-wrap">
          {getSourceBadge(article.source)}
          {getPubMedId() && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
              <Hash className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                PMID: {getPubMedId()}
              </span>
            </div>
          )}
          {article.doi && (
            <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 dark:bg-purple-900/20 rounded-md border border-purple-200 dark:border-purple-800">
              <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                DOI: {article.doi}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Article Metadata - Improved Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column - Basic Info */}
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Publication Details</h3>

            {/* Authors */}
            <div className="flex items-start gap-3 mb-3">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Authors</div>
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  {article.authors.length > 0 ? (
                    <>
                      <span className="font-medium">{article.authors[0]}</span>
                      {article.authors.length > 1 && (
                        <span className="text-gray-600 dark:text-gray-400">
                          {article.authors.length === 2
                            ? ` and ${article.authors[1]}`
                            : ` et al. (${article.authors.length} authors)`
                          }
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 italic">Not specified</span>
                  )}
                </div>
              </div>
            </div>

            {/* Journal */}
            <div className="flex items-start gap-3 mb-3">
              <BookOpen className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Journal</div>
                <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                  {article.journal || <span className="text-gray-500 dark:text-gray-400 italic font-normal">Not specified</span>}
                </div>
              </div>
            </div>

            {/* Publication Date */}
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Publication Date</div>
                <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                  {formatPublicationDate()}
                </div>
              </div>
            </div>
          </div>

          {/* Keywords & MeSH Terms */}
          {(article.keywords.length > 0 || article.mesh_terms.length > 0) && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Keywords & Tags</h3>
              
              {article.keywords.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Keywords</div>
                  <div className="flex flex-wrap gap-1">
                    {article.keywords.map((keyword, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {article.mesh_terms.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">MeSH Terms</div>
                  <div className="flex flex-wrap gap-1">
                    {article.mesh_terms.map((term, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column - Features & Actions */}
        <div className="space-y-4">
          {/* Extracted Features */}
          {Object.keys(featureData).length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Extracted Features ({Object.keys(featureData).length})
              </h3>
              <div className="space-y-2">
                {Object.entries(featureData).map(([featureId, value]) => {
                  // Find the feature definition to get the display name
                  const feature = collectionFeatures?.find(f => f.id === featureId);
                  const displayName = feature?.name || featureId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  const rawValue = typeof value === 'object' && value?.value ? value.value : (typeof value === 'object' ? JSON.stringify(value) : String(value));
                  const isExpanded = expandedFeatures.has(featureId);
                  
                  // Handle boolean values specially
                  const isBoolean = feature?.type === 'boolean';
                  const isTrueValue = isBoolean && (rawValue === 'true' || rawValue === true || rawValue === 'yes' || rawValue === 'Yes');
                  const isFalseValue = isBoolean && (rawValue === 'false' || rawValue === false || rawValue === 'no' || rawValue === 'No');
                  
                  let displayValue;
                  let valueClassName = "text-sm font-medium";
                  
                  if (isBoolean) {
                    if (isTrueValue) {
                      displayValue = "✓ Yes";
                      valueClassName += " text-green-700 dark:text-green-400 font-semibold";
                    } else if (isFalseValue) {
                      displayValue = "✗ No";
                      valueClassName += " text-gray-600 dark:text-gray-400";
                    } else {
                      displayValue = rawValue || "No value";
                      valueClassName += " text-gray-500 dark:text-gray-500 italic";
                    }
                  } else {
                    displayValue = rawValue || "No value";
                    valueClassName += rawValue ? " text-gray-900 dark:text-gray-100" : " text-gray-500 dark:text-gray-500 italic";
                  }
                  
                  return (
                    <div key={featureId} className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600">
                      <div className="p-3">
                        {/* Compact single line display */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {displayName}
                            </span>
                            {feature?.type && (
                              <Badge variant="outline" className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0">
                                {feature.type}
                              </Badge>
                            )}
                            {feature?.description && (
                              <button
                                onClick={() => toggleFeatureExpansion(featureId)}
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex-shrink-0"
                                title={isExpanded ? "Hide details" : "Show details"}
                              >
                                {isExpanded ? 
                                  <ChevronDown className="w-4 h-4" /> : 
                                  <ChevronRight className="w-4 h-4" />
                                }
                              </button>
                            )}
                          </div>
                          <div className={`${valueClassName} text-right max-w-[40%] truncate`}>
                            {displayValue}
                          </div>
                        </div>
                        
                        {/* Expandable description */}
                        {feature?.description && isExpanded && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                              <span className="font-medium">Extraction Prompt:</span><br />
                              {feature.description}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Actions</h3>
            <div className="space-y-2">
              {getPubMedUrl() && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => window.open(getPubMedUrl()!, '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                  View on PubMed
                </Button>
              )}
              {article.pdf_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => window.open(article.pdf_url!, '_blank')}
                >
                  <FileText className="w-4 h-4" />
                  View PDF
                </Button>
              )}
              {article.url && !getPubMedUrl() && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => window.open(article.url!, '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                  View Original
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Abstract */}
      {article.abstract && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Abstract</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {article.abstract}
          </p>
        </div>
      )}
    </div>
  );
}