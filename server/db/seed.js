// Dev-only fixture data — lets you smoke-test the API locally without a
// real Nadeo campaign or real players. Not part of the deploy/migration
// flow (001/002 above); run manually: `npm run seed` inside server/.
require('dotenv').config({ quiet: true });
const { pool } = require('../db');

async function main() {
  await pool.query(`
    INSERT INTO editions (campaign_id, name, media) VALUES
      (1, 'Ditchfest #1', NULL),
      (2, 'Ditchfest #2', NULL)
    ON CONFLICT (campaign_id) DO UPDATE SET name = EXCLUDED.name;
  `);

  await pool.query(`
    INSERT INTO maps (map_uid, campaign_id, name, author_account_id, author_name, thumbnail_url,
                      tmx_style, tmx_tags, tmx_styles_updated_at) VALUES
      ('map-uid-1', 1, 'Aqua Ditch',  '11111111-1111-1111-1111-111111111111', 'MapperOne', NULL,
        'Tech', '3,1', now()),
      ('map-uid-2', 1, 'Black Ditch', '22222222-2222-2222-2222-222222222222', 'MapperTwo', NULL,
        NULL, NULL, now()),
      ('map-uid-3', 2, 'Blue Ditch',  '11111111-1111-1111-1111-111111111111', 'MapperOne', NULL,
        NULL, NULL, NULL)
    ON CONFLICT (map_uid) DO UPDATE SET
      tmx_style = EXCLUDED.tmx_style,
      tmx_tags = EXCLUDED.tmx_tags,
      tmx_styles_updated_at = EXCLUDED.tmx_styles_updated_at;
  `);

  await pool.query(`
    INSERT INTO votes (account_id, map_uid) VALUES
      ('33333333-3333-3333-3333-333333333333', 'map-uid-1'),
      ('44444444-4444-4444-4444-444444444444', 'map-uid-1'),
      ('44444444-4444-4444-4444-444444444444', 'map-uid-2')
    ON CONFLICT DO NOTHING;
  `);

  console.log('Seeded.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
