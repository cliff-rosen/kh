import { useState, useMemo, useRef, useCallback } from 'react';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import TablizerLayout from '../../components/tablizer/TablizerLayout';
import TablizePubMed, { TablizePubMedRef, TablizePubMedState } from '../../components/tools/TablizePubMed';
import ChatTray from '../../components/chat/ChatTray';
import QuerySuggestionCard from '../../components/chat/QuerySuggestionCard';
import AIColumnCard from '../../components/chat/AIColumnCard';
import { PayloadHandler } from '../../types/chat';

export default function TablizerAppPage() {
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Ref to TablizePubMed for imperative commands
    const tablizePubMedRef = useRef<TablizePubMedRef>(null);

    // State from TablizePubMed for chat context
    const [tablizePubMedState, setTablizePubMedState] = useState<TablizePubMedState>({
        query: '',
        startDate: '',
        endDate: '',
        dateType: 'publication',
        totalMatched: 0,
        loadedCount: 0,
        snapshots: [],
        compareMode: false,
        aiColumns: [],
        articles: []
    });

    // Handle state changes from TablizePubMed
    const handleStateChange = useCallback((state: TablizePubMedState) => {
        setTablizePubMedState(state);
    }, []);

    // Chat context for the Tablizer page
    const chatContext = useMemo(() => ({
        current_page: 'tablizer',
        query: tablizePubMedState.query,
        start_date: tablizePubMedState.startDate,
        end_date: tablizePubMedState.endDate,
        date_type: tablizePubMedState.dateType,
        total_matched: tablizePubMedState.totalMatched,
        loaded_count: tablizePubMedState.loadedCount,
        snapshots: tablizePubMedState.snapshots,
        compare_mode: tablizePubMedState.compareMode,
        ai_columns: tablizePubMedState.aiColumns,
        articles: tablizePubMedState.articles
    }), [tablizePubMedState]);

    // Handle query suggestion acceptance
    const handleQueryAccept = useCallback((data: {
        query_expression: string;
        start_date?: string | null;
        end_date?: string | null;
        date_type?: 'publication' | 'entry';
    }) => {
        if (tablizePubMedRef.current) {
            tablizePubMedRef.current.setQuery(data.query_expression);
            // Set dates if provided
            if (data.start_date || data.end_date) {
                tablizePubMedRef.current.setDates(
                    data.start_date || '',
                    data.end_date || '',
                    data.date_type || 'publication'
                );
            }
            tablizePubMedRef.current.executeSearch();
        }
    }, []);

    // Handle AI column suggestion acceptance
    const handleAIColumnAccept = useCallback((data: { name: string; criteria: string; type: 'boolean' | 'text' }) => {
        if (tablizePubMedRef.current) {
            tablizePubMedRef.current.addAIColumn(data.name, data.criteria, data.type);
        }
    }, []);

    // Payload handlers for ChatTray
    const payloadHandlers = useMemo<Record<string, PayloadHandler>>(() => ({
        query_suggestion: {
            render: (payload, callbacks) => (
                <QuerySuggestionCard
                    proposal={payload}
                    onAccept={(data) => {
                        handleQueryAccept(data);
                        callbacks.onAccept?.(payload);
                    }}
                    onReject={callbacks.onReject}
                />
            ),
            renderOptions: {
                panelWidth: '550px',
                headerTitle: 'PubMed Query Suggestion',
                headerIcon: '🔍'
            }
        },
        ai_column_suggestion: {
            render: (payload, callbacks) => (
                <AIColumnCard
                    suggestion={payload}
                    onAccept={(data) => {
                        handleAIColumnAccept(data);
                        callbacks.onAccept?.(payload);
                    }}
                    onReject={callbacks.onReject}
                />
            ),
            renderOptions: {
                panelWidth: '500px',
                headerTitle: 'AI Column Suggestion',
                headerIcon: '✨'
            }
        }
    }), [handleQueryAccept, handleAIColumnAccept]);

    return (
        <TablizerLayout hideFooter>
            <div className="flex h-full">
                {/* Chat Tray */}
                <ChatTray
                    initialContext={chatContext}
                    payloadHandlers={payloadHandlers}
                    isOpen={isChatOpen}
                    onOpenChange={setIsChatOpen}
                />

                {/* Main Content - scrollable */}
                <div className="flex-1 min-w-0 overflow-y-auto">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                        <TablizePubMed
                            ref={tablizePubMedRef}
                            onStateChange={handleStateChange}
                        />
                    </div>
                </div>

                {/* Floating Chat Button - visible when chat is closed */}
                {!isChatOpen && (
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="fixed bottom-6 left-6 p-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-all hover:scale-105 z-50"
                        aria-label="Open chat assistant"
                    >
                        <ChatBubbleLeftRightIcon className="h-6 w-6" />
                    </button>
                )}
            </div>
        </TablizerLayout>
    );
}
