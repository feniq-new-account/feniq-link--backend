---
name: handoff
description: Write the end-of-session handoff for Feniq Link — one dated line in HANDOFF.md and in My-mind's memory/handoff.md — so the next session (local or cloud) can continue. Use when the owner says "سلّم", "handoff", "خلصنا", or before a long session ends.
disable-model-invocation: true
---

# Session handoff

The owner switches between the laptop and cloud sessions; each new session
starts from these notes.

1. Collect the facts from this session: what was finished (commits, PR numbers),
   what was tested and the exact results, what was NOT done or not verified, and
   the single next step. Only things you actually did or saw.
2. **This repo:** add a dated entry at the top of the "الجاية"/latest section of
   `HANDOFF.md` (match the existing format there). Commit with the branch's
   normal workflow.
3. **My-mind:** add one line at the top of the list in `memory/handoff.md` of
   `feniq-new-account/My-mind`, format:
   `- YYYY-MM-DD · كلاود/لوكال · فينيق — خلصنا … / ما انعمل … / الخطوة الجاية …`
   If a decision is durable, also add a dated line to `memory/decisions.md`.
   My-mind is a memory repo: commit on `main`,
   `git pull --rebase origin main && git push origin main`.
   If My-mind isn't in this session, say so and print the line for the owner.
4. Never write passwords, keys or connection strings.

Reply with the line you wrote and the next step, nothing else.
