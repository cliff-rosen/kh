/**
 * Global Payload Handler Registrations
 *
 * This file registers render functions for common payload types.
 * These are automatically registered when the chat library is imported.
 *
 * Note: Page-specific callbacks (onAccept, onReject) are still provided
 * by individual pages when using ChatTray.
 */

import React from 'react';
import { registerPayloadHandler } from './payloadRegistry';
import PubMedArticleCard, { PubMedArticleData } from '../../components/chat/PubMedArticleCard';
import PubMedSearchResultsCard, { PubMedSearchResultsData } from '../../components/chat/PubMedSearchResultsCard';
import DeepResearchResultCard, { DeepResearchResultData } from '../../components/chat/DeepResearchResultCard';

// ============================================================================
// PubMed Article Handler (single article details)
// ============================================================================

registerPayloadHandler('pubmed_article', {
    render: (data: PubMedArticleData) => React.createElement(PubMedArticleCard, { article: data }),
    renderOptions: {
        panelWidth: '550px',
        headerTitle: 'PubMed Article',
        headerIcon: '📄'
    }
});

// ============================================================================
// PubMed Search Results Handler (table of search results)
// ============================================================================

registerPayloadHandler('pubmed_search_results', {
    render: (data: PubMedSearchResultsData) => React.createElement(PubMedSearchResultsCard, { data }),
    renderOptions: {
        panelWidth: '800px',
        headerTitle: 'PubMed Search Results',
        headerIcon: '🔍'
    }
});

// ============================================================================
// Deep Research Result Handler (comprehensive research with citations)
// ============================================================================

registerPayloadHandler('deep_research_result', {
    render: (data: DeepResearchResultData) => React.createElement(DeepResearchResultCard, { data }),
    renderOptions: {
        panelWidth: '700px',
        headerTitle: 'Deep Research',
        headerIcon: '🔬'
    }
});

// ============================================================================
// Article Details Handler (article from report context)
// ============================================================================

registerPayloadHandler('article_details', {
    render: (data: PubMedArticleData) => React.createElement(PubMedArticleCard, { article: data }),
    renderOptions: {
        panelWidth: '550px',
        headerTitle: 'Article Details',
        headerIcon: '📄'
    }
});

// ============================================================================
// Additional payload types can be registered here as needed.
//
// The pattern is:
// 1. Import the card component
// 2. Register with registerPayloadHandler(type, { render, renderOptions })
//
// For payloads that require page-specific callbacks (like schema_proposal,
// stream_suggestions), those are still provided via the payloadHandlers prop
// on ChatTray since they need access to page state and navigation.
// ============================================================================
