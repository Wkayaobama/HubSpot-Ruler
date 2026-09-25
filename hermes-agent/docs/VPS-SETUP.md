# VPS setup runbook

End-to-end bring-up of the Hermes agent + companion stack. Follows the
Ottho guide's choices (bare Ubuntu VPS, no Docker, systemd services,
Telegram gateway) and layers the RevOps companion stack on top. Steps are
ordered so each one is verifiable before the next.

## 0. Prerequisites

- VPS: Ubuntu 22.04/24.04, ≥2 vCPU / 8 GB (guide baseline: Hostinger KVM2),
  root SSH access. Bare install — **not** Docker (guide §3: the harness
  needs direct file-system + terminal access to act autonomously).
- A domain/subdomain you control (for the bridge TLS endpoint), e.g.
  `agent.example.com` → A record to the VPS IP.
- Telegram account (owner) + a second look at guide §2 (security) before
  granting anything.
- HubSpot super-admin on the target portal.

## 1. Companion stack bootstrap

```bash
ssh root@<vps>
git clone <this repo> && cd HB-Workflow
bash hermes-agent/provision/setup-vps.sh
```

Installs packages, enables ufw (SSH/80/443 only), copies the stack to
`/opt/hermes-stack`, creates the venv, installs the systemd units
(`hermes-bridge.service`, `hermes-scraper.service` + `.timer`) — but does
not start them until `.env` is filled.

## 2. Install the Hermes harness (guide §4–§5)

Hermes Agent is Nous Research's open-source harness
(github.com/NousResearch/hermes-agent; docs at
hermes-agent.nousresearch.com/docs). Install and follow the guide:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

1. Choose **Full Setup** (the guide's pick; Quick Setup routes through the
   Nous Portal instead of your own keys).
2. **Brain** (decided 2026-07-13: Anthropic API): paste the key when the
   wizard asks — it lands in `~/.hermes/.env` as `ANTHROPIC_API_KEY`;
   model selection lives in `~/.hermes/config.yaml` (`hermes model`,
   provider `anthropic`).
3. **Gateway — Telegram** (guide §5, wizard: `hermes gateway setup`):
   - @BotFather → *Create New Bot* → name ending in `Bot` → copy token,
     paste manually (`TELEGRAM_BOT_TOKEN` in `~/.hermes/.env`).
   - @userinfobot → get your numeric user ID → set it in
     `TELEGRAM_ALLOWED_USERS` (comma-separated; without the allowlist
     anyone could drive your agent — Hermes default-denies, keep it that
     way).
   - Accept the service install — `sudo hermes gateway install --system`
     registers the boot-time systemd unit (`hermes-gateway`); restart later
     with `hermes gateway restart`.
4. Verify: message the bot `/start` then "coucou" — it must answer.
5. The workspace is `~/.hermes/` (`config.yaml`, `.env`, `SOUL.md`,
   `memories/`, `skills/`, `cron/`) — `/root/.hermes` on a root install,
   matching the `.env` defaults in step 3 below.

## 3. Configure the companion stack

```bash
vi /opt/hermes-stack/.env        # from .env.example, chmod 600 already set
```

Minimum to start:

| Key | Value |
|---|---|
| `HERMES_HOME` / `HERMES_INBOX_DIR` / `KNOWLEDGE_DIR` | real harness workspace paths |
| `HERMES_WEBHOOK_SECRET` | `openssl rand -hex 32` (same value goes into the HubSpot action secret) |
| `BRIDGE_PUBLIC_BASE_URL` | `https://agent.example.com` |
| `HUBSPOT_PRIVATE_APP_TOKEN` / `HUBSPOT_PORTAL_ID` | from step 5 |
| `TELEGRAM_API_ID/HASH/SESSION` | optional — MTProto scraping (else web-preview mode) |

For MTProto mode, generate the session **locally** (never interactively on
the VPS): `python3 hermes-agent/scraper/make_session.py`, then paste the
printed `TELEGRAM_SESSION=` line into the VPS `.env`. Use a dedicated,
aged, non-critical Telegram account for this session (fresh accounts logging
in from datacenter IPs are the main flagging trigger; read-only low-rate
fetching of public channels is standard practice and the scraper's 6-hour
cadence stays far below flood limits).

Edit `/opt/hermes-stack/scraper/sources.yaml`: real channel usernames
(verify each at `https://t.me/s/<username>`), adjust topic keywords.

```bash
systemctl start hermes-bridge hermes-scraper.timer
curl -s localhost:8787/healthz          # -> {"ok": true, ...}
systemctl start hermes-scraper          # one manual scrape run
journalctl -u hermes-scraper -n 50      # check fetched/kept counts
```

