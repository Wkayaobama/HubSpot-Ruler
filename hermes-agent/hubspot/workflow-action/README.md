# "Trigger Hermes Agent" — projects-platform workflow action (Option B)

A first-class workflow action for the existing 2026.03 private app. Once
promoted, every workflow builder in the portal sees **Trigger Hermes Agent**
in the action picker — no Operations/Data Hub subscription required (unlike
custom code actions, which need Ops Hub Professional+).

The manifest schema matches HubSpot's official 2026.03 example
(`HubSpot/hubspot-project-components` → `workflow-actions`) and the
component docs. `workflow-action` components are explicitly supported for
`distribution: private` + `auth.type: static` apps on 2025.2 and 2026.03.

## How it executes

HubSpot POSTs to `actionUrl` with the native execution payload
(`callbackId`, `origin.portalId`, `object.{objectId,objectType,properties}`,
`inputFields`) signed with **X-HubSpot-Signature v2** (hex SHA-256 of
`clientSecret + method + URI + body`). The bridge already:

- verifies v2 signatures (`hermeslib/security.py`, needs
  `HUBSPOT_CLIENT_SECRET` + `BRIDGE_PUBLIC_BASE_URL` in the stack `.env`),
- recognizes the native payload shape and maps `hermes_action` /
  `hermes_prompt` input fields onto its task templates,
- replies `{"outputFields": {"hs_execution_state": "SUCCESS",
  "hermes_status": "queued", "hermes_task_id": ...}}`.

Failure semantics are HubSpot-managed: 4xx marks the action failed, 5xx is
retried with exponential backoff for up to 3 days, 429 honors Retry-After.

## Why this is staged here instead of living in `ui-extension/`

The IcAlps app is live on prod. Per `ui-extension/docs/ARCHITECTURE.md` §4,
validate/build success does not imply runtime success, and installs gate on
the Distribution tab. Promote deliberately:

1. Set the real `actionUrl` (your bridge domain) in the manifest.
2. Copy it: `cp hermes-trigger-hsmeta.json ../../..../ui-extension/src/app/workflow-actions/`
   (the directory name `workflow-actions` is mandatory).
3. `hs project validate` → `hs project upload` against **sandbox 49610528**.
4. Reauthorize the app install on the Distribution tab if prompted.
5. In a sandbox workflow, add the action, run a test enrollment, confirm the
   bridge logs `via hubspot-v2` and the agent gets the task.
6. Only then repeat upload + install on prod 9201667.

## Open item (from research, flagged before first use)

Where a static-auth 2026.03 projects app surfaces the **client secret** used
for v2 signing is not documented (legacy private apps show it in settings).
Check the app's Auth page after upload. If no secret is surfaced, keep the
action pointed at a bridge URL containing a random capability token path
segment (e.g. `/hooks/hubspot-<random>`), enforce it in Caddy, and rely on
that + TLS while HubSpot support clarifies — do not run the action
unauthenticated.

## Not included (deliberately)

`outputFields` declarations, `executionRules`, `objectRequestOptions` and
`functions` exist in the v4 automation API, but their exact `-hsmeta.json`
encodings are not documented for the projects platform — the bridge's
response outputFields work without declaring them. Add only after a sandbox
validation proves the syntax.
