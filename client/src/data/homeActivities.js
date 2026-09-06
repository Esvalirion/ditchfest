// Registry of fan activities for the home-page block (between the latest
// ditchfest panel and the chart). The block's tab row, description and CTA
// are generated from this array via v-for, so adding an activity is a new
// entry here plus a route — no HomeView edits needed beyond that.
//
// Fields:
//   kind         — stable id, also used by TierlistView (via its route-name
//                  map) and for the panel's background CSS class.
//   label        — tab label.
//   description  — the short blurb shown under the tabs for the active one.
//   ctaLabel     — the CTA button text (leading to the activity's page).
//   routeName    — vue-router route the CTA navigates to.
//   background   — image shown behind the panel, per activity (a quiet
//                  translucent wash; see HomeView's .activities-hero). Lives
//                  under public/res/activities/ with the rest of the site's
//                  static assets.
export const ACTIVITIES = [
  {
    kind: 'onboarding',
    label: 'Onboarding',
    description:
      'New around here? Walk through every ditchfest one screen at a time, like the maps that speak to you, and earn an achievement for finishing the tour.',
    ctaLabel: 'Start onboarding',
    routeName: 'onboarding',
    background: '/res/activities/ditchfest.jpg',
  },
  {
    kind: 'mappers-tierlist',
    label: 'Mappers Tierlist',
    description:
      'Rank every Ditchfest mapper from S to D. Drag the names you know (and the ones you suffer from) between rows and see where your favourites land.',
    ctaLabel: 'Build your mappers tierlist',
    routeName: 'tierlist-mappers',
    background: '/res/activities/scarymappers.jpg',
  },
  {
    kind: 'ditchfests-tierlist',
    label: 'Ditchfests Tierlist',
    description:
      'Rank the ditchfests themselves, edition by edition. Which theme hit hardest, which one flopped — sort them all from S to D.',
    ctaLabel: 'Build your ditchfests tierlist',
    routeName: 'tierlist-ditchfests',
    background: '/res/activities/cube.jpg',
  },
];

export const DEFAULT_ACTIVITY_KIND = ACTIVITIES[0].kind;

// Resolve an activity kind to its descriptor, falling back to the first one
// (defensive: a bad kind should never blank the block).
export function findActivity(kind) {
  return ACTIVITIES.find((a) => a.kind === kind) || ACTIVITIES[0];
}
