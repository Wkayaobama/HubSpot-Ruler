"""Inbound webhook signature verification.

Two schemes, selected by which header the caller sends:

1. X-Hermes-Signature — our own shared-secret HMAC, used by the HubSpot
   workflow *custom-code* action (hubspot/workflow-custom-code/hermesTrigger.js).
   signature = hex(HMAC_SHA256(secret, "<timestamp>.<raw_body>"))
   with X-Hermes-Timestamp carrying a unix-milliseconds timestamp.

2. X-HubSpot-Signature with X-HubSpot-Signature-Version: v2 — sent by
   projects-platform *workflow-action* components (actionUrl POSTs) and by
   the "Send a webhook" action when "include request signature" is enabled:
   signature = hex(SHA256(client_secret + method + request_uri + raw_body))
   Plain SHA-256 over the concatenation (not HMAC), no timestamp header.

3. X-HubSpot-Signature-v3 — HubSpot's native request signing (app
   webhooks):
   signature = base64(HMAC_SHA256(client_secret,
                  request_method + request_uri + request_body + timestamp))
   with X-HubSpot-Request-Timestamp in unix milliseconds and a 5-minute
   replay window.

For both HubSpot schemes the URI must be the exact public URL HubSpot
called — behind a reverse proxy, reconstruct it from BRIDGE_PUBLIC_BASE_URL.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

REPLAY_WINDOW_MS = 5 * 60 * 1000


class SignatureError(Exception):
    """Raised when a request fails authentication. Message is safe to return."""


def _check_timestamp(timestamp: str) -> int:
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        raise SignatureError("missing or malformed timestamp header")
    now_ms = int(time.time() * 1000)
    if abs(now_ms - ts) > REPLAY_WINDOW_MS:
        raise SignatureError("timestamp outside the 5-minute replay window")
    return ts


def verify_hermes_signature(secret: str, timestamp: str, raw_body: bytes, signature: str) -> None:
    """Verify our shared-secret scheme. Raises SignatureError on failure."""
    if not secret:
        raise SignatureError("bridge is not configured with HERMES_WEBHOOK_SECRET")
    _check_timestamp(timestamp)
    message = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    provided = (signature or "").removeprefix("sha256=").strip()
    if not hmac.compare_digest(expected, provided):
        raise SignatureError("invalid X-Hermes-Signature")


def verify_hubspot_v2(
    client_secret: str,
    method: str,
    request_uri: str,
    raw_body: bytes,
    signature: str,
) -> None:
    """Verify HubSpot's Signature v2 (workflow-action / webhook-action posts).

    v2 is a plain SHA-256 hex digest of client_secret + method + URI + body —
    no timestamp, so no replay window; keep the endpoint idempotent.
    Raises SignatureError on failure.
    """
    if not client_secret:
        raise SignatureError("bridge is not configured with HUBSPOT_CLIENT_SECRET")
    message = (
        client_secret.encode("utf-8")
        + method.upper().encode("utf-8")
        + request_uri.encode("utf-8")
        + raw_body
    )
    expected = hashlib.sha256(message).hexdigest()
    if not hmac.compare_digest(expected, (signature or "").strip()):
        raise SignatureError("invalid X-HubSpot-Signature (v2)")


def verify_hubspot_v3(
    client_secret: str,
    method: str,
    request_uri: str,
    raw_body: bytes,
    timestamp: str,
    signature: str,
) -> None:
    """Verify HubSpot's X-HubSpot-Signature-v3. Raises SignatureError on failure."""
    if not client_secret:
        raise SignatureError("bridge is not configured with HUBSPOT_CLIENT_SECRET")
    _check_timestamp(timestamp)
    message = (
        method.upper().encode("utf-8")
        + request_uri.encode("utf-8")
        + raw_body
        + timestamp.encode("utf-8")
    )
    digest = hmac.new(client_secret.encode("utf-8"), message, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    if not hmac.compare_digest(expected, (signature or "").strip()):
        raise SignatureError("invalid X-HubSpot-Signature-v3")
