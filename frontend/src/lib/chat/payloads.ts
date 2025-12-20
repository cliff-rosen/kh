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

// ============================================================================
// PubMed Article Handler
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