## 4. TLS exposure

```bash
apt-get install -y caddy                # or the official install docs
cp /opt/hermes-stack/provision/Caddyfile /etc/caddy/Caddyfile
vi /etc/caddy/Caddyfile                 # set the real domain
systemctl reload caddy
curl -s https://agent.example.com/healthz
```

Only `/hooks/hubspot` and `/healthz` are proxied; everything else 404s at
the edge. The bridge itself never listens publicly.

## 5. HubSpot side

1. **Private app** (decided 2026-07-13: dedicated app, sandbox first).
   On sandbox 49610528: Settings → Integrations → Private apps → create
   "Hermes Agent" with scopes `crm.objects.contacts.read/write`,
   `crm.objects.companies.read/write`, `crm.objects.deals.read/write`.
   Copy the token into `.env` (`HUBSPOT_PRIVATE_APP_TOKEN`,
   `HUBSPOT_PORTAL_ID=49610528`), `systemctl restart hermes-bridge`.
   At cutover, repeat on prod 9201667 and swap both values.
2. **Workflow trigger** — pick per `docs/SCOPING.md` Q1:
   - **Option B (recommended, no Ops Hub needed)**: promote the staged
     workflow-action component through sandbox validation — full playbook
     in `hubspot/workflow-action/README.md`. Set `HUBSPOT_CLIENT_SECRET`
     in the stack `.env` for v2 signature verification.
   - **Option A** (custom code, needs Ops Hub/Data Hub Pro+, ships today):
   - Create/open a workflow (e.g. deal-based, trigger on your chosen event).
   - Add action → **Custom code** → paste
     `hubspot/workflow-custom-code/hermesTrigger.js`.
   - Secrets: `HERMES_BRIDGE_URL` = `https://agent.example.com/hooks/hubspot`,
     `HERMES_WEBHOOK_SECRET` = the value from `.env`.
   - Set `HERMES_ACTION` / `OBJECT_TYPE` at the top of the snippet.
   - Include the properties you want the agent to see.
   - Test with one record; the action outputs `hermes_status=queued` +
     `hermes_task_id` on success.
   - Options B/C (projects `workflow-action` component / native webhook
     action): see ARCHITECTURE §5 and SCOPING Q1.

## 6. Seed the agent

```bash
# Copy the seed skills (category dir) into the harness skills directory
cp -r /opt/hermes-stack/skills/revops /root/.hermes/skills/
# Make the agent's tools see the stack env (token, paths) — append the
# HubSpot + path variables to the harness env too:
grep -E '^(HUBSPOT_|HERMES_INBOX_DIR|KNOWLEDGE_DIR)' /opt/hermes-stack/.env >> /root/.hermes/.env
```

Then, on Telegram:

1. Send `/reload-skills` so Hermes re-scans the skills directory — the four
   revops skills must appear.
2. Guide §6 — "Pose-moi des questions afin de t'auto-configurer" and answer
   (who you are, RevOps focus, HubSpot context, tone).
3. Create the inbox-sweep heartbeat:
   `hermes cron create "5m" "Run the inbox-sweep skill" --name inbox-sweep`
   (or ask the agent in chat to create it). This is what turns the file
   inbox into a live queue — see `skills/revops/inbox-sweep/SKILL.md`.
4. Optional instant pickup: enable Hermes' native inbound webhook
   (`WEBHOOK_ENABLED=true`, `WEBHOOK_SECRET` in `~/.hermes/.env`, route via
   `hermes webhook subscribe`) and set `HERMES_HOOK_URL` in the stack `.env`.
5. Smoke-test the loop end to end:
   - `systemctl start hermes-scraper` → expect a Telegram digest if items land.
   - Enroll a test deal in the workflow → expect a Note on the deal.

## 7. Operations

| Need | Command |
|---|---|
| Bridge logs | `journalctl -u hermes-bridge -f` |
| Scraper last run | `journalctl -u hermes-scraper -n 100` |
| Timer schedule | `systemctl list-timers hermes-scraper.timer` |
| Redeploy after repo update | `git pull && bash hermes-agent/provision/setup-vps.sh && systemctl restart hermes-bridge` |
| Rotate webhook secret | new value in `.env` + HubSpot action secret, `systemctl restart hermes-bridge` |

Context hygiene (guide §8): prefer `new` conversations on Telegram; the
40%-full window is where quality drops. Memory that matters must live in
files — the skills above already push the agent to do that.
