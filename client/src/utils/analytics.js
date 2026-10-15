// Custom events for the self-hosted Umami. The tracker script itself is not
// part of the bundle: server/app.js injects it into index.html in prod only
// when UMAMI_WEBSITE_ID is set (see server/services/analytics.js), so in dev,
// or before Umami is configured, window.umami is simply absent and every call
// here is a no-op. Page views need no code — Umami's tracker hooks
// history.pushState, which is what vue-router navigates with.
//
// Event names are kebab-case and stable: they are the keys the dashboard
// groups by, renaming one splits its history in two.
export function track(name, data) {
  try {
    window.umami?.track(name, data);
  } catch (e) {
    // Analytics must never break a click handler.
  }
}
