-- Runs in the default 'postgres' database on first container start, same
-- pattern as tm-api's own migrations — this server can share one Postgres
-- container with tm-api/cotd on the same VPS instead of needing its own.
SELECT 'CREATE DATABASE ditchfest_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ditchfest_db')\gexec
