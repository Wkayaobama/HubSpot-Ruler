"""Hermes Bridge — the VPS-side HTTPS entry point HubSpot workflows call.

Runs as a systemd service (provision/systemd/hermes-bridge.service) bound to
127.0.0.1:8787 behind a TLS reverse proxy (provision/Caddyfile).

Flow: HubSpot workflow (custom-code action or native webhook action)
  → POST /hooks/hubspot with a signed payload
  → signature verified (hermeslib.security)
  → payload mapped to a task template
  → hermeslib.dispatch hands the task to the running Hermes agent
  → the agent acts on HubSpot via its hubspot-crm skill and writes the
    result back to the record as a Note.

Payload contract (JSON body sent by the workflow action):
  {
    "action":     "deal_review" | "contact_enrich" | "company_brief"
                  | "revops_digest" | "custom",
    "objectType": "deal" | "contact" | "company" | ...,   # optional for revops_digest
    "objectId":   "123456789",                            # optional for revops_digest
    "portalId":   "9201667",
    "prompt":     "free-form instruction",                # required for action=custom
    "inputFields": { ... }                                # optional extra context
  }
"""

from __future__ import annotations

import json
import logging

from fastapi import FastAPI, Request, Response

from hermeslib import config
from hermeslib.dispatch import dispatch_task
from hermeslib.security import (
    SignatureError,
    verify_hermes_signature,
    verify_hubspot_v2,
    verify_hubspot_v3,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("hermes-bridge")

app = FastAPI(title="Hermes Bridge", docs_url=None, redoc_url=None, openapi_url=None)

# Task templates: what the agent is told to do for each workflow action.
# {objectType}/{objectId}/{portalId}/{prompt}/{context} are substituted.
# Every template routes HubSpot work through the hubspot-crm skill and makes
# the write-back channel (a Note on the record) explicit.
TASK_TEMPLATES: dict[str, str] = {
    "deal_review": (
        "A HubSpot workflow asked for a deal review.\n"
        "Use the hubspot-crm skill. Deal id: {objectId} (portal {portalId}).\n"
        "1. Fetch the deal, its associated contacts and company.\n"
        "2. Assess pipeline health: stage vs age, close date realism, missing "
        "next steps, data-quality gaps.\n"
        "3. Cross-check against the latest patterns in the RevOps knowledge "
        "base (knowledge/revops/patterns.md) for applicable plays.\n"
        "4. Write your assessment back to the deal as a Note (<= 300 words, "
        "actionable bullets first).\n"
        "Extra context from the workflow: {context}"
    ),
    "contact_enrich": (
        "A HubSpot workflow asked for contact enrichment.\n"
        "Use the hubspot-crm skill. Contact id: {objectId} (portal {portalId}).\n"
        "1. Fetch the contact and associated company.\n"
        "2. Research public sources for role, company signals and relevant "
        "RevOps context.\n"
        "3. Write findings back as a Note on the contact; if a concrete "
        "follow-up is warranted, create a Task and associate it.\n"
        "Extra context from the workflow: {context}"
    ),
    "company_brief": (
        "A HubSpot workflow asked for a company brief.\n"
        "Use the hubspot-crm skill. Company id: {objectId} (portal {portalId}).\n"
        "1. Fetch the company, open deals and key contacts.\n"
        "2. Produce a one-page brief: what they do, engagement summary, open "
        "pipeline, suggested next plays from the RevOps pattern library.\n"
        "3. Write the brief back as a Note on the company.\n"
        "Extra context from the workflow: {context}"
    ),
    "revops_digest": (
        "A HubSpot workflow requested a RevOps digest run.\n"
        "Run the revops-radar skill now: process the knowledge inbox, update "
        "patterns, and send the owner a Telegram digest.\n"
        "Extra context from the workflow: {context}"
    ),
    "custom": (
        "A HubSpot workflow sent a custom instruction. Object: {objectType} "
        "{objectId} (portal {portalId}). Use the hubspot-crm skill for any "
        "HubSpot reads/writes, and write results back to the record as a Note "
        "unless instructed otherwise.\n"
        "Instruction: {prompt}\n"
        "Extra context from the workflow: {context}"
    ),
}


def _public_uri(request: Request) -> str:
    base = (config.BRIDGE_PUBLIC_BASE_URL or "").rstrip("/")
    if not base:
        raise SignatureError(
            "BRIDGE_PUBLIC_BASE_URL must be set to verify HubSpot signatures"
        )
    uri = base + request.url.path
    if request.url.query:
        uri += "?" + request.url.query
    return uri


def _authenticate(request: Request, raw_body: bytes) -> str:
    """Verify the request signature. Returns the scheme used."""
    headers = request.headers
    if headers.get("x-hermes-signature"):
        verify_hermes_signature(
            config.HERMES_WEBHOOK_SECRET or "",
            headers.get("x-hermes-timestamp", ""),
            raw_body,
            headers["x-hermes-signature"],
        )
        return "hermes-hmac"
    if headers.get("x-hubspot-signature-v3"):
        verify_hubspot_v3(
            config.HUBSPOT_CLIENT_SECRET or "",
            request.method,
            _public_uri(request),
            raw_body,
            headers.get("x-hubspot-request-timestamp", ""),
            headers["x-hubspot-signature-v3"],
        )
        return "hubspot-v3"
    if headers.get("x-hubspot-signature"):
        # workflow-action actionUrl posts and "Send a webhook" signed posts
        # use v2 (X-HubSpot-Signature-Version header; only v2 is accepted).
        version = headers.get("x-hubspot-signature-version", "v2").lower()
        if version != "v2":
            raise SignatureError(f"unsupported X-HubSpot-Signature-Version '{version}'")
        verify_hubspot_v2(
            config.HUBSPOT_CLIENT_SECRET or "",
            request.method,
            _public_uri(request),
            raw_body,
            headers["x-hubspot-signature"],
        )
        return "hubspot-v2"
    raise SignatureError("no recognized signature header present")


def _normalize_payload(payload: dict) -> tuple[dict, bool]:
    """Accept both our custom payload and HubSpot's native workflow-action
    execution payload ({callbackId, origin, context, object, inputFields}).

    For workflow-action posts, the action/prompt come from the action's
    input fields (hermes_action / hermes_prompt — see
    hubspot/workflow-action/README.md). Returns (payload, is_workflow_action).
    """
    if "callbackId" not in payload or "object" not in payload:
        return payload, False
    record = payload.get("object") or {}
    origin = payload.get("origin") or {}
    fields = dict(payload.get("inputFields") or {})
    return (
        {
            "action": fields.pop("hermes_action", None) or "custom",
            "objectType": str(record.get("objectType", "")).lower() or "unknown",
            "objectId": record.get("objectId"),
            "portalId": origin.get("portalId"),
            "prompt": fields.pop("hermes_prompt", ""),
            "inputFields": fields,
        },
        True,
    )


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True, "service": "hermes-bridge"}


