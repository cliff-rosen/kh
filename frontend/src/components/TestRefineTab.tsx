import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QueryRefinementWorkbench from './QueryRefinementWorkbench';
import ExecutePipelineTab from './ExecutePipelineTab';
import { ResearchStream } from '../types';

interface TestRefineTabProps {
    streamId: number;
    stream: ResearchStream;
    onStreamUpdate: () => void;
    canModify?: boolean;
}

type SubTab = 'workbench' | 'pipeline';

export default function TestRefineTab({ streamId, stream, onStreamUpdate, canModify = true }: TestRefineTabProps) {
    const [searchParams] = useSearchParams();

    // Check URL params for initial subtab
    const urlSubTab = searchParams.get('subtab') as SubTab;
    const initialSubTab = urlSubTab || 'workbench';
    const [activeSubTab, setActiveSubTab] = useState<SubTab>(initialSubTab);

    return (
        <div className="space-y-6">
            {/* Sub-Tab Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8">
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('workbench')}
                        className={`
                            py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                            ${activeSubTab === 'workbench'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }
                        `}
                    >
                        Refinement Workbench
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('pipeline')}
                        className={`
                            py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                            ${activeSubTab === 'pipeline'
                                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }
                        `}
                    >
                        Full Pipeline Execution
                    </button>
                </nav>
            </div>

            {/* Sub-Tab Content */}
            <div>
                {activeSubTab === 'workbench' && <QueryRefinementWorkbench streamId={streamId} stream={stream} onStreamUpdate={onStreamUpdate} canModify={canModify} />}
                {activeSubTab === 'pipeline' && <ExecutePipelineTab streamId={streamId} canModify={canModify} />}
            </div>
        </div>
    );
}
