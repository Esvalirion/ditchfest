// Fest schedule for the in-game plugin: every other Friday, 20:45 Moscow time
// (UTC+3, no DST). Same anchor as the site's countdown (FEST_ANCHOR in
// client/src/views/HomeView.vue) — if the schedule shifts, move both. Kept
// here rather than in the plugin so a shift doesn't need a plugin release.
const FEST_ANCHOR_MS = Date.parse('2026-08-07T20:45:00+03:00'); // a real fest Friday
const FEST_INTERVAL_MS = 14 * 24 * 3600_000;
const MSK_OFFSET_MS = 3 * 3600_000;
const DAY_MS = 24 * 3600_000;

const BANNER = 'ПУНТ, ВЕЧЕРОМ ДИЧФЕСТ';

/** { isFestDay, nextFestAt, banner }: isFestDay = it's the fest Friday in Moscow
 *  (00:00–24:00 MSK); nextFestAt = unix seconds of the upcoming start, or of
 *  today's while it hasn't begun; banner = text to show on fest day, else ''. */
function getFestState(now = Date.now()) {
  let next = FEST_ANCHOR_MS;
  while (next <= now) next += FEST_INTERVAL_MS;

  // The latest fest start at or before now, and the Moscow midnight before it.
  const last = next - FEST_INTERVAL_MS;
  const dayStart = (offset) => offset - ((offset + MSK_OFFSET_MS) % DAY_MS);
  const isFestDay =
    (now >= dayStart(last) && now < dayStart(last) + DAY_MS) ||
    (now >= dayStart(next) && now < dayStart(next) + DAY_MS);

  return {
    isFestDay,
    nextFestAt: Math.floor(next / 1000),
    banner: isFestDay ? BANNER : '',
  };
}

module.exports = { getFestState };
