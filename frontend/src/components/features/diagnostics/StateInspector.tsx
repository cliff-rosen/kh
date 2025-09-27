import { useState } from 'react';
import Dialog from '@/components/common/Dialog';
import { Clipboard, Upload, Check } from 'lucide-react';

import { useJamBot } from '@/context/JamBotContext';

import { VariableRenderer } from '@/components/common/VariableRenderer';
import { MissionBrowser } from '@/components/features/diagnostics/MissionBrowser';

interface StateInspectorProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function StateInspector({ isOpen, onClose }: StateInspectorProps) {
    const { state, setState } = useJamBot();
    const [pasteError, setPasteError] = useState<string | null>(null);
    const [showPasteArea, setShowPasteArea] = useState(false);
    const [pasteContent, setPasteContent] = useState('');
    const [copySuccess, _setCopySuccess] = useState(false);
    const [activeTab, setActiveTab] = useState<'state' | 'mission'>('state');

    if (!isOpen) {
        return null;
    }

    const handleCopy = async () => {
        try {
            const text = JSON.stringify(state, null, 2);
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setPasteError('State copied to clipboard!');
            setTimeout(() => setPasteError(null), 2000);
        } catch (err) {
            setPasteError('Failed to copy state');
            console.error('Failed to copy state:', err);
        }
    };

    const handlePaste = () => {
        setShowPasteArea(true);
        setPasteError(null);
    };

    const handleApplyPastedState = () => {
        try {
            // First validate that the pasted content is valid JSON
            const newState = JSON.parse(pasteContent);

            // Validate that the new state has the required structure
            if (!newState || typeof newState !== 'object') {
                throw new Error('Invalid state structure');
            }

            // Validate required fields
            const requiredFields = ['currentMessages', 'currentStreamingMessage', 'mission'];
            const missingFields = requiredFields.filter(field => !(field in newState));

            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Validate mission structure if present
            if (newState.mission !== null && (typeof newState.mission !== 'object' || !newState.mission.id)) {
                throw new Error('Invalid mission structure - must be null or object with id');
            }

            // Apply the state if all validations pass
            setState(newState);
            setPasteError(null);
            setShowPasteArea(false);
            setPasteContent('');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Invalid JSON. Please check the format.';
            setPasteError(errorMessage);
            console.error('Failed to parse state:', err);
        }
    };

    return (
        <Dialog isOpen={isOpen} onClose={onClose} title="JamBot State Inspector" maxWidth="6xl">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            className={`p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ${copySuccess ? 'text-green-500' : ''}`}
                            title="Copy state to clipboard"
                        >
                            {copySuccess ? <Check size={20} /> : <Clipboard size={20} />}
                        </button>
                        <button
                            onClick={handlePaste}
                            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="Paste state from clipboard"
                        >
                            <Upload size={20} />
                        </button>
                    </div>
                </div>
                <div className="border-b dark:border-gray-700">
                    <div className="flex items-center px-4">
                        <button
                            onClick={() => setActiveTab('state')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'state'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            State
                        </button>
                        <button
                            onClick={() => setActiveTab('mission')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'mission'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            Mission Browser
                        </button>
                    </div>
                </div>
                {pasteError && (
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
                        {pasteError}
                    </div>
                )}
                {showPasteArea && (
                    <div className="p-4 border-b dark:border-gray-700">
                        <textarea
                            value={pasteContent}
                            onChange={(e) => setPasteContent(e.target.value)}
                            className="w-full h-32 p-2 border dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                            placeholder="Paste state JSON here..."
                        />
                        <div className="flex justify-end mt-2 gap-2">
                            <button
                                onClick={() => {
                                    setShowPasteArea(false);
                                    setPasteContent('');
                                    setPasteError(null);
                                }}
                                className="px-3 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApplyPastedState}
                                className="px-3 py-1 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors"
                            >
                                Apply State
                            </button>
                        </div>
                    </div>
                )}
                <div className="p-4 overflow-auto flex-1">
                    {activeTab === 'state' ? (
                        <VariableRenderer value={state} />
                    ) : (
                        <MissionBrowser mission={state.mission} />
                    )}
                </div>
            </div>
        </Dialog>
    );
} 