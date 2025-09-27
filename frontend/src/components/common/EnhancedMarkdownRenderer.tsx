import React, { useState } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import MarkdownModal from './MarkdownModal';

interface EnhancedMarkdownRendererProps {
    content: string;
    className?: string;
    variableName?: string;
}

/**
 * An enhanced markdown renderer that includes a button to view the content in a full-screen modal
 */
export const EnhancedMarkdownRenderer: React.FC<EnhancedMarkdownRendererProps> = ({
    content,
    className = '',
    variableName
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const openModal = () => setIsModalOpen(true);
    const closeModal = () => setIsModalOpen(false);

    return (
        <div className={`relative ${className}`}>
            <div className="markdown-preview p-4 max-h-[400px] overflow-y-auto">
                <MarkdownRenderer content={content} />
            </div>

            <button
                onClick={openModal}
                className="absolute top-2 right-2 p-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded-md shadow-sm transition-colors"
                title="View in full screen"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                </svg>
            </button>

            <MarkdownModal
                isOpen={isModalOpen}
                onClose={closeModal}
                content={content}
                title={variableName ? `${variableName} (Markdown)` : 'Markdown Content'}
            />
        </div>
    );
};

export default EnhancedMarkdownRenderer; 