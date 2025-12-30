/**
 * Tracking API
 *
 * Fire-and-forget event tracking to backend.
 */

import { api } from './index';

export interface TrackEventData {
    [key: string]: string | number | boolean | null | undefined;
}

export interface TrackEventRequest {
    event_type: string;
    event_data?: TrackEventData;
}

/**
 * Track a frontend event.
 * Fire-and-forget - errors are logged but don't throw.
 */
export async function trackEvent(eventType: string, eventData?: TrackEventData): Promise<void> {
    try {
        await api.post('/api/tracking/events', {
            event_type: eventType,
            event_data: eventData
        });
    } catch (error) {
        // Silent fail - don't let tracking errors affect the app
        console.debug('Tracking event failed:', error);
    }
}

/**
 * Common event types and their expected data
 */
export const EventTypes = {
    // Page views
    PAGE_VIEW: 'page_view',

    // Report page events
    VIEW_CHANGE: 'view_change',      // { from: 'list', to: 'grid' }
    ARTICLE_CLICK: 'article_click',  // { pmid: '12345', report_id: 123 }
    ARTICLE_STAR: 'article_star',    // { pmid: '12345', starred: true }

    // Article modal events
    TAB_CLICK: 'tab_click',          // { tab: 'notes', pmid: '12345' }
    MODAL_OPEN: 'modal_open',        // { pmid: '12345' }
    MODAL_CLOSE: 'modal_close',      // { pmid: '12345' }

    // Stream events
    STREAM_VIEW: 'stream_view',      // { stream_id: 5 }
    PIPELINE_RUN: 'pipeline_run',    // { stream_id: 5 }

    // Search events
    SEARCH: 'search',                // { query: '...' }

    // Chat events
    CHAT_OPEN: 'chat_open',          // { page: 'reports' }
    CHAT_CLOSE: 'chat_close',        // { page: 'reports' }
    CHAT_MESSAGE: 'chat_message',    // { page: 'reports' }
} as const;
