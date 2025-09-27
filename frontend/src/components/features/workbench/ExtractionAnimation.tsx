import { useEffect, useState } from 'react';
import { Brain, Cpu, Database, FileSearch, Sparkles, Activity } from 'lucide-react';

interface ExtractionAnimationProps {
  isVisible: boolean;
  featuresCount: number;
  articlesCount: number;
}

export function ExtractionAnimation({ isVisible, featuresCount, articlesCount }: ExtractionAnimationProps) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [progress, setProgress] = useState(0);

  const phases = [
    { icon: FileSearch, label: 'Analyzing Documents', color: 'text-slate-600 dark:text-slate-400' },
    { icon: Brain, label: 'Understanding Context', color: 'text-blue-600 dark:text-blue-400' },
    { icon: Cpu, label: 'Processing Features', color: 'text-indigo-600 dark:text-indigo-400' },
    { icon: Database, label: 'Structuring Data', color: 'text-slate-600 dark:text-slate-400' }
  ];

  useEffect(() => {
    if (!isVisible) {
      setCurrentPhase(0);
      setProgress(0);
      return;
    }

    // Smooth phase transitions
    const phaseInterval = setInterval(() => {
      setCurrentPhase(prev => (prev + 1) % phases.length);
    }, 3000);

    // Smooth progress animation
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + 0.5;
      });
    }, 50);

    return () => {
      clearInterval(phaseInterval);
      clearInterval(progressInterval);
    };
  }, [isVisible, phases.length]);

  if (!isVisible) return null;

  const CurrentIcon = phases[currentPhase].icon;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8 max-w-md w-full mx-4 relative">

        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl flex items-center justify-center">
                <CurrentIcon className={`w-8 h-8 transition-all duration-500 ${phases[currentPhase].color}`} />
              </div>

              {/* Subtle pulse effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 animate-pulse" />

              {/* Activity indicator */}
              <div className="absolute -top-1 -right-1">
                <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
              </div>
            </div>
          </div>

          {/* Title and Phase */}
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              AI Feature Extraction
            </h3>
            <p className={`text-sm transition-all duration-500 ${phases[currentPhase].color}`}>
              {phases[currentPhase].label}
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{articlesCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Documents</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{featuresCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Features</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Processing Indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Sparkles className="w-3 h-3 animate-pulse" />
            <span>Advanced AI models analyzing content</span>
          </div>

          {/* Neural Network Visualization */}
          <div className="mt-6 flex justify-center items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                {[...Array(3)].map((_, j) => (
                  <div
                    key={j}
                    className="w-1.5 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full transition-all duration-500"
                    style={{
                      opacity: currentPhase === i || currentPhase === (i - 1) % 5 ? 1 : 0.3,
                      transform: currentPhase === i ? 'scale(1.5)' : 'scale(1)',
                      backgroundColor: currentPhase === i ? '#3b82f6' : undefined
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}