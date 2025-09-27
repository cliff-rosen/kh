import React from 'react'

interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: string;  // Optional maxWidth prop
    headerContent?: React.ReactNode;  // Optional header content
}

const Dialog: React.FC<DialogProps> = ({
    isOpen,
    onClose,
    title,
    children,
    maxWidth = '2xl',  // Default value
    headerContent
}) => {
    if (!isOpen) return null;

    // Map maxWidth to actual CSS width values
    const maxWidthMap: Record<string, string> = {
        'sm': 'max-w-sm',
        'md': 'max-w-md',
        'lg': 'max-w-lg',
        'xl': 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
        '6xl': 'max-w-6xl',
        'full': 'max-w-full',
    };

    const maxWidthClass = maxWidthMap[maxWidth] || 'max-w-2xl';

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen p-0">
                <div className="fixed inset-0 transition-opacity cursor-pointer" aria-hidden="true" onClick={onClose}>
                    <div className="absolute inset-0 bg-gray-500 dark:bg-gray-900 opacity-75"></div>
                </div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <div className={`inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left
                               overflow-hidden shadow-xl transform transition-all my-8
                               ${maxWidthClass} w-full`}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-headline">
                    <div className="px-6 pt-6 pb-4 sm:p-6">
                        <div className="sm:flex sm:items-start">
                            <div className="w-full">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl leading-6 font-medium text-gray-900 dark:text-gray-100" id="modal-headline">
                                        {title}
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        {headerContent}
                                        <button
                                            onClick={onClose}
                                            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none"
                                            aria-label="Close dialog"
                                        >
                                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-2">
                                    {children}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dialog; 