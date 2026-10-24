# Claude Tutor Prototype

A lightweight clone of the Claude web app, used to prototype a learning/education feature. It calls the real Claude API; persistence is mocked with JSON files.

- **Spec:** `PLAN.md` is the source of truth for stack, structure, scope, visual spec, and build order.
- **Tutor feature spec:** `TUTOR-PLAN.md`. Keep Tutor code in `client/src/features/tutor/` and `server/tutor/`; the clone only gets generic extension points.
- **Reference images:** `docs/reference/` (Claude home screenshot, Rosenshine's Principles of Instruction).

## Agents

Delegate to the project subagents in `.claude/agents/`:

- `frontend-engineer`: all building in `client/` and `server/`
- `design-reviewer`: review UI after changes or before user testing
- `user-researcher`: learning-feature flows and tutoring behavior
- `data-scientist`: measuring whether learning happened

## Conventions

- All user-facing copy goes in `client/src/constants/content.ts`.
- Mock data lives in `server/data/*.json`, accessed only through `server/repo/`.
- No new dependencies beyond those listed in `PLAN.md` without asking.
- Don't commit or push without being asked. Don't commit `.claude/skills/`.

## Status

- Done: plan, subagents, repo setup.
- Next: build order step 1 in `PLAN.md` (scaffold).
