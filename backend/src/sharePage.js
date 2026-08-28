function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const STRINGS = {
  de: { save: 'Speichern', noPreview: 'Keine Vorschau verfügbar' },
  en: { save: 'Save', noPreview: 'No preview available' },
};

function pageShell({ lang, title, bodyHtml }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; --bg:#f5f6f8; --surface:#fff; --border:#e2e4e9; --text:#1a1c23; --text-muted:#6b7280; --accent:#2563eb; --accent-hover:#1d4ed8; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16171b; --surface:#1e2027; --border:#2c2f38; --text:#e6e7eb; --text-muted:#9199a8; }
  }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:1.5rem;
         background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1.5rem; width:100%; max-width:560px; text-align:center; }
  h1 { font-size:1.05rem; margin:0 0 0.25rem; word-break:break-word; }
  .meta { color:var(--text-muted); font-size:0.85rem; margin:0 0 1.25rem; }
  .preview { margin-bottom:1.25rem; }
  .preview img, .preview video { max-width:100%; max-height:70vh; border-radius:8px; display:block; margin:0 auto; }
  .preview audio { width:100%; }
  .placeholder { padding:3rem 1rem; color:var(--text-muted); border:1px dashed var(--border); border-radius:8px; margin-bottom:1.25rem; }
  .save-btn { display:inline-block; background:var(--accent); color:#fff; text-decoration:none; padding:0.65rem 1.4rem; border-radius:6px; font-size:0.95rem; }
  .save-btn:hover { background:var(--accent-hover); }
</style>
</head>
<body>
<div class="card">${bodyHtml}</div>
</body>
</html>`;
}

export function renderMessagePage(lang, message) {
  return pageShell({ lang, title: message, bodyHtml: `<h1>${escapeHtml(message)}</h1>` });
}

export function renderSharePage({ lang, fileName, size, category, downloadUrl, saveUrl }) {
  const s = STRINGS[lang] || STRINGS.de;
  let previewHtml;
  if (category === 'image') {
    previewHtml = `<div class="preview"><img src="${downloadUrl}" alt="${escapeHtml(fileName)}"></div>`;
  } else if (category === 'video') {
    previewHtml = `<div class="preview"><video src="${downloadUrl}" controls playsinline preload="metadata"></video></div>`;
  } else if (category === 'audio') {
    previewHtml = `<div class="preview"><audio src="${downloadUrl}" controls preload="metadata"></audio></div>`;
  } else {
    previewHtml = `<div class="placeholder">${escapeHtml(s.noPreview)}</div>`;
  }

  const bodyHtml = `
    <h1>${escapeHtml(fileName)}</h1>
    <p class="meta">${escapeHtml(formatBytes(size))}</p>
    ${previewHtml}
    <a class="save-btn" href="${saveUrl}" download="${escapeHtml(fileName)}">${escapeHtml(s.save)}</a>
  `;

  return pageShell({ lang, title: fileName, bodyHtml });
}
