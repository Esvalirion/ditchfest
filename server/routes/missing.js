const { Router } = require('express');
const { getMapsMissingFromTmx } = require('../services/missingTmx');
const { lookupMapByUid } = require('../services/tmx');
const { updateMapTmxStyles } = require('../services/catalog');
const { TMIO_USER_AGENT } = require('../config');

const router = Router();

// GET /api/missing-tmx — public. Maps confirmed absent from TMX, newest
// edition first. Feeds the community-driven /missing-tmx page; the order is
// fixed server-side, the client just renders the list.
router.get('/missing-tmx', async (_req, res) => {
  res.json({ maps: await getMapsMissingFromTmx() });
});

// POST /api/missing-tmx/:mapUid/recheck — public. One fresh TMX lookup for
// one map, persisted. This is the "refresh" button on /missing-tmx: after
// someone uploads the map to TMX it drops off the list right here, instead
// of waiting for the ~30-day sync rotation (or the next visit to the map's
// own page, whose live lookup writes back too). The button lives only on
// that page on purpose — a manual action per row, not something every map
// hover fires.
//
// Returns { onTmx }: true = found and stamped, remove the row; false =
// confirmed still absent (or the known gap: on TMX with no style/tags at
// all — same formal rule the sync uses), fresh check timestamp either way.
router.post('/missing-tmx/:mapUid/recheck', async (req, res) => {
  const { mapUid } = req.params;
  let tmx;
  try {
    tmx = await lookupMapByUid(mapUid, TMIO_USER_AGENT);
  } catch (e) {
    // TMX network/5xx — nothing is written, the row stays as it was.
    console.error('tmx recheck failed', String(e));
    return res.status(502).json({ error: 'tmx_unavailable' });
  }
  await updateMapTmxStyles({
    mapUid,
    style: tmx && tmx.style ? tmx.style : null,
    tags: tmx && tmx.tagsRaw ? tmx.tagsRaw : null,
  });
  res.json({ onTmx: !!(tmx && (tmx.style || tmx.tagsRaw)) });
});

module.exports = router;
