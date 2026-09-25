---
name: hubspot-crm
description: Read and write the company HubSpot portal (deals, contacts, companies, notes, tasks) via the private-app API, with strict write guardrails.
version: 0.1.0
metadata:
  hermes:
    category: revops
    tags: [hubspot, crm, revops]
---

# HubSpot CRM

Use this skill whenever a task involves the HubSpot portal (portal id in
`$HUBSPOT_PORTAL_ID`). Authentication is the private-app token in
`$HUBSPOT_PRIVATE_APP_TOKEN` — read it from the environment; NEVER print it,
log it, or store it in memory files.

## Preferred tool: hs_api.py

This skill ships an executable helper (same directory, stdlib-only):

```bash
# Read one record (any object type) with chosen properties
python3 hs_api.py get --object deals --id 123456789 \
  --properties dealname,dealstage,amount,closedate,hs_lastmodifieddate

# Search (CRM Search API); query matches default searchable properties
python3 hs_api.py search --object contacts --query "acme.com" --limit 5

# Search with a property filter
python3 hs_api.py search --object deals \
  --filter "dealstage EQ appointmentscheduled" --limit 10

# Fetch a record's associations
python3 hs_api.py associations --object deals --id 123456789 --to contacts

# Write a Note onto a record (the standard write-back channel)
python3 hs_api.py note --body "Assessment: ..." --associate deal:123456789

# Create a Task (due in N days) associated to a record
python3 hs_api.py task --subject "Follow up" --body "..." \
  --due-days 3 --associate contact:987654

# Update deal properties (comma-separated key=value)
python3 hs_api.py update --object deals --id 123456789 \
  --set "hs_next_step=Send proposal"
```

All commands print the JSON response; non-2xx exits non-zero with the error
body on stderr.

## Write guardrails

- **Default write-back channel is a Note** on the relevant record. Notes are
  additive and auditable.
- Create Tasks only when a task explicitly warrants a human follow-up.
- Update properties ONLY when the triggering task explicitly asks for it.
- NEVER delete or merge records. NEVER touch pipeline/stage definitions,
  workflows, or settings endpoints.
- On HTTP 429 back off and retry once after 10s; if it persists, report
  instead of hammering.
- Keep note bodies under 65,536 chars (API cap) — summarize, don't dump.
- CRM Search is limited to 5 requests/second account-wide and newly written
  records take a few moments to index — don't search for a record you just
  created; use the id from the create response.

## Portal specifics

- The target portal is `$HUBSPOT_PORTAL_ID` — sandbox `49610528` during
  validation, prod `9201667` ("wisekeysa") after cutover. Never assume
  prod; read the env var.
- IcAlps deal pipeline ids are PER-PORTAL: prod `766126206` / stage
  `1116419644` (Identified); sandbox `763145477` / `1113385378` (see
  `ui-extension/docs/ARCHITECTURE.md` §5 in the repo for the full map).
- Custom properties use the `icalps_` prefix.
