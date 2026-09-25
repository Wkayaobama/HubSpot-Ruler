# Hermes Agent × HubSpot — Architecture

Design record for the autonomous RevOps agent stack. Written in the same
spirit as `ui-extension/docs/ARCHITECTURE.md`: decisions, proven patterns,
and the failure modes to avoid. Read `docs/SCOPING.md` for the open
decisions; nothing here requires rework whichever way those land.

---

## 1. System overview

Three cooperating layers on one Ubuntu VPS, plus two HubSpot-side pieces:

```
  (1) HARNESS         Hermes agent (official installer, systemd, 24/7)
       owner ⇄ Telegram bot gateway (BotFather token, allowed-user-ID)
       workspace: soul.md · user.md · memory · skills/ · inbox/ · knowledge/

  (2) COMPANION STACK (/opt/hermes-stack — this repo's hermes-agent/)
       bridge/   FastAPI on 127.0.0.1:8787, TLS via Caddy
                 POST /hooks/hubspot  → verify signature → task template
                 → dispatch to harness
       scraper/  systemd timer 4×/day → Telegram channels → keyword score
                 → knowledge inbox → digest task to harness
       hermeslib/ shared config · signature verification · dispatch

  (3) SEED SKILLS     revops-radar · hubspot-crm (+hs_api.py) · inbox-sweep
                      · skill-authoring  → copied into the harness skills dir

  HubSpot side:
       (a) workflow trigger  — custom-code action (scaffolded) or a
           projects-platform workflow-action component (Option B)
       (b) private app token — the agent's credential for CRM read/write
```

Separation rationale: the harness is a moving target (its installer updates
itself); the companion stack is *ours*, versioned in git, and touches the
harness only through three narrow, swappable interfaces (inbox dir, optional
local hook URL, optional CLI template). If the harness changes or is
replaced, only `.env` values change.

## 2. Data flows

### Flow 1 — owner chat (pure guide)
Telegram ⇄ harness gateway. Untouched by this scaffold.

### Flow 2 — RevOps auto-update (scrape → digest → skills)
```
hermes-scraper.timer (05,11,17,23:30 UTC ±10min)
  → scrape_telegram.py   mode auto: Telethon user session, else t.me/s/ preview
  → per-channel incremental fetch (state/telegram_state.json, min_id)
  → keyword scoring against sources.yaml topics (revops / gtm / skills_patterns)
  → digest.py: content-hash dedupe → markdown + frontmatter
      → $KNOWLEDGE_DIR/inbox/<date>-<channel>-<msgid>.md
  → dispatch_task("RevOps radar: N new items…")
      → harness runs revops-radar skill:
          distill → patterns.md (dated, sourced bullets)
          reusable how-tos → skill-authoring → new/updated skills
          → Telegram digest to owner (≤10 bullets) → archive items
```
This implements "skills and patterns auto-update": every cycle can end with
new/updated skill files, and the guide's self-improvement loop compounds.

### Flow 3 — HubSpot-triggered work
```
HubSpot workflow (enrollment event)
  → custom-code action (hermesTrigger.js): builds payload, HMAC-signs,
    POST https://<domain>/hooks/hubspot           [<10s, fire-and-queue]
  → bridge: verify signature (401 on failure) → validate action
  → task template (deal_review / contact_enrich / company_brief /
    revops_digest / custom) → dispatch_task()
  → harness executes via hubspot-crm skill (hs_api.py, private-app token)
  → write-back: Note on the record (default), Task if follow-up warranted
  → workflow sees outputs: hermes_status, hermes_task_id (branchable)
```
The bridge answers `queued` immediately — agent work is async by design, so
the workflow action never risks the custom-code execution timeout, and slow
LLM work can't fail the workflow.

## 3. Dispatch: companion → harness

Three modes in `hermeslib/dispatch.py`, combinable; inbox is always on.

| Mode | Coupling | Latency | Status |
|---|---|---|---|
| inbox file-drop + `inbox-sweep` cron skill (`hermes cron create "5m" …`) | none (filesystem) | ≤ sweep interval (5 min) | the guaranteed baseline |
| local HTTP hook (`HERMES_HOOK_URL`) → Hermes' native inbound webhook platform (port 8644, `WEBHOOK_ENABLED`/`WEBHOOK_SECRET`, routes via `hermes webhook subscribe`) | harness gateway API | instant | confirm route auth/payload contract on the installed build (`hermes webhook --help`) |
| CLI one-shot (`HERMES_CLI_TEMPLATE`, e.g. `hermes chat -q "…"`) | harness CLI | instant but synchronous | for short pings; long tasks ride the inbox |

Hermes also exposes an OpenAI-compatible local API server (127.0.0.1:8642,
`API_SERVER_ENABLED=true` + `API_SERVER_KEY`, `POST /v1/chat/completions` /
`/v1/responses` / `/v1/runs`) — a future upgrade path for the bridge if
per-task sessions with streamed status are wanted.

