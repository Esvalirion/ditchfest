import { createRouter, createWebHistory } from 'vue-router';

// meta.navGroup marks routes that aren't nav entries themselves but should
// highlight one — the replacement for BELONGS_TO in the old js/layout.js
// (there only mapper.html -> top-mappers.html).
const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/signs', name: 'signs', component: () => import('../views/SignsView.vue') },
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
