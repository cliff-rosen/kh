import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSmartSearch2 } from '@/context/SmartSearch2Context';
import { QuestionStep } from './steps/QuestionStep';
import { EvidenceStep } from './steps/EvidenceStep';
import { ConceptsStep } from './steps/ConceptsStep';
import { ExpressionsStep } from './steps/ExpressionsStep';

interface KeywordHelperProps {
    onComplete: () => void;
    onCancel: () => void;
}

export function KeywordHelper({ onComplete, onCancel }: KeywordHelperProps) {
    // UI flow state (local to component)
    const [step, setStep] = useState<'question' | 'evidence' | 'concepts' | 'expressions'>('question');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
    const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
    const [estimatedResults, setEstimatedResults] = useState<number | null>(null);

    // Conversation refinement state (local to this flow)
    const [conversationHistory, setConversationHistory] = useState<Array<{ question: string; answer: string }>>([]);
    const [completenessScore, setCompletenessScore] = useState(0);
    const [missingElements, setMissingElements] = useState<string[]>([]);

    const {
        // Research data from context (persistent)
        selectedSource,
        researchQuestion,
        evidenceSpec,
        extractedConcepts,
        expandedExpressions,
        generatedKeywords,

        // Actions from context
        updateSearchQuery,
        refineEvidenceSpec,
        extractConcepts,
        expandConcepts,
        testKeywordCombination,
        setResearchQuestion,
        setEvidenceSpec,
        setExtractedConcepts,
        setExpandedExpressions,
        setGeneratedKeywords,
        resetResearchJourney,
    } = useSmartSearch2();

    const handleRefineEvidenceSpec = async () => {
        if (!researchQuestion.trim() && conversationHistory.length === 0) {
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            // Build conversation context with answers
            const updatedHistory = [...conversationHistory];

            // If we have clarification questions, add the user's answers to conversation history
            if (clarificationQuestions.length > 0) {
                clarificationQuestions.forEach((question, index) => {
                    if (userAnswers[index]) {
                        updatedHistory.push({
                            question,
                            answer: userAnswers[index]
                        });
                    }
                });
            }

            // Use conversational refinement
            const response = await refineEvidenceSpec(
                researchQuestion,
                updatedHistory.length > 0 ? updatedHistory : undefined
            );

            // Update local state
            setConversationHistory(updatedHistory);
            setCompletenessScore(response.completeness_score);
            setMissingElements(response.missing_elements || []);

            // Always proceed to evidence step after generating
            if (response.clarification_questions) {
                // Store clarification questions for the evidence step
                setClarificationQuestions(response.clarification_questions);
                setUserAnswers({});
            } else {
                // No clarification questions needed
                setClarificationQuestions([]);
                setUserAnswers({});
            }

            // Set the evidence spec if we got one (even if incomplete)
            if (response.evidence_specification) {
                // This should be set by the context, but ensure it's set
                // Context should already handle this, but we'll make sure
            }

            // Always go to evidence step to show the spec
            setStep('evidence');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to refine evidence specification';
            setError(errorMessage);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleExtractConcepts = async () => {
        if (!evidenceSpec.trim()) {
            setError('Evidence specification is required');
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            // Context now handles state updates
            await extractConcepts(evidenceSpec);
            setStep('concepts');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to extract concepts';
            setError(errorMessage);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleExpandExpressions = async () => {
        if (extractedConcepts.length === 0) {
            setError('Extracted concepts are required');
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            // Context now handles state updates including marking expressions as selected
            await expandConcepts(extractedConcepts, selectedSource);

            // Clear any previous generated keywords when entering expressions step
            setGeneratedKeywords('');

            setStep('expressions');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to expand expressions';
            setError(errorMessage);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUseKeywords = () => {
        if (generatedKeywords.trim()) {
            updateSearchQuery(generatedKeywords);
            onComplete();
        }
    };

    const steps = [
        { id: 'question', title: 'Research Question', description: 'Describe what you\'re looking for' },
        { id: 'evidence', title: 'Evidence Specification', description: 'Review the AI-generated specification' },
        { id: 'concepts', title: 'Key Concepts', description: 'Edit and refine concepts' },
        { id: 'expressions', title: 'Boolean Expressions', description: 'Test and accept search query' }
    ];

    const currentStepIndex = steps.findIndex(s => s.id === step);
    const canGoBack = currentStepIndex > 0;

    const goToStep = (stepId: 'question' | 'evidence' | 'concepts' | 'expressions') => {
        setStep(stepId);
        setError(null);
    };

    const handleNext = () => {
        if (step === 'question') {
            handleRefineEvidenceSpec();
        } else if (step === 'evidence') {
            handleExtractConcepts();
        } else if (step === 'concepts') {
            handleExpandExpressions();
        }
    };

    const handleBack = () => {
        if (step === 'evidence') {
            setStep('question');
        } else if (step === 'concepts') {
            setStep('evidence');
        } else if (step === 'expressions') {
            setStep('concepts');
        }
        setError(null);
    };

    const handleReset = () => {
        // Reset research data in context
        resetResearchJourney();

        // Reset local UI state
        setClarificationQuestions([]);
        setUserAnswers({});
        setError(null);
        setStep('question');
    };

    const renderStepContent = () => {
        switch (step) {
            case 'question':
                return (
                    <QuestionStep
                        researchQuestion={researchQuestion}
                        setResearchQuestion={setResearchQuestion}
                        clarificationQuestions={clarificationQuestions}
                        userAnswers={userAnswers}
                        setUserAnswers={setUserAnswers}
                        completenessScore={completenessScore}
                        missingElements={missingElements}
                        isGenerating={isGenerating}
                        selectedSource={selectedSource}
                    />
                );
            case 'evidence':
                return (
                    <EvidenceStep
                        evidenceSpec={evidenceSpec}
                        setEvidenceSpec={setEvidenceSpec}
                        completenessScore={completenessScore}
                        missingElements={missingElements}
                        clarificationQuestions={clarificationQuestions}
                        userAnswers={userAnswers}
                        setUserAnswers={setUserAnswers}
                    />
                );
            case 'concepts':
                return (
                    <ConceptsStep
                        extractedConcepts={extractedConcepts}
                        setExtractedConcepts={setExtractedConcepts}
                        evidenceSpec={evidenceSpec}
                    />
                );
            case 'expressions':
                return (
                    <ExpressionsStep
                        expandedExpressions={expandedExpressions}
                        setExpandedExpressions={setExpandedExpressions}
                        generatedKeywords={generatedKeywords}
                        setGeneratedKeywords={setGeneratedKeywords}
                        estimatedResults={estimatedResults}
                        setEstimatedResults={setEstimatedResults}
                        isGenerating={isGenerating}
                        selectedSource={selectedSource}
                        testKeywordCombination={testKeywordCombination}
                        setError={setError}
                        evidenceSpec={evidenceSpec}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    AI Keyword Helper
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Generate optimized search keywords for {selectedSource === 'pubmed' ? 'PubMed' : 'Google Scholar'} using AI-powered analysis.
                </p>
            </div>

            {/* Step Progress Indicator */}
            <div className="flex items-center justify-between">
                {steps.map((stepItem, index) => (
                    <div key={stepItem.id} className="flex items-center flex-1">
                        <div className="flex items-center">
                            <button
                                onClick={() => goToStep(stepItem.id as any)}
                                disabled={index > currentStepIndex}
                                className={`
                                    flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors
                                    ${step === stepItem.id
                                        ? 'bg-blue-600 text-white'
                                        : index < currentStepIndex
                                            ? 'bg-green-600 text-white cursor-pointer hover:bg-green-700'
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                    }
                                `}
                            >
                                {index < currentStepIndex ? (
                                    <Check className="w-4 h-4" />
                                ) : (
                                    index + 1
                                )}
                            </button>
                            <div className="ml-3 min-w-0 flex-1">
                                <p className={`text-sm font-medium ${step === stepItem.id
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-gray-900 dark:text-gray-100'
                                    }`}>
                                    {stepItem.title}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {stepItem.description}
                                </p>
                            </div>
                        </div>
                        {index < steps.length - 1 && (
                            <div className={`flex-1 h-px mx-4 ${index < currentStepIndex
                                ? 'bg-green-600'
                                : 'bg-gray-200 dark:bg-gray-700'
                                }`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Step Content */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                {renderStepContent()}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {canGoBack && (
                        <Button
                            onClick={handleBack}
                            variant="outline"
                            disabled={isGenerating}
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                    )}
                    {clarificationQuestions.length > 0 && (
                        <Button
                            onClick={handleReset}
                            variant="ghost"
                            disabled={isGenerating}
                            className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                        >
                            Start Over
                        </Button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {step === 'expressions' && generatedKeywords ? (
                        <>
                            <Button
                                variant="outline"
                                onClick={onCancel}
                                disabled={isGenerating}
                            >
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                            </Button>
                            <Button
                                onClick={handleUseKeywords}
                                disabled={!generatedKeywords.trim() || isGenerating}
                                className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
                            >
                                <Check className="w-4 h-4 mr-2" />
                                Accept & Use Query
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                onClick={onCancel}
                                disabled={isGenerating}
                            >
                                Cancel
                            </Button>
                            {/* For evidence step with clarification questions, show refine button */}
                            {step === 'evidence' && clarificationQuestions.length > 0 && (
                                <Button
                                    onClick={() => {
                                        handleRefineEvidenceSpec();
                                    }}
                                    variant="outline"
                                    disabled={isGenerating || Object.keys(userAnswers).length === 0}
                                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Refine with Answers
                                </Button>
                            )}
                            {step !== 'expressions' && (
                                <Button
                                    onClick={handleNext}
                                    disabled={
                                        isGenerating ||
                                        (step === 'question' && !researchQuestion.trim()) ||
                                        (step === 'evidence' && !evidenceSpec.trim()) ||
                                        (step === 'concepts' && extractedConcepts.length === 0)
                                    }
                                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                                >
                                    {isGenerating ? (
                                        <>
                                            <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                            {step === 'question' ? 'Generating...' : 'Processing...'}
                                        </>
                                    ) : (
                                        <>
                                            {step === 'question' && (
                                                <>
                                                    <Sparkles className="w-4 h-4 mr-2" />
                                                    Generate Evidence Spec
                                                </>
                                            )}
                                            {step === 'evidence' && (
                                                <>
                                                    <Sparkles className="w-4 h-4 mr-2" />
                                                    Proceed & Extract Concepts
                                                </>
                                            )}
                                            {step === 'concepts' && (
                                                <>
                                                    <Sparkles className="w-4 h-4 mr-2" />
                                                    Expand Expressions
                                                </>
                                            )}
                                            <ChevronRight className="w-4 h-4 ml-2" />
                                        </>
                                    )}
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}
        </div>
    );
}