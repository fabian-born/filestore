import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';

const frontendVersion = import.meta.env.VITE_APP_VERSION || 'dev';

export default function AppInfoPanel() {
  const { t } = useSettings();
  const [backendVersion, setBackendVersion] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getVersion()
      .then((data) => setBackendVersion(data.version))
      .catch((err) => setError(t(`errors.${err.code}`)));
  }, [t]);

  return (
    <div className="app-info-panel">
      {error && <p className="alert">{error}</p>}
      <table className="users-table">
        <tbody>
          <tr>
            <td>{t('appInfo.frontend')}</td>
            <td>{frontendVersion}</td>
          </tr>
          <tr>
            <td>{t('appInfo.backend')}</td>
            <td>{backendVersion ?? '…'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
