const { pool } = require('../db');

/** Maps confirmed to be absent from Trackmania Exchange — the data behind the
 *  low-key /missing-tmx page where the community can pick one to upload.
 *
 *  "Confirmed absent" is the same rule as buildMapStyles() in
 *  services/editions.js: tmx_styles_updated_at set while both tmx_style and
 *  tmx_tags are empty. A map that has simply not been checked yet (NULL
 *  timestamp) never appears — only a real TMX miss, never "unknown".
 *
 *  A map's effective campaign and edition visibility follow getEditions()
 *  exactly (COALESCE(display_campaign_id, campaign_id), hidden editions
 *  dropped): what the catalog doesn't show, this page doesn't show either. */
async function getMapsMissingFromTmx() {
  const { rows } = await pool.query(`
    SELECT m.map_uid, m.name, m.author_account_id, m.author_name, m.thumbnail_url,
           m.tmx_styles_updated_at AS checked_at,
           COALESCE(e.display_name, e.name) AS edition_name
      FROM maps m
      JOIN editions e ON e.campaign_id = COALESCE(m.display_campaign_id, m.campaign_id)
      WHERE NOT e.hidden
        AND m.tmx_styles_updated_at IS NOT NULL
        AND COALESCE(m.tmx_style, '') = ''
        AND COALESCE(m.tmx_tags, '') = ''
      ORDER BY (e.sort_order IS NULL), e.sort_order DESC, e.campaign_id DESC, m.name ASC
  `);
  return rows.map((r) => ({
    mapUid: r.map_uid,
    name: r.name,
    author: r.author_account_id,
    authorName: r.author_name,
    thumbnailUrl: r.thumbnail_url,
    editionName: r.edition_name,
    checkedAt: r.checked_at,
  }));
}

module.exports = { getMapsMissingFromTmx };
