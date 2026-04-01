import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

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
      const { data } = await api.get('/api/health');
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
