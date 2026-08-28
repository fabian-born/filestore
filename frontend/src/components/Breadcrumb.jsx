import { HomeIcon } from './icons.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function Breadcrumb({ crumbs, onNavigate }) {
  const { t } = useSettings();
  return (
    <nav className="breadcrumb">
      {crumbs.map((c, i) => (
        <span key={c.prefix}>
          {i > 0 && <span className="sep">/</span>}
          <button
            className="crumb"
            onClick={() => onNavigate(c.prefix)}
            title={c.isHome ? t('breadcrumb.home') : undefined}
            aria-label={c.isHome ? t('breadcrumb.home') : undefined}
          >
            {c.isHome ? <HomeIcon size={16} /> : c.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
