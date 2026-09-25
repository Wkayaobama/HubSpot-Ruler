#!/usr/bin/env bash
# Bootstrap the Hermes companion stack on a fresh Ubuntu VPS (22.04/24.04).
#
# This provisions the COMPANION layer (bridge + scraper + skills seed).
# The Hermes harness itself is installed separately with its official
# installer — see docs/VPS-SETUP.md step 2 — because its installer is
# interactive (LLM key, Telegram bot token, service install).
#
# Usage (as root on the VPS, from a checkout of this repo):
#   bash hermes-agent/provision/setup-vps.sh
#
# Idempotent: safe to re-run after edits.

set -euo pipefail

STACK_DIR=/opt/hermes-stack
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (the guide's baseline is a root VPS install)." >&2
  exit 1
fi

echo "==> [1/6] Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 python3-venv python3-pip git curl jq ufw

echo "==> [2/6] Firewall (SSH + HTTPS only; bridge itself stays on loopback)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null   # Let's Encrypt HTTP challenge
ufw allow 443/tcp >/dev/null
ufw status | grep -q "Status: active" || ufw --force enable

echo "==> [3/6] Install stack to ${STACK_DIR}"
mkdir -p "${STACK_DIR}"
rsync -a --delete \
  --exclude '.venv' --exclude 'state/*.json' --exclude '.env' \
  "${REPO_DIR}/" "${STACK_DIR}/"

echo "==> [4/6] Python venv + dependencies"
if [[ ! -d "${STACK_DIR}/.venv" ]]; then
  python3 -m venv "${STACK_DIR}/.venv"
fi
"${STACK_DIR}/.venv/bin/pip" install --quiet --upgrade pip
"${STACK_DIR}/.venv/bin/pip" install --quiet -r "${STACK_DIR}/requirements.txt"

echo "==> [5/6] Environment file"
if [[ ! -f "${STACK_DIR}/.env" ]]; then
  cp "${STACK_DIR}/.env.example" "${STACK_DIR}/.env"
  chmod 600 "${STACK_DIR}/.env"
  echo "    Created ${STACK_DIR}/.env from template — FILL IT IN before starting services."
else
  echo "    ${STACK_DIR}/.env already exists — left untouched."
fi

echo "==> [6/6] systemd units"
cp "${STACK_DIR}/provision/systemd/hermes-bridge.service" /etc/systemd/system/
cp "${STACK_DIR}/provision/systemd/hermes-scraper.service" /etc/systemd/system/
cp "${STACK_DIR}/provision/systemd/hermes-scraper.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable hermes-bridge.service hermes-scraper.timer

cat <<'NEXT'

Done. Next steps (docs/VPS-SETUP.md has the full runbook):
  1. Install the Hermes harness (interactive: Full Setup, LLM provider key,
     Telegram bot token from @BotFather, allowed user IDs from @userinfobot,
     accept the service install):
       curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
  2. Fill /opt/hermes-stack/.env  (secrets, HERMES_HOME, channel session).
  3. Edit /opt/hermes-stack/scraper/sources.yaml (real channel usernames).
  4. Start:   systemctl start hermes-bridge && systemctl start hermes-scraper.timer
  5. TLS:     install Caddy, adapt provision/Caddyfile, point your domain
              at this VPS. HubSpot must reach https://<domain>/hooks/hubspot.
  6. Smoke:   curl -s localhost:8787/healthz
  7. Seed skills:  cp -r /opt/hermes-stack/skills/revops /root/.hermes/skills/
     then send /reload-skills to the bot, and create the sweep heartbeat:
       hermes cron create "5m" "Run the inbox-sweep skill" --name inbox-sweep
NEXT
