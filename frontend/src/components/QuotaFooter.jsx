import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatBytes } from '../format.js';

// Refetches whenever `refreshKey` changes (the parent bumps this after an
// upload/delete actually changes the listing) rather than polling.
export default function QuotaFooter({ refreshKey }) {
  const { t } = useSettings();
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    api
      .getMyQuota()
      .then(setQuota)
      .catch(() => {});
  }, [refreshKey]);

  // No quota configured for this user - nothing meaningful to show a bar
  // against.
  if (!quota || !quota.quotaBytes) return null;

  const percent = Math.min(100, Math.round((quota.usedBytes / quota.quotaBytes) * 100));
  const level = percent >= 100 ? 'full' : percent >= 90 ? 'warn' : '';

  return (
    <div className="quota-footer">
      <div className="quota-bar">
        <div className={`quota-bar-fill ${level}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="quota-label">
        {t('quota.usage', { used: formatBytes(quota.usedBytes), total: formatBytes(quota.quotaBytes) })}
      </span>
    </div>
  );
}
