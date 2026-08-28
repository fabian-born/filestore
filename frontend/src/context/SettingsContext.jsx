import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from '../api.js';
import { dictionaries } from '../i18n/dictionaries.js';

const SettingsContext = createContext(null);

function resolve(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dict);
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ shareDomain: '', language: 'de' });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => api.getSettings().then(setSettings), []);

  useEffect(() => {
    refresh()
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [refresh]);

  const updateSettings = useCallback(async (partial) => {
    const data = await api.updateSettings(partial);
    setSettings(data);
    return data;
  }, []);

  const updateOauthSettings = useCallback(async (partial) => {
    const data = await api.updateOauthSettings(partial);
    setSettings(data);
    return data;
  }, []);

  const updateSmtpSettings = useCallback(async (partial) => {
    const data = await api.updateSmtpSettings(partial);
    setSettings(data);
    return data;
  }, []);

  const t = useCallback(
    (key, vars) => {
      const dict = dictionaries[settings.language] || dictionaries.de;
      let str = resolve(dict, key);
      if (str === undefined) str = resolve(dictionaries.de, key);
      if (str === undefined) str = resolve(dictionaries.de, 'errors.GENERIC');
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{${k}}`, v);
        }
      }
      return str;
    },
    [settings.language]
  );

  return (
    <SettingsContext.Provider
      value={{ settings, updateSettings, updateOauthSettings, updateSmtpSettings, t, loaded, refresh }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
