const ACCENT = '#2563eb';

function formatDate(expiresAt, locale) {
  return expiresAt ? new Date(expiresAt).toLocaleString(locale) : null;
}

const TEMPLATES = {
  de: {
    subject: (fileName) => `Datei geteilt: ${fileName}`,
    text: (username, fileName, url, expiresAt) =>
      `${username} hat die Datei "${fileName}" mit dir geteilt:\n\n${url}\n` +
      (expiresAt ? `\nDer Link läuft am ${formatDate(expiresAt, 'de-DE')} ab.` : ''),
    html: (username, fileName, url, expiresAt) => {
      const expiresLine = formatDate(expiresAt, 'de-DE');
      return `
        <p style="margin:0 0 1rem;">
          <strong>${escapeHtml(username)}</strong> hat die Datei
          <strong>${escapeHtml(fileName)}</strong> mit dir geteilt.
        </p>
        <p style="text-align:center; margin:1.5rem 0;">
          <a href="${url}" style="display:inline-block; background:${ACCENT}; color:#fff; text-decoration:none; padding:0.75rem 1.75rem; border-radius:6px; font-size:0.95rem;">
            Datei öffnen
          </a>
        </p>
        ${expiresLine ? `<p style="color:#6b7280; font-size:0.85rem; margin:0 0 1.5rem;">Der Link läuft am ${expiresLine} ab.</p>` : ''}
        <p style="text-align:center; margin:1.5rem 0;">
          <img src="cid:shareqrcode" width="180" height="180" alt="QR-Code zum Öffnen der Datei" style="display:inline-block;">
        </p>
        <p style="color:#6b7280; font-size:0.8rem; word-break:break-all; margin:0;">
          Falls der Button nicht funktioniert, öffne diesen Link: <a href="${url}" style="color:${ACCENT};">${url}</a>
        </p>
      `;
    },
  },
  en: {
    subject: (fileName) => `File shared: ${fileName}`,
    text: (username, fileName, url, expiresAt) =>
      `${username} shared the file "${fileName}" with you:\n\n${url}\n` +
      (expiresAt ? `\nThis link expires on ${formatDate(expiresAt, 'en-US')}.` : ''),
    html: (username, fileName, url, expiresAt) => {
      const expiresLine = formatDate(expiresAt, 'en-US');
      return `
        <p style="margin:0 0 1rem;">
          <strong>${escapeHtml(username)}</strong> shared the file
          <strong>${escapeHtml(fileName)}</strong> with you.
        </p>
        <p style="text-align:center; margin:1.5rem 0;">
          <a href="${url}" style="display:inline-block; background:${ACCENT}; color:#fff; text-decoration:none; padding:0.75rem 1.75rem; border-radius:6px; font-size:0.95rem;">
            Open file
          </a>
        </p>
        ${expiresLine ? `<p style="color:#6b7280; font-size:0.85rem; margin:0 0 1.5rem;">This link expires on ${expiresLine}.</p>` : ''}
        <p style="text-align:center; margin:1.5rem 0;">
          <img src="cid:shareqrcode" width="180" height="180" alt="QR code to open the file" style="display:inline-block;">
        </p>
        <p style="color:#6b7280; font-size:0.8rem; word-break:break-all; margin:0;">
          If the button doesn't work, open this link: <a href="${url}" style="color:${ACCENT};">${url}</a>
        </p>
      `;
    },
  },
};

// Minimal escaping - these values only ever come from our own DB (username,
// stored file name), never raw user HTML input, but the email still goes
// out to third parties so it's worth not trusting them blindly.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function wrapHtml(bodyHtml) {
  return `
    <div style="max-width:480px; margin:0 auto; padding:2rem 1.5rem; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1a1c23;">
      <p style="font-weight:700; font-size:1.1rem; letter-spacing:-0.01em; margin:0 0 1.5rem;">filestore</p>
      ${bodyHtml}
    </div>
  `;
}

// Auto-selects the DE/EN template based on the admin-configured UI language
// (settings.language) - the same setting used to auto-select DE/EN
// everywhere else in the app - falling back to German.
export function renderShareEmail(lang, { username, fileName, url, expiresAt }) {
  const t = TEMPLATES[lang] || TEMPLATES.de;
  return {
    subject: t.subject(fileName),
    text: t.text(username, fileName, url, expiresAt),
    html: wrapHtml(t.html(username, fileName, url, expiresAt)),
  };
}
