import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface QuestionStepProps {
    researchQuestion: string;
    setResearchQuestion: (question: string) => void;
    clarificationQuestions: string[];
    userAnswers: Record<number, string>;
    setUserAnswers: (answers: Record<number, string>) => void;
    completenessScore: number;
    missingElements: string[];
    isGenerating: boolean;
    selectedSource: 'pubmed' | 'google_scholar';
}

export function QuestionStep({
    researchQuestion,
    setResearchQuestion,
    clarificationQuestions,
    userAnswers,
    setUserAnswers,
    completenessScore,
    missingElements,
    isGenerating,
    selectedSource
}: QuestionStepProps) {
    const getPlaceholderText = () => {
        return selectedSource === 'google_scholar'
            ? 'What are the latest developments in machine learning for healthcare diagnosis?'
            : 'What is the relationship between cannabis use and motivation in young adults?';
    };

    return (
        <div className="space-y-4">
            <div>
                <Badge variant="outline" className="mb-3">Step 1 of 4</Badge>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    {clarificationQuestions.length > 0 ? 'Answer Clarification Questions' : 'Enter Your Research Question'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {clarificationQuestions.length > 0
                        ? `Please answer these questions to help refine your search (Completeness: ${Math.round(completenessScore * 100)}%)`
                        : 'Describe what you\'re looking for in natural language. The AI will analyze your question to create an evidence specification.'}
                </p>
            </div>

            {/* Show initial question input or clarification questions */}
            {clarificationQuestions.length === 0 ? (
                <div>
                    <Label htmlFor="research-question" className="text-sm font-medium mb-2 block">
                        Research Question
                    </Label>
                    <Textarea
                        id="research-question"
                        value={researchQuestion}
                        onChange={(e) => setResearchQuestion(e.target.value)}
                        rows={4}
                        className="dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                        placeholder={getPlaceholderText()}
                        disabled={isGenerating}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Be specific about what you want to find - this helps the AI generate better keywords
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Show original question */}
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Your research question:</p>
                        <p className="text-sm text-gray-900 dark:text-gray-100">{researchQuestion}</p>
                    </div>

                    {/* Show clarification questions */}
                    {clarificationQuestions.map((question, index) => (
                        <div key={index}>
                            <Label className="text-sm font-medium mb-2 block">
                                {question}
                            </Label>
                            <Textarea
                                value={userAnswers[index] || ''}
                                onChange={(e) => setUserAnswers({ ...userAnswers, [index]: e.target.value })}
                                rows={3}
                                className="dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                                placeholder="Type your answer here..."
                                disabled={isGenerating}
                            />
                        </div>
                    ))}

                    {/* Show missing elements if any */}
                    {missingElements.length > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md">
                            <p className="text-xs font-medium text-amber-800 dark:text-amber-400 mb-1">Missing elements:</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {missingElements.map((element, index) => (
                                    <Badge key={index} variant="secondary" className="text-xs">
                                        {element}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}