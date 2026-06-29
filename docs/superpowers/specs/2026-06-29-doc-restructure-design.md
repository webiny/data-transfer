# Documentation restructure

Split AGENTS.md (440 lines) and README.md (652 lines) into focused, linked documents.

## Goals

- AGENTS.md stays navigable (~120-150 lines) — same 9-section structure, heavy sections become 2-3 line summaries with links to detail files.
- README.md becomes a hub page (~80-100 lines) — intro, quick start, built-in presets, documentation index.
- Detail content lives in focused files under `docs/`. Existing docs absorb overlapping content rather than creating duplicates.

## AGENTS.md — section-by-section plan

| # | Section | Action |
|---|---------|--------|
| 0 | Code navigation | Keep as-is (3 lines) |
| 1 | Project at a glance | Keep as-is (~30 lines) |
| 2 | Public API surface | Extract to `docs/public-api.md` |
| 3 | Project structure | Extract to `docs/project-structure.md` |
| 4 | Architecture patterns | Extract to `docs/architecture.md`; cross-link `docs/webiny-di-guide.md` for DI |
| 5 | Testing | Extract to `docs/testing.md` |
| 6 | Hard-won decisions | Extract to `docs/hard-won-decisions.md` |
| 7 | Open work | Keep as-is (~15 lines) |
| 8 | Commands | Agent-specific verification commands fold into `docs/testing.md`; user-facing commands stay in README quick start |
| 9 | Memory files | Keep as-is (~10 lines) |

Each extracted section gets a 2-3 line summary in AGENTS.md + a link to the full file.

## README.md — hub + spoke

README keeps: package description, use cases, quick start (`yarn transfer` walkthrough), built-in presets table, documentation index, license.

Extracted spokes:

| Content | Destination |
|---------|-------------|
| Config reference (env helpers, credentials, IAM, modelsDir, tuning, debug) | `docs/guides/config-reference.md` |
| Writing presets (shape, builder API, filters, multi-pipeline, zero-transformer) | `docs/guides/writing-presets.md` |
| Writing transformers (factories, context types, processor slices, built-ins) | `docs/guides/writing-transformers.md` |
| Pipeline runtime semantics (merge groups, first-match-wins, unmatched, hooks) | `docs/guides/pipeline-runtime.md` |
| Extending presets + Custom DI (setup.ts) | Merge into existing `docs/guides/pipeline-customizer.md` |
| Troubleshooting | `docs/guides/troubleshooting.md` |

## File inventory

New files (7):
- `docs/public-api.md`
- `docs/project-structure.md`
- `docs/architecture.md`
- `docs/testing.md`
- `docs/hard-won-decisions.md`
- `docs/guides/config-reference.md`
- `docs/guides/writing-presets.md`
- `docs/guides/writing-transformers.md`
- `docs/guides/pipeline-runtime.md`
- `docs/guides/troubleshooting.md`

Updated files (3):
- `AGENTS.md` — slim down
- `README.md` — slim down
- `docs/guides/pipeline-customizer.md` — absorb setup.ts + extending presets sections

Untouched:
- `CLAUDE.md`, `SECURITY.md`, `documentation/` subtree, `templates/` subtree, `docs/superpowers/` (plans/specs), `docs/webiny-di-guide.md`, `docs/aws-transfer-setup.md`, `docs/ddb-es-migration-reference.md`, `docs/pino-logger-implementation.md`, `docs/design/generic-pipeline-framework.md`.

## Constraints

- No content loss — every line from the original AGENTS.md and README.md must land somewhere (extracted file, or kept inline).
- Links between docs use relative paths.
- AGENTS.md section 8 verification commands (the `yarn format:fix` / `yarn ts-check` / etc. block) move to `docs/testing.md` since that's where agents look before committing.
- Existing `docs/guides/pipeline-customizer.md` already has detailed customizer usage; the README's "Extending built-in presets" and "Custom DI — setup.ts" sections fold in without duplicating what's already there.
