import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { MoonIcon, SunIcon, MagnifyingGlassIcon, ScaleIcon, LanguageIcon, SparklesIcon } from '@heroicons/react/24/outline';
import settings from '../config/settings';

const aiCapabilities = [
  {
    icon: SparklesIcon,
    title: 'AI-Powered Conversation',
    description:
      'Don\u2019t just read the science \u2014 interrogate it. Query the week\u2019s literature the way you\u2019d question a witness: targeted, strategic, and on your terms.',
  },
  {
    icon: ScaleIcon,
    title: 'Stance Analysis',
    description:
      'Every study analyzed for litigation implications \u2014 favorable or adverse \u2014 so you know what it means for your case without reading every abstract.',
  },
  {
    icon: LanguageIcon,
    title: 'Scientific Translation',
    description:
      'Technical findings summarized in plain language so associates and paralegals can engage with the science directly.',
  },
];

export default function LandingPage() {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Navbar */}
      <nav className="flex-shrink-0 sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logos/KH Icon black.png" alt="Logo" className="h-8 w-auto dark:hidden" />
            <img src="/logos/KH Icon white.png" alt="Logo" className="h-8 w-auto hidden dark:block" />
            <span className="text-lg font-semibold">Knowledge Horizon</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Toggle theme"
            >
              {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>
            <Link
              to="/login"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-12 pb-14">
        <div className="max-w-4xl mx-auto text-center">
          <img src="/logos/KH logo black.png" alt="Knowledge Horizon" className="h-16 sm:h-20 w-auto mx-auto mb-5 dark:hidden" />
          <img src="/logos/KH logo white.png" alt="Knowledge Horizon" className="h-16 sm:h-20 w-auto mx-auto mb-5 hidden dark:block" />
          <p className="text-xs font-semibold tracking-[0.25em] text-blue-600 dark:text-blue-400 uppercase mb-4">
            AI-Powered Litigation Intelligence
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
            Comprehensive Scientific Awareness for Asbestos &amp; Talc Defense
          </h1>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 text-left max-w-3xl mx-auto">
            <div>
              <h2 className="text-lg font-semibold mb-2">Curated Weekly Reports</h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Continuous monitoring of the worldwide scientific literature relevant to talc and asbestos litigation, delivered as a curated weekly report.
              </p>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2">AI Chat &amp; Analysis</h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Interact with the science using our AI-powered analysis tool to tease out critical insights and connections.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <Link
              to="/login"
              className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Sign In
            </Link>
            <a
              href="mailto:cliff@ironcliff.ai?subject=Knowledge%20Horizon%20%E2%80%93%20Access%20Request"
              className="px-6 py-3 rounded-lg border border-gray-300 dark:border-gray-600 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Request Access
            </a>
          </div>
        </div>
      </section>

      {/* Features — two buckets */}
      <section className="flex-1 bg-gray-50 dark:bg-gray-800/50 py-16 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Bucket 1: The Data */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                <MagnifyingGlassIcon className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-semibold">Literature Surveillance</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              New asbestos, talc, and genetic predisposition publications captured the week they appear &mdash; no manual searching, every citation verified against PubMed.
            </p>
          </div>

          {/* Bucket 2: The Intelligence */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-6">Your AI Analyst</h2>
            <div className="space-y-5">
              {aiCapabilities.map((c) => (
                <div key={c.title} className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 mt-0.5">
                    <c.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{c.title}</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mt-1">
                      {c.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>&copy; {new Date().getFullYear()} Knowledge Horizon. All rights reserved.</span>
          <Link
            to="/login"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
          >
            Sign In
          </Link>
        </div>
      </footer>
    </div>
  );
}
