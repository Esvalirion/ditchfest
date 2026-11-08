/**
 * Copies text to the clipboard. Resolves true on success, false when the
 * browser refused (no permission / no clipboard at all). Uses the async
 * Clipboard API on secure origins and the hidden-textarea classic elsewhere
 * (dev over http, non-TLS mirror).
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}
