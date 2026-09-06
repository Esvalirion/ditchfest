import { createRouter, createWebHistory } from 'vue-router';

// meta.navGroup marks routes that aren't nav entries themselves but should
// highlight one — the replacement for BELONGS_TO in the old js/layout.js
// (there only mapper.html -> top-mappers.html).
const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/signs', name: 'signs', component: () => import('../views/SignsView.vue') },
  {
    path: '/studio',
    name: 'studio',
    component: () => import('../views/StudioView.vue'),
    // The studio is a builder for signs, not its own top-level nav entry —
    // highlight the Signs tab while on /studio (same pattern as /map → maps).
    meta: { navGroup: 'signs' },
  },
  { path: '/maps', name: 'maps', component: () => import('../views/MapsView.vue') },
  { path: '/top-players', name: 'top-players', component: () => import('../views/TopPlayersView.vue') },
  { path: '/top-mappers', name: 'top-mappers', component: () => import('../views/TopMappersView.vue') },
  { path: '/roadmap', name: 'roadmap', component: () => import('../views/RoadmapView.vue') },
  {
    path: '/mapper/:id',
    name: 'mapper',
    component: () => import('../views/MapperView.vue'),
    meta: { navGroup: 'top-mappers' },
  },
  {
    path: '/map/:mapUid',
    name: 'map',
    component: () => import('../views/MapView.vue'),
    meta: { navGroup: 'maps' },
  },
  {
    path: '/missing-tmx',
    name: 'missing-tmx',
    component: () => import('../views/MissingTmxView.vue'),
    // A quiet community page, not a nav entry — highlight Maps while on it
    // (the list is map maintenance, same pattern as /map → maps).
    meta: { navGroup: 'maps' },
  },
  // Fan activities linked from the home block. Both tierlists share one real
  // view (TierlistView tells mappers/ditchfests apart by route name): a
  // TierMaker-style board that is purely client-side — rankings live in
  // localStorage, nothing is ever sent to the server. Like onboarding, they
  // are home-block destinations, not nav entries — no meta.navGroup on
  // purpose.
  {
    path: '/tierlist/mappers',
    name: 'tierlist-mappers',
    component: () => import('../views/TierlistView.vue'),
  },
  {
    path: '/tierlist/ditchfests',
    name: 'tierlist-ditchfests',
    component: () => import('../views/TierlistView.vue'),
  },
  { path: '/onboarding', name: 'onboarding', component: () => import('../views/OnboardingView.vue') },
  { path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue') },
  {
    path: '/admin/campaigns',
    name: 'admin-campaigns',
    component: () => import('../views/AdminCampaignsView.vue'),
    meta: { navGroup: 'admin' },
  },
  {
    path: '/admin/links',
    name: 'admin-links',
    component: () => import('../views/AdminLinksView.vue'),
    meta: { navGroup: 'admin' },
  },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
