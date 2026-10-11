// One-off backfill of in-game records (medal times + top-20 leaderboard
// window) for every map in the catalog, never-checked first. The 30-min sync
// rotation would take about a week to cover ~1900 maps at 6 maps/run — run
// this once instead (locally or via docker exec on the VPS):
//
//   node db/backfillRecords.js          # everything (~2 req/map, ~1 h)
//   node db/backfillRecords.js 50       # just the first 50, e.g. for a test
//
// Safe to re-run and interrupt: stamped maps are skipped, it resumes where
// it stopped. Dev-only like seed.js — not part of deploy.
require('dotenv').config({ quiet: true });
const { pool } = require('../db');
const { backfillRecords } = require('../services/records');
const { TMIO_USER_AGENT } = require('../config');

const limitArg = Number.parseInt(process.argv[2], 10);
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : undefined;

backfillRecords(TMIO_USER_AGENT, { limit })
  .then((r) => {
    console.log('backfill finished:', JSON.stringify(r));
    return pool.end();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
