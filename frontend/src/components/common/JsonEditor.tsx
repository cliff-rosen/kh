import React, { useState, useEffect } from 'react';

export interface JsonEditorProps {
    value: any;
    onChange: (value: any) => void;
    className?: string;
}

/**
 * A component for editing JSON objects and arrays.
 * Provides a textarea for editing raw JSON with validation.
 */
export const JsonEditor: React.FC<JsonEditorProps> = ({
    value,
    onChange,
    className = ''
}) => {
    const [jsonString, setJsonString] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Format the JSON string with proper indentation
    useEffect(() => {
        try {
            // Use 2 spaces for indentation
            setJsonString(JSON.stringify(value, null, 2));
            setError(null);
        } catch (e) {
            setJsonString('');
            setError('Invalid JSON: ' + (e as Error).message);
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setJsonString(newValue);

        try {
            // Validate JSON
            const parsed = JSON.parse(newValue);
            setError(null);
            onChange(parsed);
        } catch (e) {
            setError('Invalid JSON: ' + (e as Error).message);
        }
    };

    return (
        <div className={`space-y-2 ${className}`}>
            <textarea
                value={jsonString}
                onChange={handleChange}
                className="w-full h-64 p-3 font-mono text-sm border border-gray-300 dark:border-gray-600 
                         rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                spellCheck={false}
            />

            {error && (
                <div className="text-sm text-red-500 dark:text-red-400">
                    {error}
                </div>
            )}

            <div className="text-xs text-gray-500 dark:text-gray-400">
                Edit the JSON directly. Changes will be applied when the JSON is valid.
            </div>
        </div>
    );
};

export default JsonEditor; 