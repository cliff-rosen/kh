import { useVersionCheck } from '../hooks/useVersionCheck';

export default function VersionBanner() {
  const { newVersionAvailable, latestVersion } = useVersionCheck();

  if (!newVersionAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white text-center py-2 text-sm">
      A new version ({latestVersion}) is available.{' '}
      <button
        onClick={() => window.location.reload()}
        className="underline font-semibold hover:text-blue-100"
      >
        Refresh now
      </button>
    </div>
  );
}
