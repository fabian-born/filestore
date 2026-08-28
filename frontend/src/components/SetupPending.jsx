import { useSettings } from '../context/SettingsContext.jsx';

// Shown to a non-admin instead of SetupWizard when the bucket isn't
// configured yet - they have no permission to fill in those fields
// themselves, so there's nothing for them to do but wait for an admin.
export default function SetupPending({ onLogout }) {
  const { t } = useSettings();

  return (
    <div className="wizard-page">
      <div className="wizard-card">
        <div className="wizard-header">
          <h1>{t('wizard.title')}</h1>
          <button type="button" className="logout-btn" onClick={onLogout}>
            {t('nav.logout')}
          </button>
        </div>
        <p className="hint">{t('wizard.pendingIntro')}</p>
      </div>
    </div>
  );
}
