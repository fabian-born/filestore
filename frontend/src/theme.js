const STORAGE_KEY = 'filestore-theme';

// A per-browser preference (not synced to the account) - 'system' (the
// default) means "no override", following prefers-color-scheme like before
// the switcher existed.
export function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function setStoredTheme(theme) {
  try {
    if (theme === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // ignore - localStorage might be unavailable (private mode, etc.)
  }
  applyTheme(theme);
}
