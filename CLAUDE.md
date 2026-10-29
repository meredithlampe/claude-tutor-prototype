# Claude Tutor Prototype

A lightweight clone of the Claude web app, used to prototype a learning/education feature. It calls the real Claude API; persistence is mocked with JSON files.

- **Spec:** `PLAN.md` is the source of truth for stack, structure, scope, visual spec, and build order.
- **Tutor feature spec:** `TUTOR-PLAN.md`. Keep Tutor code in `client/src/features/tutor/` and `server/tutor/`; the clone only gets generic extension points.
- **Reference images:** `docs/reference/` (Claude home screenshot, Rosenshine's Principles of Instruction).

## Agents

Delegate to the project subagents in `.claude/agents/`:

- `frontend-engineer`: all building in `client/` and `server/`
- `design-reviewer`: review UI after changes or before user testing
- `code-reviewer`: review code and architecture after a feature lands or before a larger commit
- `user-researcher`: learning-feature flows and tutoring behavior
- `data-scientist`: measuring whether learning happened

## Conventions

- All user-facing copy goes in `client/src/constants/content.ts`. Tutor copy goes in `client/src/features/tutor/content.ts` or the topic files.
- Mock data lives in `server/data/*.json`, accessed only through `server/repo/`.
- No new dependencies beyond those listed in `PLAN.md` without asking.
- Don't commit or push without being asked. Don't commit `.claude/skills/`.

## Status

- Done: the clone (`PLAN.md` steps 1–5); Tutor build steps 1–8 plus user-test feedback (offer, workbook and chat, visuals, wrap-up, exit/resume, ElevenLabs voice, intro dialog, debug menu); Render deploy (`render.yaml`, auto-deploys from `main`).
- Next: Tutor step 9 (event log per `TUTOR-MEASUREMENT.md`, delayed check, Form C items), then step 10 (user-researcher and design-reviewer reviews).
- Open:
  - Practice visuals can give away the answer (e.g. "40 real + 60 false" above "what share has it?"). The proposed fix: visuals show the setup and leave the last step to the learner. Not yet approved.
  - Keyboard focus drops to the page body while the workbook builds the next item.
  - The topic citations in `server/tutor/topics/` need checking against the sources.
  - Voice: still to test with a real mic in Safari and Firefox, along with real-mic timing for the countdown.
- Gotchas:
  - Never put `DATA_DIR` or `SITE_PASSWORD` in local `.env`. They're Render-only, and `DATA_DIR=/var/data` crashes the local server.
  - Agents testing voice use a fake mic/recognizer and muted audio, never real devices.
  - All participants share one user. Use Debug menu > Clear all chats between participants; it archives sessions and doesn't delete them.
