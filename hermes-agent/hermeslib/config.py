"""Central env-driven configuration for the Hermes companion stack.

Every value comes from the process environment. The systemd units load
/opt/hermes-stack/.env via EnvironmentFile=, and local runs can rely on
python-dotenv (loaded here when present). Nothing fails at import time —
a missing value only errors when the component that needs it runs.
"""

from __future__ import annotations

import os
from pathlib import Path

try:  # optional: convenience for local/dev runs outside systemd
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass


def _path(name: str, default: str) -> Path:
    return Path(os.environ.get(name, default)).expanduser()


def env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name, default)
    return value if value not in ("", None) else default


def require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Required environment variable {name} is not set. "
            f"Fill it in /opt/hermes-stack/.env (see .env.example)."
        )
    return value


# --- Hermes harness workspace -------------------------------------------------
# Hermes Agent (github.com/NousResearch/hermes-agent) keeps its workspace at
# ~/.hermes (config.yaml, .env, SOUL.md, memories/, skills/, cron/). The
# default matches the guide's root install.
HERMES_HOME = _path("HERMES_HOME", "/root/.hermes")

# Directory the agent sweeps for task drops (inbox dispatch mode).
HERMES_INBOX_DIR = _path("HERMES_INBOX_DIR", str(HERMES_HOME / "inbox"))

# Root of the scraped RevOps knowledge base the agent reads and curates.
KNOWLEDGE_DIR = _path("KNOWLEDGE_DIR", str(HERMES_HOME / "knowledge" / "revops"))

# --- Dispatch (companion -> agent) --------------------------------------------
# Optional local HTTP hook exposed by the harness gateway.
HERMES_HOOK_URL = env("HERMES_HOOK_URL")
HERMES_HOOK_TOKEN = env("HERMES_HOOK_TOKEN")
# Optional CLI template, e.g.: hermes send --profile revops --file {task_file}
HERMES_CLI_TEMPLATE = env("HERMES_CLI_TEMPLATE")

# --- Bridge (HubSpot -> companion) --------------------------------------------
# Shared secret for the custom HMAC scheme used by the workflow custom-code
# action (X-Hermes-Signature). Generate: openssl rand -hex 32
HERMES_WEBHOOK_SECRET = env("HERMES_WEBHOOK_SECRET")
# App client secret, only needed if the native HubSpot webhook action is used
# instead (X-HubSpot-Signature-v3 verification).
HUBSPOT_CLIENT_SECRET = env("HUBSPOT_CLIENT_SECRET")
# Public base URL of the bridge as HubSpot sees it (needed to reconstruct the
# request URI for v3 signature verification behind a reverse proxy).
BRIDGE_PUBLIC_BASE_URL = env("BRIDGE_PUBLIC_BASE_URL")
MAX_BODY_BYTES = int(env("BRIDGE_MAX_BODY_BYTES", "65536") or "65536")

# --- HubSpot (agent -> HubSpot) -----------------------------------------------
HUBSPOT_PRIVATE_APP_TOKEN = env("HUBSPOT_PRIVATE_APP_TOKEN")
HUBSPOT_PORTAL_ID = env("HUBSPOT_PORTAL_ID")

# --- Telegram ingestion (MTProto user session, optional) ----------------------
TELEGRAM_API_ID = env("TELEGRAM_API_ID")
TELEGRAM_API_HASH = env("TELEGRAM_API_HASH")
TELEGRAM_SESSION = env("TELEGRAM_SESSION")  # Telethon StringSession

# --- Scraper paths -------------------------------------------------------------
STACK_ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = _path("SOURCES_FILE", str(STACK_ROOT / "scraper" / "sources.yaml"))
STATE_DIR = _path("STATE_DIR", str(STACK_ROOT / "scraper" / "state"))
