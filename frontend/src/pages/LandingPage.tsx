import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import settings from '../config/settings';

const features = [
  {
    number: '1',
    title: 'Automated Literature Surveillance',
    description:
      'Expert-level PubMed monitoring runs continuously across asbestos, talc, and genetic predisposition research. New publications are captured the week they appear \u2014 no manual searching required. Every article is verified against PubMed IDs, ensuring citation integrity that holds up in expert reports and Daubert motions.',
    quote: '\u201CNever manually search PubMed again. The essential literature arrives in your inbox every week.\u201D',
  },
  {
    number: '2',
    title: 'Stance Analysis: Favorable vs. Adverse',
    description:
      'Every study is analyzed for its litigation implications \u2014 whether it supports or challenges defense positions \u2014 so attorneys can immediately sort the literature and understand what each article means for their case without reading every abstract.',
    quote: '\u201CWhich articles this week strengthen our alternative causation argument?\u201D',
  },
  {
    number: '3',
    title: 'Plain-Language Scientific Translation',
    description:
      'Studies relating to epidemiology, toxicology, genetics, fiber science, pathology, or other technical areas are summarized in accessible language \u2014 methodology, findings, and litigation relevance \u2014 without a call to your expert for every article. Technical terms are defined, so associates and paralegals can engage with the science directly.',
    quote: '\u201CWhat is this study actually saying, and how would a plaintiff use it?\u201D',
  },
  {
    number: '4',
    title: 'AI Synthesis Across the Entire Report',
    description:
      'Rather than reading 40 abstracts, Knowledge Horizon provides a synthesis across the full week\u2019s report \u2014 spotting contradictions, surfacing methodological strengths and weaknesses, and finding patterns a human analyst would spend hours identifying.',
    quote: '',
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
            <img src={settings.logoUrl} alt="Logo" className="h-8 w-auto" />
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
      <section className="px-6 pt-24 pb-20">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold tracking-[0.25em] text-blue-600 dark:text-blue-400 uppercase mb-6">
            AI-Powered Litigation Intelligence
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            Comprehensive Scientific Awareness for Asbestos &amp; Talc Defense
          </h1>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-12 text-left max-w-3xl mx-auto">
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

          <div className="mt-12 flex flex-wrap gap-4 justify-center">
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

      {/* Features */}
      <section className="bg-gray-50 dark:bg-gray-800/50 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((f) => (
              <div
                key={f.number}
                className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-sm font-bold">
                    {f.number}
                  </span>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  {f.description}
                </p>
                {f.quote && (
                  <p className="mt-4 text-sm italic text-gray-500 dark:text-gray-500">
                    {f.quote}
                  </p>
                )}
              </div>
            ))}
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
