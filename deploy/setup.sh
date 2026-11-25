#!/usr/bin/env bash
# Leeway website on a VPS (Ubuntu / Debian): nginx + free HTTPS (Let's Encrypt) + auto-update from GitHub.
#
#   curl -fsSL https://raw.githubusercontent.com/Leeway-mcp/Leeway-mcp/main/deploy/setup.sh -o setup.sh
#   sudo bash setup.sh your-domain.com you@example.com
#
# Safe to run again: it updates the site and keeps the existing certificate.
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "usage: sudo bash setup.sh your-domain.com you@example.com"; exit 1
fi
if [ "$(id -u)" -ne 0 ]; then echo "run with sudo"; exit 1; fi

REPO="https://github.com/Leeway-mcp/Leeway-mcp.git"
DIR="/var/www/leeway"

echo "==> 1/6 packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx git certbot python3-certbot-nginx ufw curl

echo "==> 2/6 site files from GitHub"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin main && git -C "$DIR" reset --hard origin/main
else
  git clone --depth 1 "$REPO" "$DIR"
fi
chown -R www-data:www-data "$DIR"

# include www.<domain> only if its DNS already points at this server
SERVER_IP="$(curl -fsS https://api.ipify.org || true)"
WWW_IP="$(getent ahostsv4 "www.$DOMAIN" | awk 'NR==1{print $1}' || true)"
NAMES="$DOMAIN"
if [ -n "$SERVER_IP" ] && [ "$WWW_IP" = "$SERVER_IP" ]; then NAMES="$DOMAIN www.$DOMAIN"; fi
ROOT_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [ -n "$SERVER_IP" ] && [ "$ROOT_IP" != "$SERVER_IP" ]; then
  echo "!! $DOMAIN points to '${ROOT_IP:-nothing}', this server is $SERVER_IP."
  echo "!! Add an A record $DOMAIN -> $SERVER_IP at your domain registrar, wait a few minutes, run again."
  exit 1
fi

echo "==> 3/6 nginx ($NAMES)"
cat > /etc/nginx/sites-available/leeway <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $NAMES;
    root $DIR/site;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options SAMEORIGIN always;

    location / {
        try_files \$uri \$uri/ =404;
    }
    location ~* \.(?:png|jpg|jpeg|webp|svg|ico|woff2?)\$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
        try_files \$uri =404;
    }
    location ~* \.(?:css|js)\$ {
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
        try_files \$uri =404;
    }
    location ~ /\.(?!well-known) { deny all; }
}
NGINX
ln -sf /etc/nginx/sites-available/leeway /etc/nginx/sites-enabled/leeway
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "==> 4/6 firewall (SSH stays open)"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

echo "==> 5/6 HTTPS certificate"
CERT_ARGS=""
for n in $NAMES; do CERT_ARGS="$CERT_ARGS -d $n"; done
# shellcheck disable=SC2086
certbot --nginx $CERT_ARGS --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring

echo "==> 6/6 auto-update from GitHub every 10 minutes"
cat > /etc/cron.d/leeway-site <<CRON
*/10 * * * * root git -C $DIR fetch -q --depth 1 origin main && git -C $DIR reset -q --hard origin/main && chown -R www-data:www-data $DIR
CRON

echo ""
echo "Done: https://$DOMAIN"
echo "Privacy policy for the extension stores: https://$DOMAIN/privacy.html"
