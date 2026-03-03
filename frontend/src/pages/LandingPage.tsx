import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import settings from '../config/settings';

const features = [
  {
    number: '01',
    title: 'Litigation Research Streams',
    description:
      'Create targeted research streams that continuously monitor scientific literature, regulatory filings, and expert publications relevant to your cases.',
    quote: '"What used to take our team weeks of manual searching now surfaces automatically."',
  },
  {
    number: '02',
    title: 'AI-Powered Analysis',
    description:
      'Automatically extract key findings, identify favorable evidence, and flag potential risks across thousands of documents with expert-level precision.',
    quote: '"The AI catches nuances in study methodologies that even experienced reviewers miss."',
  },
  {
    number: '03',
    title: 'Expert & Publication Tracking',
    description:
      'Monitor opposing experts\u2019 publication history, track emerging research trends, and identify contradictions in testimony versus published work.',
    quote: '"We identified a critical contradiction in the plaintiff\'s expert testimony within minutes."',
  },
  {
    number: '04',
    title: 'Defense-Ready Reports',
    description:
      'Generate comprehensive, citation-rich reports structured for depositions, Daubert challenges, and trial preparation — ready for attorney review.',
    quote: '"Reports that used to take days to compile are now generated in hours, with better citations."',
  },
];

export default function LandingPage() {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Navbar */}
      <nav className="flex-shrink-0 sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={settings.logoUrl} alt="Logo" className="h-8 w-auto" />
            <span className="text-lg font-semibold">{settings.appName}</span>
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
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-xs font-semibold tracking-widest text-blue-600 dark:text-blue-400 uppercase mb-4">
          AI-Powered Litigation Intelligence
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight max-w-3xl">
          Scientific Intelligence for{' '}
          <span className="text-blue-600 dark:text-blue-400">Asbestos &amp; Talc Defense</span>
        </h1>
        <p className="mt-6 text-lg text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
          Knowledge Horizon continuously monitors the scientific landscape, analyzes expert
          publications, and generates defense-ready reports — so your team can focus on winning cases
          instead of searching for evidence.
        </p>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
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
      </section>

      {/* Features */}
      <section className="bg-gray-50 dark:bg-gray-800/50 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((f) => (
              <div
                key={f.number}
                className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
              >
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {f.number}
                </span>
                <h3 className="mt-2 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  {f.description}
                </p>
                <p className="mt-4 text-sm italic text-gray-500 dark:text-gray-500">
                  {f.quote}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>&copy; {new Date().getFullYear()} {settings.appName}. All rights reserved.</span>
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
