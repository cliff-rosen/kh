import { useState } from 'react';
import { Database, Wrench } from 'lucide-react';

import { Chat } from '@/components/features/chat';
import { Workspace } from '@/components/features/workspace';
import { AssetPanels } from '@/components/features/asset';
import { StateInspector } from '@/components/features/diagnostics';
import { ToolBrowserDialog } from '@/components/features/tools';

export default function JamBotPage() {
    const [isStateInspectorOpen, setIsStateInspectorOpen] = useState(false);
    const [isToolBrowserOpen, setIsToolBrowserOpen] = useState(false);

    return (
        <div className="relative flex h-full bg-gray-50 dark:bg-gray-900">
            {/* Inspector Buttons */}
            <div className="absolute top-2 right-2 z-10 flex gap-2">
                <button
                    onClick={() => setIsToolBrowserOpen(true)}
                    className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    title="Browse Available Tools"
                >
                    <Wrench className="w-5 h-5" />
                </button>
                <button
                    onClick={() => setIsStateInspectorOpen(true)}
                    className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    title="Inspect JamBot State"
                >
                    <Database className="w-5 h-5" />
                </button>
            </div>

            <StateInspector
                isOpen={isStateInspectorOpen}
                onClose={() => setIsStateInspectorOpen(false)}
            />

            <ToolBrowserDialog
                isOpen={isToolBrowserOpen}
                onClose={() => setIsToolBrowserOpen(false)}
            />

            {/* Chat Area - Fixed width */}
            <div className="w-[400px] h-full flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700">
                <Chat />
            </div>

            {/* Workspace - Fixed width */}
            <div className="w-[600px] h-full flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700">
                <Workspace />
            </div>

            {/* Asset Panels - Flexible width */}
            <div className="flex-1 h-full min-w-[500px] bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900">
                <div className="h-full mx-4 my-2 rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700">
                    <AssetPanels />
                </div>
            </div>
        </div>
    );
}; 