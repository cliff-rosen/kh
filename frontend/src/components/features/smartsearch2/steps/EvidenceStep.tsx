import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, MessageCircle } from 'lucide-react';

interface EvidenceStepProps {
    evidenceSpec: string;
    setEvidenceSpec: (spec: string) => void;
    completenessScore?: number;
    missingElements?: string[];
    clarificationQuestions?: string[];
    userAnswers?: Record<number, string>;
    setUserAnswers?: (answers: Record<number, string>) => void;
}

export function EvidenceStep({
    evidenceSpec,
    setEvidenceSpec,
    completenessScore,
    missingElements,
    clarificationQuestions = [],
    userAnswers = {},
    setUserAnswers
}: EvidenceStepProps) {
    const showRefinementSuggestion = completenessScore !== undefined && completenessScore < 1;

    const getDescription = () => {
        if (clarificationQuestions.length > 0) {
            return "Review your evidence specification below. You can edit it directly and proceed, or answer the optional questions to refine it further.";
        } else {
            return "Review your evidence specification below. Edit it if needed, then proceed to extract concepts.";
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <Badge variant="outline" className="mb-3">Step 2 of 4</Badge>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Review Evidence Specification
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {getDescription()}
                </p>
            </div>

            <div>
                <Label className="text-sm font-medium mb-2 block">
                    Evidence Specification
                </Label>
                <Textarea
                    value={evidenceSpec}
                    onChange={(e) => setEvidenceSpec(e.target.value)}
                    rows={6}
                    className="dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                    placeholder="Evidence specification will appear here..."
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    This specification describes what documents are needed for your research
                </p>
            </div>

            {/* Show clarification questions if any */}
            {clarificationQuestions.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                    <div className="flex items-start gap-2 mb-3">
                        <MessageCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div>
                            <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                                Alternative: Refine with Questions
                            </p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                Instead of editing above, you can answer these questions to automatically improve the specification.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {clarificationQuestions.map((question, index) => (
                            <div key={index}>
                                <Label className="text-sm font-medium mb-2 block text-gray-900 dark:text-gray-100">
                                    {question}
                                </Label>
                                <Textarea
                                    value={userAnswers[index] || ''}
                                    onChange={(e) => setUserAnswers && setUserAnswers({ ...userAnswers, [index]: e.target.value })}
                                    rows={2}
                                    className="dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                                    placeholder="Type your answer here..."
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Show refinement suggestion if completeness score is less than 100% */}
            {showRefinementSuggestion && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-4">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                                Completeness: {Math.round((completenessScore || 0) * 100)}%
                            </p>
                            {missingElements && missingElements.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">
                                        Could be improved by clarifying:
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {missingElements.map((element, index) => (
                                            <Badge key={index} variant="secondary" className="text-xs">
                                                {element}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}