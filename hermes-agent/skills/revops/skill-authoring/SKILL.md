---
name: skill-authoring
description: The self-improvement loop — after solving a novel task, capture the repeatable how-to as a new or updated skill file.
version: 0.1.0
metadata:
  hermes:
    category: revops
    tags: [meta, self-improvement]
---

# Skill Authoring

The core Hermes premise (guide §1): solve → write a skill → know it next
time. Invoke this after solving any task that took real figuring-out, or
when revops-radar identifies a reusable how-to.

## When to write a skill

Write one when ALL are true:
- The task will plausibly recur (or a variant will).
- The solution has non-obvious steps worth memorizing.
- No existing skill covers it (check the skills directory first — prefer
  updating an existing skill over creating a near-duplicate).

## Format

One directory per skill in the harness skills folder, containing `SKILL.md`:

```markdown
---
name: kebab-case-name
description: One sentence — what it does and when to use it (this line is how you will find it later).
---

# Title

## When to use
Trigger phrases / situations.

## Procedure
Numbered, concrete steps. Include exact commands, endpoints, file paths.

## Guardrails
What must never happen; failure modes already hit once.
```

Helper scripts live next to the SKILL.md and are referenced with relative
paths. Keep secrets OUT of skills — reference environment variable names
instead.

## After writing

1. Re-read the skill as if cold: could future-you execute it without the
   current context? Fix gaps now.
2. Note the new/updated skill in memory (name + one-liner).
3. Tell the owner in one line when the skill came from a scraped pattern
   (so the auto-update loop stays visible).
