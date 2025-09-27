import React from 'react';
import DataViewer from './DataViewer';

interface EvaluationDataViewerProps {
    label: string;
    data: any;
    className?: string;
}

/**
 * Compact component for displaying evaluation data
 * with label and value on a single line
 */
export const EvaluationDataViewer: React.FC<EvaluationDataViewerProps> = ({
    label,
    data,
    className = '',
}) => {
    // Determine if this is a complex data type that should be initially collapsed
    const isComplexData = data !== null && typeof data === 'object';
    const shouldInitiallyExpand = !isComplexData ||
        (Array.isArray(data) && data.length <= 3) ||
        (!Array.isArray(data) && Object.keys(data).length <= 5);

    return (
        <div className={`flex items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${className}`}>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 w-1/4">
                {label}:
            </div>
            <div className="w-3/4">
                <DataViewer
                    data={data}
                    initiallyExpanded={shouldInitiallyExpand}
                    isInline={!isComplexData}
                    className="ml-2"
                />
            </div>
        </div>
    );
};

export default EvaluationDataViewer; 