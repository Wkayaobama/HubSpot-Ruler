"""Deliver a task to the running Hermes agent.

The harness-facing side is deliberately pluggable because the exact
programmatic entry point depends on the harness build in use (see
docs/SCOPING.md, Q2). Three modes, combinable — inbox is always on:

  inbox  Write a markdown task file into HERMES_INBOX_DIR. Zero coupling,
         survives agent restarts. Pair with a heartbeat/cron skill so the
         agent sweeps its inbox (see skills/inbox-sweep in docs).

  hook   POST {"message": <task text>} to a local HTTP endpoint exposed by
         the harness gateway (HERMES_HOOK_URL, optional bearer token).

  cli    Run a shell command template with placeholders substituted
         (HERMES_CLI_TEMPLATE, e.g. `hermes send --file {task_file}`).
         Placeholders: {task_file} {title}. Substitution is per-argument
         after shlex parsing — task content never touches a shell.
"""

from __future__ import annotations

import json
import re
import shlex
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

from . import config


def _slug(text: str, max_len: int = 48) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len] or "task"


def _write_inbox_file(task_id: str, title: str, body: str, source: str, meta: dict) -> Path:
    inbox = config.HERMES_INBOX_DIR
    inbox.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    path = inbox / f"{stamp}-{task_id}-{_slug(title)}.md"
    frontmatter = {
        "task_id": task_id,
        "source": source,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **{k: v for k, v in meta.items() if v is not None},
    }
    lines = ["---"]
    for key, value in frontmatter.items():
        lines.append(f"{key}: {json.dumps(value) if not isinstance(value, str) else value}")
    lines += ["---", "", f"# {title}", "", body, ""]
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def _post_hook(title: str, body: str, task_file: Path) -> None:
    payload = json.dumps(
        {"message": f"{title}\n\n{body}", "task_file": str(task_file)}
    ).encode("utf-8")
    request = urllib.request.Request(
        config.HERMES_HOOK_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    if config.HERMES_HOOK_TOKEN:
        request.add_header("Authorization", f"Bearer {config.HERMES_HOOK_TOKEN}")
    with urllib.request.urlopen(request, timeout=15) as response:
        response.read()


def _run_cli(title: str, task_file: Path) -> None:
    substitutions = {"{task_file}": str(task_file), "{title}": title}
    args = []
    for arg in shlex.split(config.HERMES_CLI_TEMPLATE):
        for placeholder, value in substitutions.items():
            arg = arg.replace(placeholder, value)
        args.append(arg)
    subprocess.run(args, check=True, timeout=60)


def dispatch_task(
    title: str,
    body: str,
    source: str = "bridge",
    meta: dict | None = None,
) -> str:
    """Deliver a task to the agent. Returns the task id.

    The inbox file is written first and is the durable record; hook/cli are
    best-effort accelerators so the agent picks the task up immediately —
    their failure is logged but never loses the task.
    """
    task_id = uuid.uuid4().hex[:12]
    task_file = _write_inbox_file(task_id, title, body, source, meta or {})

    if config.HERMES_HOOK_URL:
        try:
            _post_hook(title, body, task_file)
        except Exception as exc:  # noqa: BLE001 — inbox file already persisted
            print(f"[dispatch] hook delivery failed ({exc}); task remains in inbox", file=sys.stderr)

    if config.HERMES_CLI_TEMPLATE:
        try:
            _run_cli(title, task_file)
        except Exception as exc:  # noqa: BLE001
            print(f"[dispatch] cli delivery failed ({exc}); task remains in inbox", file=sys.stderr)

    return task_id
