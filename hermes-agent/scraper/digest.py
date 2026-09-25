"""Normalize scraped items into the agent's knowledge inbox.

Each kept item becomes one markdown file under KNOWLEDGE_DIR/inbox/ with YAML
frontmatter the agent's revops-radar skill relies on (source_url, channel,
tags, score). Dedupe is content-hash based and persists across runs in
STATE_DIR/seen_hashes.json.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

from hermeslib import config


@dataclass
class Item:
    channel: str
    message_id: int
    text: str
    date: str  # ISO8601
    url: str
    tags: list[str] = field(default_factory=list)
    score: int = 0


def _seen_file() -> Path:
    config.STATE_DIR.mkdir(parents=True, exist_ok=True)
    return config.STATE_DIR / "seen_hashes.json"


def _load_seen() -> set[str]:
    path = _seen_file()
    if path.exists():
        return set(json.loads(path.read_text(encoding="utf-8")))
    return set()


def _save_seen(seen: set[str]) -> None:
    # Keep the registry bounded; old items age out harmlessly because the
    # scraper also tracks per-channel min message ids.
    _seen_file().write_text(json.dumps(sorted(seen)[-20000:]), encoding="utf-8")


def _content_hash(item: Item) -> str:
    normalized = re.sub(r"\s+", " ", item.text.strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]


def score_item(text: str, topics: dict[str, list[str]]) -> tuple[int, list[str]]:
    """Count keyword hits per topic; returns (total hits, matched topic names)."""
    lowered = text.lower()
    matched: list[str] = []
    total = 0
    for topic, keywords in topics.items():
        hits = sum(1 for kw in keywords if kw.lower() in lowered)
        if hits:
            matched.append(topic)
            total += hits
    return total, matched


def write_items(items: list[Item]) -> int:
    """Write new (unseen) items into the knowledge inbox. Returns count written."""
    inbox = config.KNOWLEDGE_DIR / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    seen = _load_seen()
    written = 0

    for item in items:
        digest = _content_hash(item)
        if digest in seen or not item.text.strip():
            continue
        seen.add(digest)

        day = (item.date or time.strftime("%Y-%m-%d"))[:10]
        path = inbox / f"{day}-{item.channel}-{item.message_id}.md"
        frontmatter = "\n".join(
            [
                "---",
                f"source: telegram/{item.channel}",
                f"source_url: {item.url}",
                f"message_id: {item.message_id}",
                f"date: {item.date}",
                f"fetched_at: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}",
                f"tags: [{', '.join(item.tags)}]",
                f"score: {item.score}",
                "---",
            ]
        )
        path.write_text(f"{frontmatter}\n\n{item.text.strip()}\n", encoding="utf-8")
        written += 1

    _save_seen(seen)
    return written
