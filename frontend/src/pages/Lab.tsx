import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { labApi, QuestionRefinementResponse, StreamMessage, GenerateAnswerResult } from '@/lib/api/labApi';

interface StatusMessage {
  id: string;
  type: 'status' | 'iteration' | 'result' | 'error';
  message: string;
  data?: any;
  timestamp: string;
}

export default function LabPage() {
  // Step 1: Initial question input
  const [step, setStep] = useState<'question' | 'refinement' | 'generation' | 'result'>('question');
  const [initialQuestion, setInitialQuestion] = useState('');
  const [questionLoading, setQuestionLoading] = useState(false);

  // Step 2: Refinement review and editing
  const [refinement, setRefinement] = useState<QuestionRefinementResponse | null>(null);
  const [editedQuestion, setEditedQuestion] = useState('');
  const [editedFormat, setEditedFormat] = useState('');
  const [editedCriteria, setEditedCriteria] = useState('');
  const [maxIterations, setMaxIterations] = useState(3);
  const [scoreThreshold, setScoreThreshold] = useState(0.8);

  // Step 3: Generation with streaming
  const [generationLoading, setGenerationLoading] = useState(false);
  const [statusMessages, setStatusMessages] = useState<StatusMessage[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [maxIterationsDisplay, setMaxIterationsDisplay] = useState(3);

  // Step 4: Final result
  const [finalResult, setFinalResult] = useState<GenerateAnswerResult | null>(null);

  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [statusMessages]);

  // Step 1: Submit initial question for refinement
  const handleSubmitQuestion = async () => {
    if (!initialQuestion.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a question',
        variant: 'destructive'
      });
      return;
    }

    setQuestionLoading(true);
    try {
      const response = await labApi.refineQuestion({ question: initialQuestion });
      setRefinement(response);
      setEditedQuestion(response.refined_question);
      setEditedFormat(response.suggested_format);
      setEditedCriteria(response.suggested_criteria);
      setStep('refinement');
      
      toast({
        title: 'Question Refined',
        description: 'Review and edit the suggestions below'
      });
    } catch (error) {
      toast({
        title: 'Refinement Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setQuestionLoading(false);
    }
  };

  // Step 2: Submit refined question for generation
  const handleSubmitRefinement = async () => {
    if (!editedQuestion.trim() || !editedFormat.trim() || !editedCriteria.trim()) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive'
      });
      return;
    }

    setGenerationLoading(true);
    setStatusMessages([]);
    setCurrentIteration(0);
    setMaxIterationsDisplay(maxIterations);
    setStep('generation');

    try {
      await labApi.generateAnswerStreaming(
        {
          instruct: editedQuestion,
          resp_format: editedFormat,
          eval_crit: editedCriteria,
          iter_max: maxIterations,
          score_threshold: scoreThreshold
        },
        // onMessage
        (message: StreamMessage) => {
          const statusMessage: StatusMessage = {
            id: `${Date.now()}-${Math.random()}`,
            type: message.type,
            message: message.message,
            data: message.data,
            timestamp: message.timestamp
          };
          
          setStatusMessages(prev => [...prev, statusMessage]);
          
          // Update current iteration display
          if (message.data?.iteration) {
            setCurrentIteration(message.data.iteration);
          }
        },
        // onResult
        (result: GenerateAnswerResult) => {
          setFinalResult(result);
          setStep('result');
          setGenerationLoading(false);
          
          toast({
            title: result.success ? 'Generation Complete!' : 'Generation Finished',
            description: result.success 
              ? `Answer generated successfully after ${result.total_iterations} iterations`
              : `Best answer found after ${result.total_iterations} iterations (score: ${result.final_score.toFixed(2)})`
          });
        },
        // onError
        (error: string) => {
          setGenerationLoading(false);
          toast({
            title: 'Generation Failed',
            description: error,
            variant: 'destructive'
          });
        }
      );
    } catch (error) {
      setGenerationLoading(false);
      toast({
        title: 'Failed to Start Generation',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    }
  };

  // Reset to start
  const handleReset = () => {
    setStep('question');
    setInitialQuestion('');
    setRefinement(null);
    setEditedQuestion('');
    setEditedFormat('');
    setEditedCriteria('');
    setStatusMessages([]);
    setFinalResult(null);
    setCurrentIteration(0);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b-2 border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Iterative Answer Generation Lab
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              AI-powered iterative answer refinement with evaluation criteria
            </p>
          </div>
          {step !== 'question' && (
            <Button
              variant="outline"
              onClick={handleReset}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              Start Over
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Step 1: Initial Question Input */}
          {step === 'question' && (
            <Card className="p-6 dark:bg-gray-800">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                Step 1: Enter Your Question
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    What would you like to know?
                  </label>
                  <Textarea
                    value={initialQuestion}
                    onChange={(e) => setInitialQuestion(e.target.value)}
                    placeholder="Enter your question here..."
                    rows={4}
                    className="dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <Button
                  onClick={handleSubmitQuestion}
                  disabled={questionLoading || !initialQuestion.trim()}
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium"
                >
                  {questionLoading ? 'Refining Question...' : 'Refine Question'}
                </Button>
              </div>
            </Card>
          )}

          {/* Step 2: Review and Edit Refinements */}
          {step === 'refinement' && refinement && (
            <Card className="p-6 dark:bg-gray-800">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                Step 2: Review & Edit Suggestions
              </h2>
              
              {/* Refinement reasoning */}
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Why these changes?</h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">{refinement.refinement_reasoning}</p>
              </div>

              <div className="space-y-4">
                {/* Refined Question */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Refined Question
                  </label>
                  <Textarea
                    value={editedQuestion}
                    onChange={(e) => setEditedQuestion(e.target.value)}
                    rows={3}
                    className="dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>

                {/* Response Format */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Response Format
                  </label>
                  <Textarea
                    value={editedFormat}
                    onChange={(e) => setEditedFormat(e.target.value)}
                    rows={3}
                    className="dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>

                {/* Evaluation Criteria */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Evaluation Criteria
                  </label>
                  <Textarea
                    value={editedCriteria}
                    onChange={(e) => setEditedCriteria(e.target.value)}
                    rows={4}
                    className="dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>

                {/* Advanced Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Max Iterations
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={maxIterations}
                      onChange={(e) => setMaxIterations(parseInt(e.target.value) || 3)}
                      className="dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Score Threshold
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={scoreThreshold}
                      onChange={(e) => setScoreThreshold(parseFloat(e.target.value) || 0.8)}
                      className="dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleSubmitRefinement}
                  className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white font-medium"
                >
                  Generate Answer
                </Button>
              </div>
            </Card>
          )}

          {/* Step 3: Generation Progress */}
          {step === 'generation' && (
            <Card className="p-6 dark:bg-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Step 3: Generating Answer
                </h2>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Iteration {currentIteration} / {maxIterationsDisplay}
                </div>
              </div>

              {/* Progress indicator */}
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <span>Progress</span>
                  <span>{Math.round((currentIteration / maxIterationsDisplay) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(currentIteration / maxIterationsDisplay) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Status Messages */}
              <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                {statusMessages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                      <div className="flex-1">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium mr-2 ${
                          msg.type === 'status' ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' :
                          msg.type === 'iteration' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                          msg.type === 'result' ? 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200' :
                          'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                        }`}>
                          {msg.type.toUpperCase()}
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">{msg.message}</span>
                        
                        {/* Show iteration details */}
                        {msg.type === 'iteration' && msg.data && (
                          <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border">
                            <div className="text-xs space-y-1">
                              <div><strong>Score:</strong> {msg.data.score.toFixed(2)}</div>
                              <div><strong>Meets Criteria:</strong> {msg.data.meets_criteria ? 'Yes' : 'No'}</div>
                              {msg.data.evaluation_reasoning && (
                                <div><strong>Reasoning:</strong> {msg.data.evaluation_reasoning}</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {generationLoading && (
                <div className="mt-4 text-center">
                  <div className="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-blue-600 rounded-full" role="status" aria-label="loading">
                    <span className="sr-only">Loading...</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Generating answer...</p>
                </div>
              )}
            </Card>
          )}

          {/* Step 4: Final Result */}
          {step === 'result' && finalResult && (
            <Card className="p-6 dark:bg-gray-800">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                Final Answer
              </h2>

              {/* Result Summary */}
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600 dark:text-gray-400">Success:</span>
                    <span className={`ml-2 px-2 py-1 rounded ${
                      finalResult.success 
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                        : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                    }`}>
                      {finalResult.success ? 'Yes' : 'Partial'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600 dark:text-gray-400">Iterations:</span>
                    <span className="ml-2 text-gray-900 dark:text-gray-100">{finalResult.total_iterations}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600 dark:text-gray-400">Final Score:</span>
                    <span className="ml-2 text-gray-900 dark:text-gray-100">{finalResult.final_score.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600 dark:text-gray-400">Time:</span>
                    <span className="ml-2 text-gray-900 dark:text-gray-100">
                      {finalResult.metadata?.total_time_seconds 
                        ? `${finalResult.metadata.total_time_seconds.toFixed(1)}s` 
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Final Answer */}
              <div className="mb-6">
                <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Answer:</h3>
                <div className="p-4 border rounded-lg bg-white dark:bg-gray-700">
                  <div className="prose dark:prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-sans">
                      {finalResult.final_answer}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Iteration History */}
              {finalResult.iterations.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">
                    Iteration History ({finalResult.iterations.length})
                  </h3>
                  <div className="space-y-3">
                    {finalResult.iterations.map((iteration, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Iteration {iteration.iteration_number}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Score:</span>
                            <span className={`px-2 py-1 rounded text-sm font-medium ${
                              iteration.evaluation.score >= 0.8
                                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                : iteration.evaluation.score >= 0.6
                                ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                                : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                            }`}>
                              {iteration.evaluation.score.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        
                        <div className="text-sm space-y-2">
                          <div>
                            <span className="font-medium text-gray-600 dark:text-gray-400">Evaluation:</span>
                            <p className="text-gray-700 dark:text-gray-300 mt-1">
                              {iteration.evaluation.evaluation_reasoning}
                            </p>
                          </div>
                          
                          {iteration.evaluation.improvement_suggestions.length > 0 && (
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Suggestions:</span>
                              <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-1">
                                {iteration.evaluation.improvement_suggestions.map((suggestion, i) => (
                                  <li key={i}>{suggestion}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}