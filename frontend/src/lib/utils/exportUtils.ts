/**
 * Export utilities for SmartSearch2 results
 * Supports CSV, BibTeX, and PDF export formats
 */

import type { SmartSearchArticle } from '@/types/smart-search';
import type { CanonicalFeatureDefinition } from '@/types/canonical_types';

/**
 * Export articles to CSV format
 */
export const exportToCSV = (
  articles: SmartSearchArticle[],
  appliedFeatures: CanonicalFeatureDefinition[] = []
) => {
  // Build CSV headers - basic columns plus applied features
  const basicHeaders = ['Title', 'Authors', 'Year', 'Journal', 'Abstract', 'URL', 'DOI', 'PMID'];
  const featureHeaders = appliedFeatures.map(f => f.name);
  const allHeaders = [...basicHeaders, ...featureHeaders];

  // Helper function to extract PMID
  const extractPmid = (article: SmartSearchArticle): string => {
    if (article.id && article.id.startsWith('pmid:')) {
      return article.id.replace('pmid:', '');
    }
    if (article.id && article.id.startsWith('pubmed_')) {
      return article.id.replace('pubmed_', '');
    }
    return article.id || '';
  };

  // Helper function to escape CSV values
  const escapeCSV = (value: string | undefined | null): string => {
    if (!value) return '';
    return `"${value.toString().replace(/"/g, '""')}"`;
  };

  // Build CSV rows
  const csvRows = [
    allHeaders.join(','),
    ...articles.map(article => {
      const basicValues = [
        escapeCSV(article.title),
        escapeCSV(article.authors?.join('; ')),
        article.publication_year?.toString() || '',
        escapeCSV(article.journal),
        escapeCSV(article.abstract),
        article.url || '',
        article.doi || '',
        extractPmid(article)
      ];

      // Add feature values
      const featureValues = appliedFeatures.map(feature => {
        const value = article.extracted_features?.[feature.id];
        return escapeCSV(value?.toString());
      });

      return [...basicValues, ...featureValues].join(',');
    })
  ];

  const csvContent = csvRows.join('\n');
  downloadFile(csvContent, 'text/csv', 'csv');

  return {
    success: true,
    count: articles.length,
    message: `Exported ${articles.length} articles to CSV file`
  };
};

/**
 * Copy PubMed IDs to clipboard
 */
export const copyPMIDsToClipboard = async (articles: SmartSearchArticle[]) => {
  // Helper function to extract PMID
  const extractPmid = (article: SmartSearchArticle): string => {
    if (article.id && article.id.startsWith('pmid:')) {
      return article.id.replace('pmid:', '');
    }
    if (article.id && article.id.startsWith('pubmed_')) {
      return article.id.replace('pubmed_', '');
    }
    return article.id || '';
  };

  // Filter to only accepted articles and extract PMIDs
  const acceptedArticles = articles.filter(article =>
    !article.filterStatus || article.filterStatus.passed !== false
  );

  const pmids = acceptedArticles
    .map(article => extractPmid(article))
    .filter(pmid => pmid && pmid.length > 0); // Only include valid PMIDs

  if (pmids.length === 0) {
    return {
      success: false,
      count: 0,
      message: 'No PubMed IDs found in articles'
    };
  }

  const pmidText = pmids.join('\n');

  try {
    await navigator.clipboard.writeText(pmidText);
    return {
      success: true,
      count: pmids.length,
      message: `Copied ${pmids.length} PubMed IDs to clipboard`
    };
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = pmidText;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);

    return {
      success: true,
      count: pmids.length,
      message: `Copied ${pmids.length} PubMed IDs to clipboard`
    };
  }
};

/**
 * Export articles to PDF format (opens print dialog)
 */
export const exportToPDF = (
  articles: SmartSearchArticle[],
  searchQuery?: string,
  filterCondition?: string,
  appliedFeatures: CanonicalFeatureDefinition[] = []
) => {
  // Filter to only accepted articles for PDF export
  const acceptedArticles = articles.filter(article =>
    !article.filterStatus || article.filterStatus.passed !== false
  );

  // Helper function to extract PMID
  const extractPmid = (article: SmartSearchArticle): string => {
    if (article.id && article.id.startsWith('pmid:')) {
      return article.id.replace('pmid:', '');
    }
    if (article.id && article.id.startsWith('pubmed_')) {
      return article.id.replace('pubmed_', '');
    }
    return article.id || '';
  };

  // Create HTML content for PDF generation
  const htmlContent = `
    <html>
      <head>
        <title>Smart Search 2 Results</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.4; }
          .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .summary { background: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          .article { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; page-break-inside: avoid; }
          .article-title { font-weight: bold; font-size: 16px; margin-bottom: 8px; color: #333; }
          .article-meta { color: #666; margin-bottom: 10px; }
          .article-abstract { margin-bottom: 10px; }
          .features { background: #f9f9f9; padding: 10px; margin-top: 10px; border-radius: 3px; }
          .feature-item { margin-bottom: 5px; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Smart Search 2 Results</h1>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="summary">
          ${searchQuery ? `<p><strong>Search Query:</strong> ${searchQuery}</p>` : ''}
          ${filterCondition ? `<p><strong>Filter Condition:</strong> ${filterCondition}</p>` : ''}
          <p><strong>Total Articles:</strong> ${acceptedArticles.length}</p>
          ${appliedFeatures.length > 0 ? `<p><strong>Extracted Features:</strong> ${appliedFeatures.map(f => f.name).join(', ')}</p>` : ''}
        </div>

        ${acceptedArticles.map((article) => `
          <div class="article">
            <div class="article-title">${article.title || 'No title'}</div>
            <div class="article-meta">
              ${article.authors?.length ? `<strong>Authors:</strong> ${article.authors.join(', ')}<br>` : ''}
              ${article.journal ? `<strong>Journal:</strong> ${article.journal}<br>` : ''}
              ${article.publication_year ? `<strong>Year:</strong> ${article.publication_year}<br>` : ''}
              ${article.doi ? `<strong>DOI:</strong> ${article.doi}<br>` : ''}
              ${extractPmid(article) ? `<strong>PMID:</strong> ${extractPmid(article)}<br>` : ''}
            </div>
            ${article.abstract ? `
              <div class="article-abstract">
                <strong>Abstract:</strong> ${article.abstract}
              </div>
            ` : ''}
            ${appliedFeatures.length > 0 && article.extracted_features ? `
              <div class="features">
                <strong>Extracted Features:</strong>
                ${appliedFeatures.map(feature => {
                  const value = article.extracted_features?.[feature.id];
                  return value ? `<div class="feature-item"><strong>${feature.name}:</strong> ${value}</div>` : '';
                }).filter(Boolean).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </body>
    </html>
  `;

  // Open print dialog
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }

  return {
    success: true,
    count: acceptedArticles.length,
    message: 'PDF export dialog opened. Use your browser\'s print-to-PDF function.'
  };
};

/**
 * Helper function to download files
 */
const downloadFile = (content: string, mimeType: string, extension: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `smart-search2-results-${new Date().toISOString().split('T')[0]}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
};