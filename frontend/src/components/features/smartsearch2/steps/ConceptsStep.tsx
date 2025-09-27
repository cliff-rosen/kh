import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, ChevronDown, ChevronUp, FileText } from 'lucide-react';

interface ConceptsStepProps {
    extractedConcepts: string[];
    setExtractedConcepts: (concepts: string[]) => void;
    evidenceSpec?: string;
}

export function ConceptsStep({
    extractedConcepts,
    setExtractedConcepts,
    evidenceSpec
}: ConceptsStepProps) {
    const [showEvidenceSpec, setShowEvidenceSpec] = useState(false);
    return (
        <div className="space-y-4">
            <div>
                <Badge variant="outline" className="mb-3">Step 3 of 4</Badge>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Edit Key Concepts
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Review and edit the key concepts. You can modify, add, or remove concepts before expanding them to Boolean expressions.
                </p>
            </div>

            {/* Evidence Spec Reference */}
            {evidenceSpec && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                    <button
                        onClick={() => setShowEvidenceSpec(!showEvidenceSpec)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Evidence Specification Reference
                            </span>
                        </div>
                        {showEvidenceSpec ? (
                            <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        )}
                    </button>
                    {showEvidenceSpec && (
                        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {evidenceSpec}
                            </p>
                        </div>
                    )}
                </div>
            )}

            <div>
                <Label className="text-sm font-medium mb-2 block">
                    Key Concepts
                </Label>
                <div className="space-y-2">
                    {extractedConcepts.map((concept, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={concept}
                                onChange={(e) => {
                                    const newConcepts = [...extractedConcepts];
                                    newConcepts[index] = e.target.value;
                                    setExtractedConcepts(newConcepts);
                                }}
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100"
                                placeholder="Enter concept..."
                            />
                            <button
                                onClick={() => {
                                    const newConcepts = extractedConcepts.filter((_, i) => i !== index);
                                    setExtractedConcepts(newConcepts);
                                }}
                                className="px-3 py-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                title="Remove concept"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}

                    <button
                        onClick={() => {
                            setExtractedConcepts([...extractedConcepts, '']);
                        }}
                        className="w-full px-3 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                    >
                        + Add Concept
                    </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    These concepts will be expanded into comprehensive Boolean search expressions
                </p>
            </div>
        </div>
    );
}