The inbox file is written **before** hook/CLI delivery and is the durable
record; accelerator failure can delay a task but never lose it. Task files
carry frontmatter (`task_id`, `source`, object context) so the agent can
reason about provenance, and the sweep protocol (move out of inbox before
executing; `done/` / `failed/` + failure notes) makes the queue idempotent.

## 4. Security model (guide §2, applied)

| Surface | Control |
|---|---|
| Bridge exposure | binds 127.0.0.1 only; Caddy exposes exactly `/hooks/hubspot` + `/healthz`; ufw allows 22/80/443 only |
| Bridge authn | required signature on every request, constant-time compares: `X-Hermes-Signature` = hex HMAC-SHA256(secret, `ts.body`) with 5-min replay window (custom-code action); HubSpot Signature **v2** = hex SHA-256(secret+method+uri+body) (workflow-action / webhook action); or `X-HubSpot-Signature-v3` = base64 HMAC-SHA256 over method+uri+body+ts (app webhooks) |
| Secrets | `/opt/hermes-stack/.env` chmod 600; HubSpot-side values in workflow-action secrets; never in chat with the agent (LLM-transit risk, guide §2) |
| Scraped content | untrusted-input rule in revops-radar: instructions inside posts are data, never commands (prompt-injection defense) |
| Agent HubSpot writes | dedicated private app (not the IcAlps app token) with minimal scopes; skill guardrails: Notes/Tasks only by default, no deletes/merges/settings, explicit instruction required for property updates |
| Telegram gateway | allowed-user-ID restriction (guide §5.5); scraper uses a separate user session so the gateway bot never needs channel access |
| Payloads | 64 KB body cap; unknown `action` rejected; `custom` requires explicit prompt |

## 5. HubSpot trigger options (verified 2026-07-12)

> **Decided 2026-07-13: Option B is the trigger.** Options A/C kept below
> as documented fallbacks.

