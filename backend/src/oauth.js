import * as client from 'openid-client';
import { getSettings, isOauthEnabled } from './settings.js';

// The discovered Configuration is expensive (a network round-trip to the
// IdP), so it's cached and only rebuilt when the relevant settings change.
let cache = null;

function cacheKey(settings) {
  return JSON.stringify([settings.oauthIssuer, settings.oauthClientId, settings.oauthClientSecret]);
}

export function invalidateOidcConfig() {
  cache = null;
}

// Returns null when OAuth login isn't enabled/configured, so callers can
// treat "not set up" and "disabled" the same way.
export async function getOidcConfig() {
  const settings = getSettings();
  if (!isOauthEnabled(settings) || !settings.oauthIssuer || !settings.oauthClientId) return null;

  const key = cacheKey(settings);
  if (cache?.key === key) return cache.config;

  const config = await client.discovery(
    new URL(settings.oauthIssuer),
    settings.oauthClientId,
    settings.oauthClientSecret || undefined
  );
  cache = { key, config };
  return config;
}

export function oauthSubjectFor(config, sub) {
  return `${config.serverMetadata().issuer}|${sub}`;
}
