require('dotenv').config();

const cron = require('node-cron');
const { pool } = require('./db');
const app = require('./app');
const { PORT, TM_CLUB_ID, TM_FOLDER_ID } = require('./config');
const { syncCatalog } = require('./services/sync');

pool.query('SELECT 1').catch((err) => {
  console.warn('DB: connection check failed:', err.message);
});

app.listen(PORT, () => {
  console.log(`Ditchfest server listening on http://localhost:${PORT}`);
});

// Same cadence as the real tm-votes source's Worker cron trigger ("7,37 * * *
// *" — twice an hour). Runs in-process instead of a separate cron job/Worker
// trigger, so it just needs TM_CLUB_ID/TM_FOLDER_ID configured, nothing else
// to deploy.
if (TM_CLUB_ID && TM_FOLDER_ID) {
  cron.schedule('7,37 * * * *', async () => {
    try {
      const result = await syncCatalog();
      console.log('catalog sync:', JSON.stringify(result));
    } catch (e) {
      console.error('catalog sync failed:', String(e));
    }
  });
  console.log('Catalog sync scheduled: 7,37 * * * *');
} else {
  console.warn('TM_CLUB_ID/TM_FOLDER_ID not set — catalog sync disabled');
}
