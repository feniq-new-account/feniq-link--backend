# AGENTS.md

Instructions for any coding agent working in this repository (OpenCode, Cline,
Codex, Aider, ...). The single source of truth is **`CLAUDE.md`** — read it
first and follow it exactly; it is written for every agent, not only Claude.

In short:

- Replies to the owner are in Arabic (Levantine).
- Before changing a feature, read its row in **`FEATURE_MAP.md`** (screen →
  API → service → model → web panel → tests) and update that row in the same
  commit when files, endpoints or fields move.
- Skills live in **`.claude/skills/<name>/SKILL.md`**. Load the relevant one
  before the task (design: `impeccable`, `frontend-design`; Flutter/Dart:
  `flutter-*`, `dart-*`).
- Run the tests listed in `CLAUDE.md` for every layer you touched before
  committing.
