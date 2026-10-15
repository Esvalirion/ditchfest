#!/usr/bin/env bash
# One-time Umami setup on the VPS. Run as root from the deploy dir, after
# copying the repo's docker-compose.yml there (CI doesn't sync it):
#
#   scp docker-compose.yml scripts/umami-setup.sh 134.209.88.70:/opt/ditchfest-signs/
#   ssh 134.209.88.70 'cd /opt/ditchfest-signs && bash umami-setup.sh'
#
# Idempotent: re-running skips what already exists. Ends by recreating
# ditchfest-site so it picks up UMAMI_WEBSITE_ID; the only manual step left
# is the Cloudflare DNS record for the dashboard subdomain.
set -euo pipefail
cd /opt/ditchfest-signs

STAMP=$(date +%F-%H%M)
psql_pg() { docker exec tm-postgres psql -U tmadmin -d postgres -tAc "$1"; }

# 1. Database + its own role (not tmadmin: Umami doesn't need the other DBs).
if ! grep -q '^UMAMI_DATABASE_URL=' .env; then
  PW=$(openssl rand -hex 24)
  cp .env ".env.bak-$STAMP"
  [ "$(psql_pg "SELECT 1 FROM pg_roles WHERE rolname='umami'")" = 1 ] \
    && psql_pg "ALTER ROLE umami PASSWORD '$PW'" \
    || psql_pg "CREATE ROLE umami LOGIN PASSWORD '$PW'"
  [ "$(psql_pg "SELECT 1 FROM pg_database WHERE datname='umami_db'")" = 1 ] \
    || psql_pg "CREATE DATABASE umami_db OWNER umami"
  printf '\nUMAMI_DATABASE_URL=postgresql://umami:%s@tm-postgres:5432/umami_db\nUMAMI_APP_SECRET=%s\nUMAMI_WEBSITE_ID=\n' \
    "$PW" "$(openssl rand -hex 32)" >> .env
  echo "✓ umami_db + .env vars (backup: .env.bak-$STAMP)"
fi

# 2. Container (runs its own migrations on first start).
docker compose up -d umami
echo -n "waiting for umami"
until curl -sf http://127.0.0.1:3006/api/heartbeat >/dev/null; do echo -n .; sleep 2; done
echo " ✓"

# 2b. Replace the stock admin/umami password and register the website, so the
#     dashboard never sits on default credentials and no Website ID has to be
#     copied by hand. The new password goes to a root-only file.
if ! grep -qE '^UMAMI_WEBSITE_ID=.+' .env; then
  U=http://127.0.0.1:3006
  ADMIN_PW=$(openssl rand -base64 18 | tr -d '/+=')
  json() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }
  TOKEN=$(curl -sf "$U/api/auth/login" -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"umami"}' | json "['token']")
  AUTH="Authorization: Bearer $TOKEN"
  curl -sf "$U/api/me/password" -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"currentPassword\":\"umami\",\"newPassword\":\"$ADMIN_PW\"}" >/dev/null
  (umask 077; echo "admin / $ADMIN_PW" > /root/umami-admin.txt)
  WID=$(curl -sf "$U/api/websites" -H "$AUTH" -H 'Content-Type: application/json' \
    -d '{"name":"Ditchfest","domain":"df.esvalirion.tech"}' | json "['id']")
  sed -i "s|^UMAMI_WEBSITE_ID=.*|UMAMI_WEBSITE_ID=$WID|" .env
  grep -q '^UMAMI_WEBSITE_ID=' .env || echo "UMAMI_WEBSITE_ID=$WID" >> .env
  echo "✓ admin password → /root/umami-admin.txt, website $WID"
fi

# 3. nginx: /stats/ on the site block (tracker, same-origin on every mirror
#    domain) + a dashboard server block. HTTP only — Cloudflare Flexible
#    terminates TLS, and no forced redirect (see CLAUDE.md, «Известные грабли»).
#    nginx passes CF-Connecting-IP / CF-IPCountry through as-is; Umami reads
#    both for the visitor's IP and country.
SITE=/etc/nginx/sites-enabled/df
if ! grep -q 'location /stats/' "$SITE"; then
  cp "$SITE" "/root/nginx-df.bak-$STAMP"
  python3 - "$SITE" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
# Only the tracker script and its collect endpoint — not a blanket /stats/
# proxy, which would expose the whole Umami app (login page included) on the
# public site domains. The dashboard lives on its own subdomain below.
block = """    location = /stats/s.js {
        proxy_pass         http://127.0.0.1:3006/s.js;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
    }

    location = /stats/api/send {
        proxy_pass         http://127.0.0.1:3006/api/send;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
    }

    location / {"""
assert s.count("    location / {") == 1
open(p, "w").write(s.replace("    location / {", block, 1))
PY
fi
if [ ! -e /etc/nginx/sites-enabled/stats ]; then
  cat > /etc/nginx/sites-available/stats <<'NGX'
server {
    listen 80;
    server_name stats.esvalirion.tech;

    location / {
        proxy_pass         http://127.0.0.1:3006;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
    }
}
NGX
  ln -s /etc/nginx/sites-available/stats /etc/nginx/sites-enabled/stats
fi
nginx -t && systemctl reload nginx
echo "✓ nginx (backup: /root/nginx-df.bak-$STAMP)"

# 4. Recreate the site container so it picks up UMAMI_WEBSITE_ID.
docker compose up -d ditchfest
echo "✓ ditchfest-site restarted with the tracker tag"

cat <<'TXT'

Left by hand:
  Cloudflare DNS: A stats.esvalirion.tech → 134.209.88.70, proxied.
  Until then: ssh -L 3006:127.0.0.1:3006 134.209.88.70 → http://localhost:3006
  Login: /root/umami-admin.txt. ditchfest.su lands in the same website — the
  tracker reports the hostname per hit.
TXT
