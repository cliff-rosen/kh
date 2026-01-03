import { useState } from 'react';
import { WrenchScrewdriverIcon, MagnifyingGlassIcon, DocumentTextIcon, DocumentMagnifyingGlassIcon, TableCellsIcon } from '@heroicons/react/24/outline';
import PubMedIdChecker from '../components/tools/PubMedIdChecker';
import PubMedSearch from '../components/tools/PubMedSearch';
import { DocumentAnalysis } from '../components/tools/DocumentAnalysis';
import { Tablizer } from '../components/tools/Tablizer';

type ToolTab = 'search' | 'id-checker' | 'document-analysis' | 'tablizer';

const tabs: { id: ToolTab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
        id: 'search',
        label: 'PubMed Search',
        description: 'Search PubMed with custom queries and date filters',
        icon: DocumentTextIcon,
    },
    {
        id: 'id-checker',
        label: 'PubMed ID Checker',
        description: 'Test which PubMed IDs are captured by a search query',
        icon: MagnifyingGlassIcon,
    },
    {
        id: 'document-analysis',
        label: 'Document Analysis',
        description: 'AI-powered document summarization and extraction',
        icon: DocumentMagnifyingGlassIcon,
    },
    {
        id: 'tablizer',
        label: 'Tablizer',
        description: 'AI-powered table enrichment with generated columns',
        icon: TableCellsIcon,
    },
];

export default function ToolsPage() {
    const [activeTab, setActiveTab] = useState<ToolTab>('search');

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

            {/* Tab Navigation */}
            <div className="mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                                        ${isActive
                                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }
                                    `}
                                >
                                    <Icon className={`h-5 w-5 ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Active Tool */}
            <div>
                {activeTab === 'search' && <PubMedSearch />}
                {activeTab === 'id-checker' && <PubMedIdChecker />}
                {activeTab === 'document-analysis' && <DocumentAnalysis />}
                {activeTab === 'tablizer' && (
                    <Tablizer
                        title="Tablizer Demo"
                        initialData={[
                            { id: '1', pmid: '12345678', title: 'Effects of exercise on cardiovascular health in older adults', abstract: 'This randomized controlled trial examined the effects of moderate aerobic exercise on cardiovascular markers in adults aged 65 and older. Participants were assigned to either an exercise group or control group for 12 weeks.', year: '2023' },
                            { id: '2', pmid: '23456789', title: 'Meta-analysis of vitamin D supplementation and bone density', abstract: 'We conducted a systematic review and meta-analysis of randomized trials evaluating vitamin D supplementation effects on bone mineral density. Thirty-two studies met inclusion criteria.', year: '2022' },
                            { id: '3', pmid: '34567890', title: 'Case-control study of dietary patterns and colorectal cancer risk', abstract: 'This case-control study investigated the association between dietary patterns and colorectal cancer risk in a Mediterranean population. Cases were matched with controls by age and sex.', year: '2023' },
                            { id: '4', pmid: '45678901', title: 'Cohort study of sleep duration and cognitive decline', abstract: 'A prospective cohort study followed 5,000 participants over 10 years to examine the relationship between sleep duration and cognitive function decline in middle-aged adults.', year: '2021' },
                            { id: '5', pmid: '56789012', title: 'Cross-sectional analysis of smartphone use and mental health', abstract: 'This cross-sectional study surveyed 10,000 adolescents to examine associations between smartphone usage patterns and symptoms of anxiety and depression.', year: '2024' },
                        ]}
                        initialColumns={[
                            { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
                            { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
                            { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: true },
                            { id: 'year', label: 'Year', accessor: 'year', type: 'text', visible: true },
                        ]}
                    />
                )}
            </div>
        </div>
    );
}
