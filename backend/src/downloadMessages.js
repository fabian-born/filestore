const MESSAGES = {
  de: {
    linkNotFound: 'Link nicht gefunden oder widerrufen',
    linkExpired: 'Link ist abgelaufen',
    fileNotFound: 'Datei nicht gefunden',
  },
  en: {
    linkNotFound: 'Link not found or revoked',
    linkExpired: 'Link has expired',
    fileNotFound: 'File not found',
  },
};

// The recipient of a share link is not an authenticated app user, so their
// language preference comes from the browser instead of the app's settings.
export function downloadMessage(req, key) {
  const lang = (req.headers['accept-language'] || '').toLowerCase().startsWith('en') ? 'en' : 'de';
  return MESSAGES[lang][key] || MESSAGES.de[key];
}
