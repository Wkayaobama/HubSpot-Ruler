"""Telegram ingestion for the RevOps radar.

Fetches recent posts from the public channels listed in sources.yaml,
filters them against topic keywords, writes new items into the agent's
knowledge inbox (digest.py), and dispatches a "process the inbox" task to
the agent so skills/patterns auto-update.

Two fetch modes (sources.yaml `mode`, default `auto`):

  mtproto  Telethon user session (TELEGRAM_API_ID/HASH/SESSION in .env).
           Full history access with per-channel incremental fetch (min_id).
           A Telegram *bot* token cannot read channels it is not in — that
           is why this uses a user session, kept separate from the agent's
           BotFather gateway bot.

  web      Zero-auth fallback: parse the public t.me/s/<channel> preview
           page (roughly the last 20 posts). Works day one with no
           credentials; some channels disable the preview.

Run:  python -m scraper.scrape_telegram          (systemd timer does this)
      python -m scraper.scrape_telegram --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

import httpx
import yaml

from hermeslib import config
from hermeslib.dispatch import dispatch_task
from scraper.digest import Item, score_item, write_items

TME_PREVIEW_URL = "https://t.me/s/{username}"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) HermesRadar/0.1"


# --- state ---------------------------------------------------------------------

def _state_file() -> Path:
    config.STATE_DIR.mkdir(parents=True, exist_ok=True)
    return config.STATE_DIR / "telegram_state.json"


def load_state() -> dict:
    path = _state_file()
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def save_state(state: dict) -> None:
    _state_file().write_text(json.dumps(state, indent=2), encoding="utf-8")


# --- web preview mode (no credentials) ------------------------------------------

def fetch_web_preview(username: str, min_id: int) -> list[Item]:
    """Parse the last ~20 posts from the public t.me/s/ preview page."""
    from bs4 import BeautifulSoup  # deferred: only needed in web mode

    url = TME_PREVIEW_URL.format(username=username)
    response = httpx.get(
        url, headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True
    )
    if response.status_code != 200 or "tgme_widget_message" not in response.text:
        print(f"[scraper] t.me/s preview unavailable for @{username} "
              f"(status {response.status_code}); channel may have previews disabled")
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    items: list[Item] = []
    for widget in soup.select(".tgme_widget_message"):
        post_ref = widget.get("data-post", "")  # e.g. "channel/1234"
        match = re.search(r"/(\d+)$", post_ref)
        if not match:
            continue
        message_id = int(match.group(1))
        if message_id <= min_id:
            continue
        text_node = widget.select_one(".tgme_widget_message_text")
        text = text_node.get_text("\n", strip=True) if text_node else ""
        time_node = widget.select_one("time[datetime]")
        date = time_node["datetime"] if time_node else ""
        items.append(
            Item(
                channel=username,
                message_id=message_id,
                text=text,
                date=str(date),
                url=f"https://t.me/{post_ref}",
            )
        )
    return items


# --- MTProto mode (Telethon user session) ----------------------------------------

async def _fetch_mtproto_channel(client, username: str, min_id: int, limit: int) -> list[Item]:
    items: list[Item] = []
    async for message in client.iter_messages(username, limit=limit, min_id=min_id):
        if not message.text:
            continue
        items.append(
            Item(
                channel=username,
                message_id=message.id,
                text=message.text,
                date=message.date.strftime("%Y-%m-%dT%H:%M:%SZ") if message.date else "",
                url=f"https://t.me/{username}/{message.id}",
            )
        )
    return items


async def fetch_mtproto(channels: list[dict], state: dict, limit: int) -> dict[str, list[Item]]:
    from telethon import TelegramClient, errors
    from telethon.sessions import StringSession

    client = TelegramClient(
        StringSession(config.TELEGRAM_SESSION),
        int(config.TELEGRAM_API_ID),
        config.TELEGRAM_API_HASH,
    )
    results: dict[str, list[Item]] = {}
    async with client:
        for channel in channels:
            username = channel["username"]
            min_id = int(state.get(username, {}).get("last_id", 0))
            try:
                results[username] = await _fetch_mtproto_channel(client, username, min_id, limit)
            except errors.FloodWaitError as exc:
                # Respect Telegram's requested wait; skip the rest of this run
                # rather than hammering — the timer will catch up next cycle.
                print(f"[scraper] FloodWait {exc.seconds}s on @{username}; stopping this run")
                break
            except Exception as exc:  # noqa: BLE001 — one bad channel must not kill the run
                print(f"[scraper] failed @{username}: {exc}", file=sys.stderr)
    return results


# --- main ------------------------------------------------------------------------

def resolve_mode(configured: str) -> str:
    if configured == "auto":
        has_session = all(
            (config.TELEGRAM_API_ID, config.TELEGRAM_API_HASH, config.TELEGRAM_SESSION)
        )
        return "mtproto" if has_session else "web"
    return configured


def run(dry_run: bool = False) -> int:
    sources = yaml.safe_load(config.SOURCES_FILE.read_text(encoding="utf-8"))
    channels = sources.get("channels") or []
    topics = sources.get("topics") or {}
    min_score = int(sources.get("min_score", 1))
    limit = int(sources.get("fetch_limit", 30))
    mode = resolve_mode(str(sources.get("mode", "auto")))
    channel_tags = {c["username"]: c.get("tags", []) for c in channels}

    state = load_state()
    print(f"[scraper] mode={mode} channels={len(channels)}")

    if mode == "mtproto":
        per_channel = asyncio.run(fetch_mtproto(channels, state, limit))
    else:
        per_channel = {
            c["username"]: fetch_web_preview(
                c["username"], int(state.get(c["username"], {}).get("last_id", 0))
            )
            for c in channels
        }

    kept: list[Item] = []
    for username, items in per_channel.items():
        for item in items:
            item.score, matched_topics = score_item(item.text, topics)
            item.tags = sorted(set(channel_tags.get(username, [])) | set(matched_topics))
            if item.score >= min_score:
                kept.append(item)
        if items:
            newest = max(i.message_id for i in items)
            state.setdefault(username, {})["last_id"] = max(
                newest, int(state.get(username, {}).get("last_id", 0))
            )

    total_fetched = sum(len(v) for v in per_channel.values())
    print(f"[scraper] fetched={total_fetched} kept-after-scoring={len(kept)}")

    if dry_run:
        for item in kept:
            print(f"  @{item.channel}/{item.message_id} score={item.score} tags={item.tags}")
        return 0

    written = write_items(kept)
    save_state(state)
    print(f"[scraper] wrote {written} new items to {config.KNOWLEDGE_DIR / 'inbox'}")

    if written:
        dispatch_task(
            title=f"RevOps radar: {written} new items to digest",
            body=(
                f"The Telegram scraper just added {written} new items to the "
                f"knowledge inbox ({config.KNOWLEDGE_DIR / 'inbox'}).\n"
                "Run the revops-radar skill now: digest the inbox, update "
                "patterns.md, create/refresh skills for reusable how-tos, and "
                "send the owner a short Telegram digest."
            ),
            source="scraper",
            meta={"new_items": written, "mode": mode},
        )
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="fetch and score, write nothing")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
