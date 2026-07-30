import { defineStore } from 'pinia';

const TOKEN_KEY = 'tm_token';
// Where to return after login: the backend always bounces back to the site
// root, which would strand someone who started somewhere else.
const RETURN_KEY = 'tm_return';

function decodePayload(token) {
  try {
    const part = token.split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch (e) {
    return null;
  }
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY),
    // Cached admin flag for NavBar's "Admin" link — checkAdmin() sets it,
    // logout() clears it. A plain fetch (not utils/api.js's api() helper) to
    // avoid a circular import: api.js itself imports this store.
    isAdmin: false,
  }),

  getters: {
    user(state) {
      if (!state.token) return null;
      const payload = decodePayload(state.token);
      if (!payload) return null;
      if (payload.exp && Date.now() / 1000 >= payload.exp) return null;
      return { accountId: payload.sub, displayName: payload.name };
    },
    isLoggedIn() {
      return this.user !== null;
    },
  },

  actions: {
    login() {
      try {
        sessionStorage.setItem(
          RETURN_KEY,
          window.location.pathname + window.location.search
        );
      } catch (e) {
        // Private mode / storage disabled — we just lose the return path.
      }
      window.location.href = '/auth/login';
    },

    logout() {
      this.token = null;
      this.isAdmin = false;
      localStorage.removeItem(TOKEN_KEY);
    },

    /** Populates isAdmin for NavBar's "Admin" link. Best-effort: any failure
     *  just leaves the link hidden, same as a non-admin. */
    async checkAdmin() {
      if (!this.token) {
        this.isAdmin = false;
        return;
      }
      try {
        const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + this.token } });
        const data = res.ok ? await res.json() : null;
        this.isAdmin = !!(data && data.isAdmin);
      } catch (e) {
        this.isAdmin = false;
      }
    },

    /** The backend rejected our token mid-session: drop it and start over. */
    sessionExpired() {
      this.logout();
      this.login();
    },

    // On return from the backend the JWT (or an error) arrives in the URL
    // fragment: #tm_token=… / #tm_error=… . Called from main.js before the
    // app mounts, so every component sees a settled session on first render.
    consumeRedirect() {
      if (!window.location.hash) return;
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get('tm_token');
      const error = params.get('tm_error');

      if (token) {
        this.token = token;
        localStorage.setItem(TOKEN_KEY, token);
      } else if (error) {
        console.error('Login failed:', error);
      }

      if (token || error) {
        // Strip the fragment without a history entry or a reload.
        history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search
        );
      }
      if (token) this.returnToStartPage();
    },

    // Only ever a same-origin relative path we wrote ourselves, and never a
    // re-navigation to the page we are already on.
    returnToStartPage() {
      let back = null;
      try {
        back = sessionStorage.getItem(RETURN_KEY);
        sessionStorage.removeItem(RETURN_KEY);
      } catch (e) {
        return;
      }
      if (!back || back.charAt(0) !== '/' || back.charAt(1) === '/') return;
      if (back === window.location.pathname + window.location.search) return;
      window.location.replace(back);
    },
  },
});
