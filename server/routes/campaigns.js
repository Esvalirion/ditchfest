const { Router } = require('express');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

// GET /api/campaigns — admin-only. Every edition with its maps grouped by
// their REAL synced campaign_id (not the display override), so an admin can
// see Nadeo's actual split and move maps out of it. Each map carries its
// current displayCampaignId (null if not overridden). A negative campaign_id
// is an admin-created folder (see 004_campaign_folders.sql) — it never has
// real maps of its own, only ones moved in via displayCampaignId.
router.get('/campaigns', requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      e.campaign_id,
      e.name,
      e.display_name,
      e.theme,
      e.hidden,
      e.sort_order,
      COALESCE(
        json_agg(
          json_build_object(
            'mapUid', m.map_uid,
            'name', m.name,
            'authorName', m.author_name,
            'displayCampaignId', m.display_campaign_id
          ) ORDER BY m.position ASC NULLS LAST, m.name ASC
        ) FILTER (WHERE m.map_uid IS NOT NULL),
        '[]'
      ) AS maps
    FROM editions e
    LEFT JOIN maps m ON m.campaign_id = e.campaign_id
    GROUP BY e.campaign_id
    ORDER BY (e.sort_order IS NULL), e.sort_order ASC, e.campaign_id DESC
  `);

  res.json({
    editions: rows.map((e) => ({
      campaignId: e.campaign_id,
      name: e.name,
      displayName: e.display_name,
      theme: e.theme,
      hidden: e.hidden,
      sortOrder: e.sort_order,
      isVirtual: e.campaign_id < 0,
      maps: e.maps,
    })),
  });
});

// POST /api/campaigns/position { campaignId, position } — admin-only. Sets
// one campaign's sort_order directly, z-index style: any finite number is
// valid (not clamped to the current campaign count) and only this one row is
// touched, so it doesn't disturb anyone else's manually-set value. The
// client either sends a number the admin typed directly, or — when dragging
// a column between two others — the midpoint of those neighbors' sort_order
// (which is why sort_order is a float: there's always room to bisect without
// ever needing to renumber the rest of the board).
router.post('/campaigns/position', requireAdmin, async (req, res) => {
  const campaignId = Number(req.body?.campaignId);
  const position = Number(req.body?.position);
  if (!Number.isFinite(campaignId) || !Number.isFinite(position)) {
    return res.status(400).json({ error: 'invalid_position' });
  }

  const { rowCount } = await pool.query('UPDATE editions SET sort_order = $1 WHERE campaign_id = $2', [
    position,
    campaignId,
  ]);
  if (rowCount === 0) return res.status(404).json({ error: 'unknown_campaign' });

  res.json({ ok: true, campaignId, sortOrder: position });
});

// POST /api/campaigns { name } — admin-only. Creates a folder with no real
// Nadeo campaign behind it, for stashing maps that don't fit anywhere real
// (see the negative-id sequence in 004_campaign_folders.sql). Starts empty
// and hidden from the public site until maps actually land in it (getEditions
// drops empty editions on its own). sort_order is set below the current
// minimum so it sorts first (leftmost) on the board — otherwise it'd fall
// back to campaign_id DESC, and a virtual folder's negative id would sink
// to the very end.
router.post('/campaigns', requireAdmin, async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'missing_name' });

  const { rows } = await pool.query(
    `INSERT INTO editions (campaign_id, name, sort_order)
     VALUES (
       nextval('editions_virtual_id_seq'),
       $1,
       (SELECT COALESCE(MIN(sort_order), 0) - 1 FROM editions)
     )
     RETURNING campaign_id`,
    [name]
  );

  res.json({ ok: true, campaignId: rows[0].campaign_id, name });
});

// POST /api/campaigns/delete { campaignId } — admin-only. Only for
// admin-created folders (negative campaign_id) — a real synced edition would
// just come back on the next catalog sync, and maps.campaign_id's FK is
// ON DELETE CASCADE for real editions, which would destroy actual map rows.
// Maps display-overridden into the deleted folder fall back to their real
// campaign automatically (maps.display_campaign_id's FK is ON DELETE SET NULL).
router.post('/campaigns/delete', requireAdmin, async (req, res) => {
  const campaignId = Number(req.body?.campaignId);
  if (!Number.isFinite(campaignId)) {
    return res.status(400).json({ error: 'missing_campaignId' });
  }
  if (campaignId >= 0) {
    return res.status(400).json({ error: 'not_a_folder' });
  }

  const { rowCount } = await pool.query('DELETE FROM editions WHERE campaign_id = $1', [campaignId]);
  if (rowCount === 0) return res.status(404).json({ error: 'unknown_campaign' });

  res.json({ ok: true, campaignId });
});

// POST /api/campaigns/theme { campaignId, theme } — admin-only.
router.post('/campaigns/theme', requireAdmin, async (req, res) => {
  const campaignId = Number(req.body?.campaignId);
  const theme = typeof req.body?.theme === 'string' ? req.body.theme : null;
  if (!Number.isFinite(campaignId)) {
    return res.status(400).json({ error: 'missing_campaignId' });
  }

  const { rowCount } = await pool.query('UPDATE editions SET theme = $1 WHERE campaign_id = $2', [
    theme,
    campaignId,
  ]);
  if (rowCount === 0) return res.status(404).json({ error: 'unknown_campaign' });

  res.json({ ok: true, campaignId, theme });
});

// POST /api/campaigns/name { campaignId, name } — admin-only. Overrides the
// displayed name (editions.display_name), leaving the synced editions.name
// alone. Blank clears the override back to the synced Nadeo name — for a
// virtual folder (no synced name to fall back to) it just renames it
// directly, since sync never touches negative-id rows anyway.
router.post('/campaigns/name', requireAdmin, async (req, res) => {
  const campaignId = Number(req.body?.campaignId);
  const name = (req.body?.name || '').trim();
  if (!Number.isFinite(campaignId)) {
    return res.status(400).json({ error: 'missing_campaignId' });
  }

  let result;
  if (campaignId < 0) {
    if (!name) return res.status(400).json({ error: 'missing_name' });
    result = await pool.query('UPDATE editions SET name = $1 WHERE campaign_id = $2', [name, campaignId]);
  } else {
    result = await pool.query('UPDATE editions SET display_name = $1 WHERE campaign_id = $2', [
      name || null,
      campaignId,
    ]);
  }
  if (result.rowCount === 0) return res.status(404).json({ error: 'unknown_campaign' });

  res.json({ ok: true, campaignId, name: name || null });
});

// POST /api/campaigns/hide { campaignId, hidden } — admin-only.
router.post('/campaigns/hide', requireAdmin, async (req, res) => {
  const campaignId = Number(req.body?.campaignId);
  const hidden = Boolean(req.body?.hidden);
  if (!Number.isFinite(campaignId)) {
    return res.status(400).json({ error: 'missing_campaignId' });
  }

  const { rowCount } = await pool.query('UPDATE editions SET hidden = $1 WHERE campaign_id = $2', [
    hidden,
    campaignId,
  ]);
  if (rowCount === 0) return res.status(404).json({ error: 'unknown_campaign' });

  res.json({ ok: true, campaignId, hidden });
});

// POST /api/campaigns/move-map { mapUid, campaignId } — admin-only.
// campaignId: null clears the override (map shows under its real campaign
// again); otherwise it must be an existing edition's campaign_id.
router.post('/campaigns/move-map', requireAdmin, async (req, res) => {
  const mapUid = req.body?.mapUid;
  const rawCampaignId = req.body?.campaignId;
  if (!mapUid || typeof mapUid !== 'string') {
    return res.status(400).json({ error: 'missing_mapUid' });
  }

  let campaignId = null;
  if (rawCampaignId !== null && rawCampaignId !== undefined) {
    campaignId = Number(rawCampaignId);
    if (!Number.isFinite(campaignId)) {
      return res.status(400).json({ error: 'invalid_campaignId' });
    }
    const editionExists = await pool.query('SELECT 1 FROM editions WHERE campaign_id = $1', [campaignId]);
    if (editionExists.rowCount === 0) return res.status(404).json({ error: 'unknown_campaign' });
  }

  const { rowCount } = await pool.query('UPDATE maps SET display_campaign_id = $1 WHERE map_uid = $2', [
    campaignId,
    mapUid,
  ]);
  if (rowCount === 0) return res.status(404).json({ error: 'unknown_map' });

  res.json({ ok: true, mapUid, displayCampaignId: campaignId });
});

module.exports = router;
