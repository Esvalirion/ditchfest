#!/usr/bin/env bash
# One command for local dev: runs the Express API (:3000) and the Vite
# client (:5173) together, tearing both down on Ctrl+C.
set -e
cd "$(dirname "$0")/.."

trap 'kill 0' EXIT

(cd server && npm run dev) &
(cd client && npm run dev) &

wait