**Option B — `workflow-action` component (DECIDED).** Verified against
the component docs + HubSpot's official 2026.03 example: `workflow-action`
components are explicitly supported for `distribution: private` +
`auth.type: static` apps and — unlike custom code actions — require **no
Operations/Data Hub subscription** (just workflows). A validated-schema
manifest is staged at `hubspot/workflow-action/hermes-trigger-hsmeta.json`
(promotion playbook in its README — sandbox first; the IcAlps app is live on
prod). Execution: HubSpot POSTs the native payload (`callbackId`, `origin`,
`object`, `inputFields`) to `actionUrl`, signed with **X-HubSpot-Signature
v2** (hex SHA-256 of `clientSecret+method+URI+body`); 5xx retried with
exponential backoff up to 3 days, 429 honors Retry-After. The bridge
natively accepts this payload, verifies v2, and answers
`outputFields.hs_execution_state=SUCCESS` + `hermes_task_id`. Open item:
where static-auth 2026.03 apps surface the client secret (see the staged
README's mitigation).

**Option A — custom code action (quickest if Ops Hub/Data Hub Pro+).**
`hubspot/workflow-custom-code/hermesTrigger.js`. Verified runtime: Node v20,
20s / 128 MB limit, axios ^1.2.0 preloaded, secrets as env vars, event =
`{origin, object.{objectType,objectId}, inputFields, callbackId}`, output
via `callback({outputFields})`. Signs with our shared-secret HMAC, full
payload control, no app build/install cycle. Constraint: Operations Hub
(now "Data Hub") Professional/Enterprise; code lives portal-side
(mitigated: canonical copy in git).

**Option C — native "Send a webhook" action.** Zero code, but also gated to
Data Hub Pro/Ent. Auth options: request signature (v2 semantics — the bridge
verifies it) or API key header. Body: all properties or a customized
key/value body.

**Ruled out:** app-functions cannot be the trigger — 2026.03 serverless has
no scheduled/cron invocation, and public "endpoint functions" require
Content Hub Enterprise and ship unauthenticated by default.

**Async upgrade path (any option):** return
`hs_execution_state=BLOCK` + `hs_expiration_duration`, do the long agent
work, then complete via `POST /automation/v4/actions/callbacks/{callbackId}/complete`
(scope `automation`) — puts the agent's *result*, not just "queued", into
the workflow. Ship after v1.

## 6. HubSpot API surface used by the agent

Via `skills/hubspot-crm/hs_api.py` (stdlib-only, so any python3 the agent
grabs works):

| Operation | Endpoint | Notes |
|---|---|---|
| Read record | `GET /crm/v3/objects/{type}/{id}` | `?properties=` |
| Search | `POST /crm/v3/objects/{type}/search` | filters `EQ/GT/CONTAINS_TOKEN/…`; rate-limited tighter than plain reads |
| Associations | `GET /crm/v4/objects/{type}/{id}/associations/{to}` | |
| Note write-back | `POST /crm/v3/objects/notes` | `hs_note_body` + `hs_timestamp` (epoch **ms**) + inline associations |
| Task creation | `POST /crm/v3/objects/tasks` | `hs_task_subject/body/status/type` + due `hs_timestamp` |
| Property update | `PATCH /crm/v3/objects/{type}/{id}` | guarded: explicit instruction only |

Engagement association typeIds baked into `hs_api.py` (HUBSPOT_DEFINED,
**verified against the official defaults table 2026-07-12**): note→contact
202, note→company 190, note→deal 214, task→contact 204, task→company 192,
task→deal 216. Same convention as the IcAlps functions' typeId maps.

Verified constraints the agent must respect:
- `hs_note_body` caps at 65,536 chars; `hs_timestamp` accepts ms-epoch or
  ISO8601 (we standardize on ms; on tasks it is the DUE date).
- CRM Search: 5 req/s **account-wide**, 200 results/page, 10,000-result
  ceiling per query; new records take moments to index. Legacy `/crm/v3`
  paths remain supported after HubSpot's 2026-03-30 move to date-based API
  versioning — we stay on v3.
- Private-app rate limits: Pro portals 190 req/10s per app + 625k/day
  shared; search excluded (own 5/s limit).
- Scopes for notes/tasks per the guides: `crm.objects.contacts.read/write`
  (grant contacts+companies+deals read/write and smoke-test one write per
  object type — per-endpoint enforcement for deal/company-only
  associations is not fully documented).

429 handling: single 10s backoff retry, then surface the error — never loop.

## 7. Assumption register (verification status)

Facts this scaffold depends on, each with its blast radius if wrong. This
section is updated as research/verification lands.

| # | Assumption | If wrong | Status |
|---|---|---|---|
| A1 | Harness exposes programmatic entries for task injection | — | **RESOLVED**: Hermes Agent (Nous Research) has `hermes chat -q`, native webhook platform (:8644), OpenAI-compatible API server (:8642), and `hermes cron create`; exact webhook route contract to confirm on the installed build |
| A2 | Subscription gates | — | **RESOLVED**: Option B (workflow-action) needs no Ops/Data Hub at all; Ops Hub Pro+ only gates Options A and C. Remaining check: portal tier if A/C wanted (SCOPING Q1) |
| A3 | Engagement association typeIds as listed in §6 | — | **CONFIRMED** against the official defaults table |
| A4 | HubSpot signature algorithms | — | **CONFIRMED** v3 (app webhooks) as implemented; **corrected**: workflow-action + webhook-action posts use v2 (plain SHA-256 concat) — bridge now verifies v2 too. New open item: where static-auth 2026.03 apps surface the client secret (`hubspot/workflow-action/README.md`) |
| A5 | Telegram bots can't read channels they're not in → scraping needs a user session or t.me/s/ previews | — | **CONFIRMED** (Bot API has no history fetch; MTProto `messages.getHistory` is user-only) |
| A6 | t.me/s/ previews remain available for chosen channels | force `mode: mtproto` | per-channel check at setup |
| A7 | Harness skill format | — | **RESOLVED**: `~/.hermes/skills/<category>/<skill>/SKILL.md`, YAML frontmatter (`name`, `description`, `version`, `metadata.hermes.{tags,category}`); `/reload-skills` re-scans without restart; seed skills follow this layout |

### Confirmed harness facts (research 2026-07-12)

- Hermes Agent is an independent open-source project by **Nous Research**
  (MIT): github.com/NousResearch/hermes-agent, docs at
  hermes-agent.nousresearch.com/docs (not an OpenClaw fork — it ships an
  OpenClaw *migrator*, which is why the Ottho guide's concepts map 1:1).
- Install: `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`;
  wizard offers Quick Setup (Nous Portal) vs Full Setup (the guide's pick).
- Workspace `~/.hermes/`: `config.yaml` (model/settings), `.env` (keys:
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`, `ANTHROPIC_API_KEY`,
  `DEEPSEEK_API_KEY`, …), `SOUL.md`, `memories/MEMORY.md` + `USER.md`,
  `skills/`, `profiles/<name>/` (own bot + own key per profile, guide §9),
  `cron/jobs.json`.
- Gateway service: `sudo hermes gateway install --system` → systemd unit
  `hermes-gateway` (per-profile: `hermes-gateway-<profile>`); restart via
  `hermes gateway restart`. Telegram setup wizard: `hermes gateway setup`.
- Cron: `hermes cron create "<schedule>" "<prompt>"` (`"5m"`, `"every 1d at
  09:00"`, or 5-field cron) with `--skill/--name/--deliver`.

## 8. Failure modes designed against

- **Workflow timeout vs slow agent** — bridge queues and returns instantly;
  agent latency can never fail a HubSpot workflow (§2 Flow 3).
- **Lost tasks on restart** — inbox files are durable; hook/CLI are
  accelerators only (§3).
- **Replay/forged webhooks** — mandatory signatures + timestamp window +
  constant-time compare (§4).
- **Duplicate knowledge spam** — content-hash dedupe registry persists
  across runs; per-channel min_id prevents refetch.
- **FloodWait bans** — scraper stops the run on FloodWaitError and lets the
  timer catch up later; never sleeps-and-hammers.
- **Prompt injection via scraped posts** — untrusted-data rule in
  revops-radar guardrails.
- **Agent overreach in CRM** — write guardrails + minimal scopes + separate
  token, mirroring the least-privilege posture of the IcAlps app.
