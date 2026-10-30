// "Play in game" links: Openplanet's bundled Play plugin handles
// trackmania://openplanet/play/<uid> — the game opens (or is focused) and
// loads the map from Nadeo by uid. Works for any uploaded map, fest maps
// before their campaign exists included. Without Openplanet the link does
// nothing useful, hence the hint in every button's title.
export const PLAY_HINT = 'Play in game (needs Openplanet)';

export function playInGameUrl(mapUid) {
  return `trackmania://openplanet/play/${encodeURIComponent(mapUid)}`;
}
