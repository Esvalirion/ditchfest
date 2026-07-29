import { useSessionStore } from '../stores/session';

/**
 * Call the backend (same origin — see vite.config.js's dev proxy). Returns
 * the parsed JSON body; throws an Error carrying `.status` and `.data` on
 * anything that isn't 2xx, so callers can branch on `e.status === 401` and
 * otherwise show one generic failure message.
 *
 *   api('/api/editions')
 *   api('/api/vote', { body: { mapUid: uid, value: true } })
 */
export async function api(path, options) {
  const opts = options || {};
  const session = useSessionStore();
  const headers = {};
  if (session.token) headers.Authorization = 'Bearer ' + session.token;

  const init = { method: opts.method || (opts.body ? 'POST' : 'GET') };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  init.headers = headers;

  const res = await fetch(path, init);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // Some errors come back as plain text; data stays null.
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'HTTP ' + res.status);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
