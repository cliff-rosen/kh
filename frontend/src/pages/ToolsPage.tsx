import { useState } from 'react';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import PubMedIdChecker from '../components/tools/PubMedIdChecker';

export default function ToolsPage() {
    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <WrenchScrewdriverIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Tools
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Utilities for testing and analyzing search queries
                </p>
            </div>

            {/* Tools */}
            <div className="space-y-8">
                <PubMedIdChecker />
            </div>
        </div>
    );
}
