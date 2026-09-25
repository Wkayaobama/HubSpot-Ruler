"""Shared library for the Hermes companion stack (bridge + scraper).

The Hermes harness itself is installed separately via its official
installer (see docs/VPS-SETUP.md). Everything in this package is the
*companion* layer that feeds and triggers the agent:

  hermeslib.config    env-driven settings (loaded from /opt/hermes-stack/.env)
  hermeslib.security  inbound webhook signature verification
  hermeslib.dispatch  hand a task to the running agent (inbox / hook / cli)
"""
