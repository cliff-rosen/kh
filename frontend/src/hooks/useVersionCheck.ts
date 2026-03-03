import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL_MS = 60_000;

interface VersionCheckResult {
  newVersionAvailable: boolean;
  latestVersion: string;
}

export function useVersionCheck(): VersionCheckResult {
  const [latestVersion, setLatestVersion] = useState('');
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);

  const buildVersion = import.meta.env.VITE_APP_VERSION;
  const isProduction = buildVersion && buildVersion !== 'dev';

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) return;
      const data = await res.json();
      const serverVersion = data.version;
      if (serverVersion && serverVersion !== 'dev') {
        setLatestVersion(serverVersion);
        if (buildVersion && serverVersion !== buildVersion) {
          setNewVersionAvailable(true);
        }
      }
    } catch {
      // Silently ignore — network errors shouldn't disrupt the app
    }
  }, [buildVersion]);

  useEffect(() => {
    if (!isProduction) return;

    checkVersion();
    const interval = setInterval(checkVersion, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isProduction, checkVersion]);

  return { newVersionAvailable, latestVersion };
}
