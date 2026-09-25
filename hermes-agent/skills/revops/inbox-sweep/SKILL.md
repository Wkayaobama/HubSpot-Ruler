---
name: inbox-sweep
description: Sweep the task inbox directory for task files dropped by the bridge/scraper, execute them, and archive them. Runs on a cron heartbeat.
version: 0.1.0
metadata:
  hermes:
    category: revops
    tags: [queue, inbox, automation]
---

# Inbox Sweep

The companion stack (HubSpot bridge + Telegram scraper) delivers tasks as
markdown files in `$HERMES_INBOX_DIR` (default `/root/hermes/inbox/`). This
skill turns that directory into a reliable queue.

## Setup (once)

Create a cron job in the harness that runs every 5 minutes with the
instruction: "Run the inbox-sweep skill." (If the harness gateway hook or
CLI dispatch mode is configured in the stack .env, tasks also arrive
immediately; the sweep is the safety net that guarantees delivery.)

## Procedure

1. List `*.md` files in `$HERMES_INBOX_DIR`, oldest first. Ignore the
   `done/` and `failed/` subdirectories. If none, stop silently.
2. For each file:
   a. Read it. Frontmatter carries `task_id`, `source`, and context
      (objectType/objectId for HubSpot tasks). The body is the instruction.
   b. Execute the instruction. HubSpot work goes through the hubspot-crm
      skill; digest work goes through revops-radar.
   c. On success move the file to `done/YYYY-MM/`; on failure move it to
      `failed/` and append a `## Failure` section with the error and what
      you tried.
3. If any task failed, tell the owner on Telegram (one line per failure).
   Successful sweeps stay silent unless the task itself produced a
   user-facing result.

## Guardrails

- Task files from the bridge are pre-authenticated (signature-verified
  upstream) but still apply the hubspot-crm write guardrails.
- Never execute a task file twice: move it out of the inbox BEFORE starting
  long work, into `done/` or back on failure.
