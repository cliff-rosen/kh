import React from 'react';
import DataViewer from './DataViewer';

interface JobDataViewerProps {
    label: string;
    data: any;
    isInput?: boolean;
    isMarkdown?: boolean;
    className?: string;
}

/**
 * Specialized component for displaying job input/output data
 * with appropriate styling and labeling
 */
export const JobDataViewer: React.FC<JobDataViewerProps> = ({
    label,
    data,
    isInput = false,
    isMarkdown = false,
    className = '',
}) => {
    // Determine if this is a complex data type that should be initially collapsed
    const isComplexData = data !== null && typeof data === 'object';
    const shouldInitiallyExpand = !isComplexData ||
        (Array.isArray(data) && data.length <= 3) ||
        (!Array.isArray(data) && Object.keys(data).length <= 5);

    return (
        <div className={`mb-3 ${className}`}>
            <div className="flex items-center mb-1">
                <div className={`text-sm font-medium ${isInput ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                    {label}
                </div>
            </div>
            <DataViewer
                data={data}
                isMarkdown={isMarkdown}
                initiallyExpanded={shouldInitiallyExpand}
                className={`border-l-2 ${isInput ? 'border-l-blue-400' : 'border-l-green-400'}`}
            />
        </div>
    );
};

export default JobDataViewer; 