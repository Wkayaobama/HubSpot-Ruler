#!/usr/bin/env python3
"""Generate a Telethon StringSession for the scraper — run this LOCALLY.

Never log in interactively on the VPS: generate the session on your own
machine, then paste the printed string into TELEGRAM_SESSION in the VPS's
/opt/hermes-stack/.env.

Prereqs: pip install telethon, plus api_id/api_hash from
https://my.telegram.org > API development tools.

Usage:
    python3 make_session.py            # prompts for api_id/api_hash/phone/code
"""

from telethon.sessions import StringSession
from telethon.sync import TelegramClient

api_id = int(input("api_id: ").strip())
api_hash = input("api_hash: ").strip()

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print("\nTELEGRAM_SESSION=" + client.session.save())
    print("\nPaste this line into /opt/hermes-stack/.env (and keep it secret —")
    print("it grants full read access to this Telegram account).")
