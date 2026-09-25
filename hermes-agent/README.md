# Hermes Agent — VPS stack

Infrastructure scaffold for an autonomous **Hermes agent** (per the Ottho
guide) that:

1. lives 24/7 on a VPS with a **Telegram gateway** to its owner,
2. **auto-updates its RevOps knowledge, skills and patterns** via a Telegram
   scraping layer,
3. **interacts with the HubSpot portal** (read CRM, write Notes/Tasks), and
4. can be **triggered from inside HubSpot** by a serverless workflow action.

```
                         ┌──────────────────────── VPS (Ubuntu) ────────────────────────┐
   Owner ⇄ Telegram bot  │  Hermes harness (official installer, systemd, 24/7)          │
                         │    ├── memory: soul.md / user.md / …                          │
                         │    ├── skills/  ◄── seeded from skills/ in this repo          │
                         │    └── inbox/   ◄── task files from the companion stack       │
                         │                                                               │
                         │  Companion stack (/opt/hermes-stack — THIS scaffold)          │
                         │    ├── bridge/   FastAPI  ◄─HTTPS─ HubSpot workflow action    │
                         │    ├── scraper/  Telegram channel ingestion (systemd timer)   │
                         │    └── hermeslib/ shared config · signatures · dispatch       │
                         └───────────────────────────────────────────────────────────────┘
   HubSpot portal 9201667 ⇄ agent (private-app token, via skills/hubspot-crm)
```

## Layout

| Path | What it is |
|---|---|
| `provision/` | `setup-vps.sh` bootstrap, systemd units (`hermes-bridge`, `hermes-scraper` + timer), `Caddyfile` TLS proxy |
| `bridge/` | FastAPI webhook endpoint HubSpot calls (`POST /hooks/hubspot`, signature-verified) |
| `scraper/` | Telegram ingestion: Telethon user-session mode or zero-auth `t.me/s/` preview mode, keyword scoring, knowledge-inbox writer |
| `hermeslib/` | Shared: env config, HMAC / X-HubSpot-Signature-v3 verification, task dispatch (inbox file / local hook / CLI) |
| `skills/revops/` | Seed skills for the harness (Hermes `skills/<category>/<skill>/SKILL.md` layout): `revops-radar`, `hubspot-crm` (+ `hs_api.py` CLI), `inbox-sweep`, `skill-authoring` |
| `hubspot/workflow-action/` | **Recommended trigger**: staged `workflow-action` component for the 2026.03 app (verified schema; sandbox-first promotion playbook in its README) |
| `hubspot/workflow-custom-code/` | Alternative trigger: copy-paste **custom code action** (needs Ops Hub Pro+; signs and POSTs to the bridge) |
| `docs/` | `ARCHITECTURE.md` (design + decisions), `VPS-SETUP.md` (runbook), `SCOPING.md` (open questions) |

## Quickstart (condensed — full runbook in docs/VPS-SETUP.md)

```bash
# On the VPS, as root
git clone <this repo> && cd HB-Workflow
bash hermes-agent/provision/setup-vps.sh     # companion stack -> /opt/hermes-stack

# Install the Hermes harness itself (Nous Research; see docs/VPS-SETUP.md §2):
#   curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
#   Full Setup -> LLM key -> Telegram bot token -> allowed user IDs -> service

vi /opt/hermes-stack/.env                    # secrets + paths
vi /opt/hermes-stack/scraper/sources.yaml    # real channel usernames
systemctl start hermes-bridge hermes-scraper.timer
curl -s localhost:8787/healthz               # {"ok":true,...}
```

Then on the HubSpot side: create a workflow → add a **Custom code** action →
paste `hubspot/workflow-custom-code/hermesTrigger.js` → add the two secrets
(`HERMES_BRIDGE_URL`, `HERMES_WEBHOOK_SECRET`). Details + alternatives in
`docs/ARCHITECTURE.md` §5.

## The auto-update loop

`hermes-scraper.timer` (4×/day) → fetch new posts from RevOps channels →
keyword-score → write markdown items to the agent's knowledge inbox →
dispatch a digest task → the agent's `revops-radar` skill distills patterns
into `patterns.md`, spawns/updates skills via `skill-authoring`, and briefs
the owner on Telegram. More usage → more skills — the guide's core loop,
pointed at RevOps.

## Security posture (guide §2 applied)

- Secrets live in `/opt/hermes-stack/.env` (chmod 600) — never in chat.
- The bridge binds to loopback; only Caddy (TLS) exposes `/hooks/hubspot`
  and `/healthz`; every request must carry a valid signature (shared-secret
  HMAC or `X-HubSpot-Signature-v3`) inside a 5-minute replay window.
- Scraped Telegram content is treated as **untrusted data** (prompt-injection
  guardrails in `skills/revops-radar/SKILL.md`).
- The agent's HubSpot writes are constrained by `skills/hubspot-crm/SKILL.md`
  guardrails: Notes/Tasks by default, no deletes, property updates only on
  explicit instruction.
