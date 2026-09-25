#!/usr/bin/env python3
"""hs_api.py — minimal HubSpot CRM CLI for the hubspot-crm skill.

Stdlib-only on purpose: the agent can run it with any python3, no venv.
Auth: HUBSPOT_PRIVATE_APP_TOKEN from the environment.

Commands: get, search, associations, note, task, update.
Run `python3 hs_api.py <command> --help` for flags; SKILL.md has examples.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.hubapi.com"

# HubSpot-defined default association typeIds, engagement -> record.
# Source: developers.hubspot.com CRM associations "association type ID" table.
ASSOCIATION_TYPE_IDS = {
    ("notes", "contact"): 202,
    ("notes", "company"): 190,
    ("notes", "deal"): 214,
    ("tasks", "contact"): 204,
    ("tasks", "company"): 192,
    ("tasks", "deal"): 216,
}

SEARCH_OPERATORS = {
    "EQ", "NEQ", "LT", "LTE", "GT", "GTE",
    "BETWEEN", "IN", "NOT_IN", "HAS_PROPERTY", "NOT_HAS_PROPERTY",
    "CONTAINS_TOKEN", "NOT_CONTAINS_TOKEN",
}


def _token() -> str:
    token = os.environ.get("HUBSPOT_PRIVATE_APP_TOKEN")
    if not token:
        sys.exit("HUBSPOT_PRIVATE_APP_TOKEN is not set in the environment.")
    return token


def _request(method: str, path: str, body: dict | None = None, retry_on_429: bool = True) -> dict:
    url = API + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {_token()}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if exc.code == 429 and retry_on_429:
            print("HTTP 429 — backing off 10s and retrying once", file=sys.stderr)
            time.sleep(10)
            return _request(method, path, body, retry_on_429=False)
        print(f"HTTP {exc.code} {method} {path}\n{detail}", file=sys.stderr)
        sys.exit(1)


def _parse_associations(pairs: list[str], engagement: str) -> list[dict]:
    associations = []
    for pair in pairs:
        try:
            target_type, target_id = pair.split(":", 1)
        except ValueError:
            sys.exit(f"--associate expects <type>:<id>, got '{pair}'")
        type_id = ASSOCIATION_TYPE_IDS.get((engagement, target_type.strip().lower()))
        if type_id is None:
            sys.exit(
                f"No known association typeId for {engagement} -> {target_type}. "
                f"Known targets: contact, company, deal."
            )
        associations.append(
            {
                "to": {"id": target_id.strip()},
                "types": [
                    {"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": type_id}
                ],
            }
        )
    return associations


def cmd_get(args) -> dict:
    query = ""
    if args.properties:
        query = "?" + urllib.parse.urlencode({"properties": args.properties})
    return _request("GET", f"/crm/v3/objects/{args.object}/{args.id}{query}")


def cmd_search(args) -> dict:
    body: dict = {"limit": args.limit}
    if args.query:
        body["query"] = args.query
    if args.properties:
        body["properties"] = args.properties.split(",")
    if args.filter:
        filters = []
        for expression in args.filter:
            parts = expression.split(None, 2)
            if len(parts) < 2 or parts[1].upper() not in SEARCH_OPERATORS:
                sys.exit(
                    f"--filter expects '<property> <OPERATOR> [value]', got '{expression}'. "
                    f"Operators: {', '.join(sorted(SEARCH_OPERATORS))}"
                )
            item = {"propertyName": parts[0], "operator": parts[1].upper()}
            if len(parts) == 3:
                item["value"] = parts[2]
            filters.append(item)
        body["filterGroups"] = [{"filters": filters}]
    return _request("POST", f"/crm/v3/objects/{args.object}/search", body)


def cmd_associations(args) -> dict:
    return _request("GET", f"/crm/v4/objects/{args.object}/{args.id}/associations/{args.to}")


def cmd_note(args) -> dict:
    body = {
        "properties": {
            "hs_note_body": args.body,
            # hs_timestamp: required; unix epoch in MILLISECONDS (UTC).
            "hs_timestamp": str(int(time.time() * 1000)),
        },
        "associations": _parse_associations(args.associate or [], "notes"),
    }
    return _request("POST", "/crm/v3/objects/notes", body)


def cmd_task(args) -> dict:
    due_ms = int((time.time() + args.due_days * 86400) * 1000)
    body = {
        "properties": {
            "hs_task_subject": args.subject,
            "hs_task_body": args.body or "",
            "hs_timestamp": str(due_ms),
            "hs_task_status": "NOT_STARTED",
            "hs_task_type": "TODO",
        },
        "associations": _parse_associations(args.associate or [], "tasks"),
    }
    return _request("POST", "/crm/v3/objects/tasks", body)


def cmd_update(args) -> dict:
    properties = {}
    for assignment in args.set:
        if "=" not in assignment:
            sys.exit(f"--set expects key=value, got '{assignment}'")
        key, value = assignment.split("=", 1)
        properties[key.strip()] = value
    return _request("PATCH", f"/crm/v3/objects/{args.object}/{args.id}", {"properties": properties})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("get", help="fetch one record")
    p.add_argument("--object", required=True, help="deals | contacts | companies | ...")
    p.add_argument("--id", required=True)
    p.add_argument("--properties", help="comma-separated property names")
    p.set_defaults(func=cmd_get)

    p = sub.add_parser("search", help="CRM search")
    p.add_argument("--object", required=True)
    p.add_argument("--query", help="free-text query over default searchable properties")
    p.add_argument("--filter", action="append", help="'<property> <OPERATOR> [value]', repeatable (ANDed)")
    p.add_argument("--properties", help="comma-separated property names to return")
    p.add_argument("--limit", type=int, default=10)
    p.set_defaults(func=cmd_search)

    p = sub.add_parser("associations", help="list a record's associations")
    p.add_argument("--object", required=True)
    p.add_argument("--id", required=True)
    p.add_argument("--to", required=True, help="target object type, e.g. contacts")
    p.set_defaults(func=cmd_associations)

    p = sub.add_parser("note", help="create a Note associated to record(s)")
    p.add_argument("--body", required=True)
    p.add_argument("--associate", action="append", required=True, help="<type>:<id>, e.g. deal:123 (repeatable)")
    p.set_defaults(func=cmd_note)

    p = sub.add_parser("task", help="create a Task associated to record(s)")
    p.add_argument("--subject", required=True)
    p.add_argument("--body")
    p.add_argument("--due-days", type=float, default=1.0, help="due in N days from now")
    p.add_argument("--associate", action="append", required=True, help="<type>:<id> (repeatable)")
    p.set_defaults(func=cmd_task)

    p = sub.add_parser("update", help="update properties on a record")
    p.add_argument("--object", required=True)
    p.add_argument("--id", required=True)
    p.add_argument("--set", action="append", required=True, help="key=value (repeatable)")
    p.set_defaults(func=cmd_update)

    args = parser.parse_args()
    print(json.dumps(args.func(args), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
