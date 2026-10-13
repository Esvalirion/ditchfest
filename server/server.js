// quiet: true — dotenv >=17 otherwise prints a random promo tip on every
// boot (one points at an unaffiliated "auth for agents" domain).
require('dotenv').config({ quiet: true });

const cron = require('node-cron');
const { pool } = require('./db');
const app = require('./app');
const { PORT, TM_CLUB_ID, TM_FOLDER_ID, TMIO_USER_AGENT } = require('./config');
const { syncCatalog } = require('./services/sync');
const { sweepRecords } = require('./services/records');

pool.query('SELECT 1').catch((err) => {
  console.warn('DB: connection check failed:', err.message);
});

app.listen(PORT, () => {
  console.log(`Ditchfest server listening on http://localhost:${PORT}`);
});

// Both scheduled jobs talk to trackmania.io, whose soft limit (~2 req/s) is
// shared — so they run strictly one after another through this queue, never
// in parallel. A job whose previous run is still queued or running is skipped
// instead of piling up behind it.
let tmioQueue = Promise.resolve();
const queued = new Set();
function runExclusive(name, fn) {
  if (queued.has(name)) {
    console.warn(`${name}: previous run still in progress — skipping`);
    return;
  }
  queued.add(name);
  tmioQueue = tmioQueue
    .then(fn)
    .catch((e) => console.error(`${name} failed:`, String(e)))
    .finally(() => queued.delete(name));
}

// Same cadence as the real tm-votes source's Worker cron trigger ("7,37 * * *
// *" — twice an hour). Runs in-process instead of a separate cron job/Worker
// trigger, so it just needs TM_CLUB_ID/TM_FOLDER_ID configured, nothing else
// to deploy.
if (TM_CLUB_ID && TM_FOLDER_ID) {
  cron.schedule('7,37 * * * *', () =>
    runExclusive('catalog sync', async () => {
      const result = await syncCatalog();
      console.log('catalog sync:', JSON.stringify(result));
    })
  );
  console.log('Catalog sync scheduled: 7,37 * * * *');
} else {
  console.warn('TM_CLUB_ID/TM_FOLDER_ID not set — catalog sync disabled');
}

// In-game records (Players tab) refresh on their own, much tighter cadence
// than the catalog: a small batch every 5 minutes, newest ditchfests first
// (see services/records.js getRecordSweepBatch). ~8 maps ≈ 20 paced requests
// per run — fresh records on the current ditchfest within about an hour, the
// whole catalog rotated in ~2 days.
const RECORDS_CRON = '*/5 * * * *';
const RECORD_MAPS_PER_RUN = 8;
cron.schedule(RECORDS_CRON, () =>
  runExclusive('records sweep', async () => {
    const done = await sweepRecords(RECORD_MAPS_PER_RUN, TMIO_USER_AGENT);
    if (done.length) console.log(`records sweep: ${done.length} maps refreshed`);
  })
);
console.log(`Records sweep scheduled: ${RECORDS_CRON}`);
