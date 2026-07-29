require('dotenv').config();

const { pool } = require('./db');
const app = require('./app');
const { PORT } = require('./config');

pool.query('SELECT 1').catch((err) => {
  console.warn('DB: connection check failed:', err.message);
});

app.listen(PORT, () => {
  console.log(`Ditchfest server listening on http://localhost:${PORT}`);
});
