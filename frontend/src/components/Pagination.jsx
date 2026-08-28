import { useSettings } from '../context/SettingsContext.jsx';

const DEFAULT_PAGE_SIZES = [25, 50, 100];

export default function Pagination({
  page,
  pageSize,
  total,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  onPageChange,
  onPageSizeChange,
}) {
  const { t } = useSettings();
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages - 1);

  return (
    <div className="pagination">
      <select
        className="auto-refresh-select"
        value={pageSize}
        onChange={(e) => onPageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        aria-label={t('pagination.pageSize')}
      >
        {pageSizeOptions.map((size) => (
          <option key={size} value={size}>
            {t('pagination.entries', { count: size })}
          </option>
        ))}
        <option value="all">{t('pagination.all')}</option>
      </select>

      <span className="pagination-total">{t('pagination.total', { count: total })}</span>

      {pageSize !== 'all' && totalPages > 1 && (
        <div className="pagination-nav">
          <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 0}>
            ‹
          </button>
          <span>{t('pagination.pageOf', { page: currentPage + 1, totalPages })}</span>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
