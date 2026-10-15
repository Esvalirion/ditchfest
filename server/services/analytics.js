// Self-hosted Umami tracker tag, injected into index.html at boot (app.js).
// Configured at runtime from .env, not baked into the client build, so the
// same image works with analytics on or off and dev never reports.
//
// The script is served same-origin (nginx proxies /stats/ to the Umami
// container), so it works on every mirrored domain without CORS and isn't
// caught by blocklists keyed on third-party analytics hosts. The tracker
// derives its collect endpoint from the script's own URL (/stats/api/send).
const WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || '';
const SCRIPT_URL = process.env.UMAMI_SCRIPT_URL || '/stats/s.js';

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Returns html with the tracker tag added before </head>, or unchanged when
// analytics isn't configured.
function injectAnalytics(html) {
  if (!WEBSITE_ID) return html;
  const tag =
    `<script defer src="${escapeAttr(SCRIPT_URL)}" data-website-id="${escapeAttr(WEBSITE_ID)}"></script>`;
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

module.exports = { injectAnalytics };
