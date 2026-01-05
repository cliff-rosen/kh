import { useState, useMemo } from 'react';
import TablizerLayout from '../../components/tablizer/TablizerLayout';
import TablizePubMed from '../../components/tools/TablizePubMed';
import ChatTray from '../../components/chat/ChatTray';
import QuerySuggestionCard from '../../components/chat/QuerySuggestionCard';
import AIColumnCard from '../../components/chat/AIColumnCard';
import { PayloadHandler } from '../../types/chat';

export default function TablizerAppPage() {
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Chat context for the Tablizer page
    // TODO: Wire up actual state from TablizePubMed component
    const chatContext = useMemo(() => ({
        current_page: 'tablizer',
        // These would ideally come from TablizePubMed state
        query: '',
        total_matched: 0,
        loaded_count: 0,
        snapshots: [],
        compare_mode: false,
        ai_columns: [],
        articles: []
    }), []);

    // Payload handlers for ChatTray
    const payloadHandlers = useMemo<Record<string, PayloadHandler>>(() => ({
        query_suggestion: {
            render: (payload, callbacks) => (
                <QuerySuggestionCard
                    proposal={payload}
                    onAccept={(data) => {
                        // TODO: Wire up to set query in TablizePubMed
                        console.log('Query suggestion accepted:', data);
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
                        // TODO: Wire up to add AI column in TablizePubMed
                        console.log('AI column suggestion accepted:', data);
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
    }), []);

    return (
        <TablizerLayout>
            <div className="flex h-full">
                {/* Chat Tray */}
                <ChatTray
                    initialContext={chatContext}
                    payloadHandlers={payloadHandlers}
                    isOpen={isChatOpen}
                    onOpenChange={setIsChatOpen}
                />

                {/* Main Content */}
                <div className="flex-1 min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <TablizePubMed />
                </div>
            </div>
        </TablizerLayout>
    );
}
