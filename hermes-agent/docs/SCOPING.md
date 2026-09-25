# Scoping questions

## Decisions locked (2026-07-13)

| Topic | Decision |
|---|---|
| HubSpot trigger | **Workflow-action component** (Option B). Promote `hubspot/workflow-action/hermes-trigger-hsmeta.json` through sandbox 49610528 per its README, then prod. |
| LLM brain | **Anthropic API** (`ANTHROPIC_API_KEY` in `~/.hermes/.env`, provider `anthropic`). |
| Telegram scraping | **Zero-auth `t.me/s/` web preview first** (no credentials; last ~20 posts/channel/run). Upgrade path to MTProto session = fill 3 env vars, scraper auto-switches. |
| HubSpot access | **New dedicated "Hermes Agent" private app, sandbox 49610528 first**, then swap token + portal id in `.env` for prod 9201667. |

## Still open (answers welcome anytime)

1. **Channel list** (Q4.1 below) — the single most needed input: which
   public Telegram channels (or newsletters/RSS sources) should the radar
   watch? `scraper/sources.yaml` ships with placeholders.
2. **First workflow triggers** (Q1.3) — which events enroll records
   (deal stage change, deal idle N days, new target-account contact…).
3. **Bridge domain** (Q6.2) — which subdomain points at the VPS.
4. **Agent write surface beyond Notes/Tasks** (Q5.2).
5. **Telegram allowed user IDs** for the gateway bot (Q6.3).

---

The original question register follows (kept for context; the scaffold is
built so every question maps to a config value, a file swap, or a documented
alternative path). Ordered by how much they block go-live.

## Q1 — HubSpot trigger mechanism (blocks the HubSpot side)

Research verdict (2026-07-12, all claims verified against HubSpot docs +
official examples): three viable mechanisms, with a clear default.

| Option | Where it lives | Pros | Cons / gate |
|---|---|---|---|
| **B. `workflow-action` component (RECOMMENDED)** — staged with verified schema at `hubspot/workflow-action/` | Promoted into `ui-extension/src/app/workflow-actions/` | **No Ops/Data Hub required**; versioned in git; first-class "Trigger Hermes Agent" action for any workflow builder; HubSpot-managed retries (up to 3 days) | Sandbox validation pass before touching the live prod app (playbook in the staged README); client-secret surfacing for v2 signature is an open item |
| A. Custom code action (scaffolded: `hubspot/workflow-custom-code/hermesTrigger.js`) | Pasted into the workflow editor | Ships today, zero app changes; our own HMAC signing | Requires **Operations Hub / Data Hub Professional+**; code lives in the portal, not git |
| C. Native "Send a webhook" action | Workflow editor | Zero code (bridge verifies its v2 signature) | Also Data Hub Pro+ gated; less payload control |

**Questions:**
1. Does portal 9201667 have Operations Hub / Data Hub Professional or
   Enterprise? → gates A and C only. If yes, A is the fastest interim
   trigger while B goes through sandbox validation; if no, B is the only
   path (and is the better end-state anyway).
2. Should the trigger be usable by every workflow builder in the portal
   (favors B), or is this a controlled integration owned by you (A is fine)?
3. Which workflow events should trigger the agent first? (deal stage change,
   deal idle N days, new contact from target account, manual enrollment…)
4. OK to run the Option B validation on sandbox 49610528 (upload +
   reauthorize + test workflow), per the IcAlps cutover discipline?

## Q2 — Hermes dispatch accelerator & profile layout

Harness identified (ARCHITECTURE §7): Hermes Agent by Nous Research. The
inbox + `hermes cron` sweep baseline works as scaffolded (≤5-min pickup).
For instant pickup, two native options exist — remaining choices:

1. Enable Hermes' inbound webhook platform (port 8644) as the dispatch
   accelerator, or is ≤5-min cron-sweep latency fine for v1? (The webhook
   route auth/payload contract should be confirmed on the installed build:
   `hermes webhook --help`.)
2. Is a dedicated Hermes **profile** wanted for RevOps (guide §9: separate
   Telegram bot + own API key + own `hermes-gateway-<profile>` service), or
   does the main profile handle everything? (Recommendation: main profile
   for v1; split when non-RevOps use appears.)

## Q3 — LLM provider & budget

The guide demos DeepSeek for cost, with a data-residency warning (China).
Given this agent handles CRM data, that warning matters.

1. Which provider/key for the agent brain — Anthropic API, or something
   else? (Recommended: Anthropic; CRM data should not transit providers you
   would not put in your DPA.)
2. Rough monthly token budget? This gates how aggressive the scraper timer
   and digest cadence can be (currently 4×/day).

## Q4 — Scraping sources & cadence

`scraper/sources.yaml` ships with placeholder channels.

1. Which Telegram channels/groups do you actually follow for RevOps and
   AI-skills content? (Usernames; must be public or joinable by the scraping
   user account.) **This one genuinely needs your input**: research could
   not verify any active English-language RevOps/GTM channels — the only
   verified adjacent ones are Russian-language B2B sales/growth channels
   (`@Salesnotes`, `@epicgrowth`, `@product_cult`). If your RevOps sources
   are actually newsletters/LinkedIn/communities rather than Telegram,
   say so — the digest pipeline is source-agnostic and an RSS/web fetcher
   slots in beside the Telegram one.
2. Is a Telegram **user session** acceptable for scraping (full-history
   MTProto via Telethon, needs api_id/api_hash from my.telegram.org), or
   stay zero-auth on `t.me/s/` previews (last ~20 posts, some channels
   disabled)? The scraper auto-selects based on whether the session is set.
   Best practice per research: use a dedicated, aged, non-critical Telegram
   account for the session — datacenter-IP logins on fresh accounts are the
   main flagging trigger.
3. Should non-Telegram sources (RSS, newsletters, Reddit/HN) join the radar
   in a later iteration?

## Q5 — HubSpot access model for the agent

Scaffolded assumption: a dedicated **private app** token with read scopes on
contacts/companies/deals + write limited to those objects (Notes/Tasks ride
on the object scopes). Alternative: reuse the existing IcAlps app's token —
NOT recommended (blast-radius separation; per-integration revocation).

1. Confirm: create a new private app "Hermes Agent" on 9201667?
2. Which write surface may the agent touch beyond Notes/Tasks? (e.g. is
   updating `hs_next_step` or `icalps_*` properties allowed on explicit
   workflow instruction?)
3. Target sandbox 49610528 first, or straight to prod with the write
   guardrails? (Recommended: sandbox smoke-test of the full loop, then swap
   token + portal id in `.env`.)

## Q6 — VPS & domain

1. Hostinger KVM2 as per the guide, or an existing VPS? Region/data
   residency constraints?
2. Which domain/subdomain for the bridge (e.g. `agent.<yourdomain>`)?
   Caddy needs it for TLS, HubSpot needs it as the webhook URL.
3. Who besides you may talk to the agent's Telegram bot (allowed user IDs)?