@app.post("/hooks/hubspot")
async def hubspot_hook(request: Request, response: Response) -> dict:
    raw_body = await request.body()
    if len(raw_body) > config.MAX_BODY_BYTES:
        response.status_code = 413
        return {"status": "error", "message": "payload too large"}

    try:
        scheme = _authenticate(request, raw_body)
    except SignatureError as exc:
        log.warning("rejected request: %s", exc)
        response.status_code = 401
        return {"status": "error", "message": str(exc)}

    try:
        payload = json.loads(raw_body.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("body must be a JSON object")
    except (ValueError, UnicodeDecodeError) as exc:
        response.status_code = 400
        return {"status": "error", "message": f"invalid JSON body: {exc}"}

    payload, is_workflow_action = _normalize_payload(payload)
    action = str(payload.get("action") or "custom")
    template = TASK_TEMPLATES.get(action)
    if template is None:
        response.status_code = 400
        return {
            "status": "error",
            "message": f"unknown action '{action}'",
            "allowedActions": sorted(TASK_TEMPLATES),
        }
    if action == "custom" and not payload.get("prompt"):
        response.status_code = 400
        return {"status": "error", "message": "action 'custom' requires a 'prompt' field"}

    context_fields = payload.get("inputFields") or {}
    body = template.format(
        objectType=payload.get("objectType", "unknown"),
        objectId=payload.get("objectId", "unknown"),
        portalId=payload.get("portalId", config.HUBSPOT_PORTAL_ID or "unknown"),
        prompt=str(payload.get("prompt", "")),
        context=json.dumps(context_fields, ensure_ascii=False) if context_fields else "none",
    )

    task_id = dispatch_task(
        title=f"HubSpot {action} — {payload.get('objectType', '')} {payload.get('objectId', '')}".strip(),
        body=body,
        source="hubspot-workflow",
        meta={
            "action": action,
            "objectType": payload.get("objectType"),
            "objectId": payload.get("objectId"),
            "portalId": payload.get("portalId"),
            "auth_scheme": scheme,
        },
    )
    log.info("queued task %s action=%s object=%s/%s via %s",
             task_id, action, payload.get("objectType"), payload.get("objectId"), scheme)
    if is_workflow_action:
        # Workflow-action response contract: 2xx marks the action executed;
        # outputFields flow back into the workflow for later branches.
        return {
            "outputFields": {
                "hs_execution_state": "SUCCESS",
                "hermes_status": "queued",
                "hermes_task_id": task_id,
            }
        }
    return {"status": "queued", "taskId": task_id, "action": action}
