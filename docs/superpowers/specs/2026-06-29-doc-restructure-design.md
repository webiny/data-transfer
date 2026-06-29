# Documentation restructure

Split AGENTS.md (440 lines) and README.md (652 lines) into focused, linked documents.

## Goals

- AGENTS.md stays navigable (~120-150 lines) — same 9-section structure, heavy sections become 2-3 line summaries with links to detail files.
- README.md becomes a hub page (~100-150 lines) — intro, quick start, built-in presets, documentation index.
- Detail content lives in focused files under `docs/`. Existing docs absorb overlapping content rather than creating duplicates.

## AGENTS.md — section-by-section plan

| # | Section | Action |
|---|---------|--------|
| 0 | Code navigation | Keep as-is (3 lines) |
| 1 | Project at a glance | Keep as-is (~30 lines) |
| 2 | Public API surface | Extract to `docs/public-api.md`. The agent-facing rule ("what belongs in `src/index.ts`") stays in the AGENTS.md summary — it's agent guidance, not reference content. |
| 3 | Project structure | Extract to `docs/project-structure.md` |
| 4 | Architecture patterns | Extract to `docs/architecture.md`. `architecture.md` links OUT to `docs/webiny-di-guide.md` for DI details; the DI guide itself is not modified. |
| 5 | Testing | Extract to `docs/testing.md` |
| 6 | Hard-won decisions | Extract to `docs/hard-won-decisions.md` |
| 7 | Open work | Keep as-is (~15 lines) |
| 8 | Commands | Extract ALL commands to `docs/guides/commands.md` (wizard flow, `--config` direct run, `init`, `init-project`, `--segments`, JSON file formats). Agent-specific verification commands (`yarn format:fix` / `yarn ts-check` / etc.) fold into `docs/testing.md`. AGENTS.md summary links to both files. README quick start keeps only the minimal `yarn install && yarn transfer` snippet and links to `docs/guides/commands.md` for the full reference. |
| 9 | Memory files | Keep as-is (~10 lines) |

Each extracted section gets a 2-3 line summary in AGENTS.md + a link to the full file. Agent-facing rules (e.g. "what belongs in the public API", "don't reintroduce X") stay in the AGENTS.md summary lines — the linked files hold the reference detail.

## README.md — hub + spoke

README keeps: package description, use cases, quick start (install + `yarn transfer` — minimal, ~20 lines), built-in presets table, documentation index with links to all guide pages, license.

The quick start is trimmed to the essentials: clone, install, `yarn transfer`, one-paragraph wizard description. All detailed command documentation (wizard behavior, `--config`, `--segments`, `init-project`, JSON file formats, `.env` population) moves to `docs/guides/commands.md`.

Extracted spokes:

| Content | Destination |
|---------|-------------|
| Config reference (env helpers, credentials, IAM, modelsDir, tuning, debug) | `docs/guides/config-reference.md` |
| Writing presets (shape, builder API, filters, multi-pipeline, zero-transformer) | `docs/guides/writing-presets.md` |
| Writing transformers (factories, context types, processor slices, built-ins) | `docs/guides/writing-transformers.md` |
| Pipeline runtime semantics (entire section extracted) | `docs/guides/pipeline-runtime.md` |
| Extending presets + Custom DI (setup.ts) | Merge into existing `docs/guides/pipeline-customizer.md` (see merge rules below) |
| Commands (wizard, direct run, init, init-project, segments, JSON formats) | `docs/guides/commands.md` |
| Troubleshooting | `docs/guides/troubleshooting.md` |

## Merge rules for `docs/guides/pipeline-customizer.md`

The existing guide already covers PipelineCustomizer usage in detail. Resolution:

1. Compare the README's "Extending built-in presets" section and "Custom DI — setup.ts" section against the existing guide content.
2. **Discard duplicates** — if the README says the same thing the guide already says, drop the README version.
3. **Merge additions** — if the README has content the guide lacks (e.g. the `ctx.blackhole()` usage example, the "unmatched warning" note), add it to the appropriate section of the guide.
4. **Verify completeness** — before removing the README sections, confirm the guide contains or has absorbed every bullet point and code example from each README section. Walk through each README paragraph and check it has a home.
5. **README keeps only a pointer** — 2-3 line summary + link to `docs/guides/pipeline-customizer.md`. No inline examples.

"No content loss" means every *piece of information* lands somewhere. Duplicate prose that restates existing guide content is not information loss when discarded.

## File inventory

New files (11):
- `docs/public-api.md`
- `docs/project-structure.md`
- `docs/architecture.md`
- `docs/testing.md`
- `docs/hard-won-decisions.md`
- `docs/guides/config-reference.md`
- `docs/guides/writing-presets.md`
- `docs/guides/writing-transformers.md`
- `docs/guides/pipeline-runtime.md`
- `docs/guides/commands.md`
- `docs/guides/troubleshooting.md`

Updated files (3):
- `AGENTS.md` — slim down
- `README.md` — slim down
- `docs/guides/pipeline-customizer.md` — absorb unique content from README's setup.ts + extending presets sections

Untouched:
- `CLAUDE.md`, `SECURITY.md`, `documentation/` subtree, `templates/` subtree, `docs/superpowers/` (plans/specs), `docs/webiny-di-guide.md` (linked FROM `docs/architecture.md`, not modified), `docs/aws-transfer-setup.md`, `docs/ddb-es-migration-reference.md`, `docs/pino-logger-implementation.md`, `docs/design/generic-pipeline-framework.md`.

## Link conventions

- **AGENTS.md → detail file**: footer-style at the end of each section summary: `> Full reference: [title](docs/path.md)`
- **Detail file → AGENTS.md**: none (detail files are standalone references, not navigational).
- **`docs/architecture.md` → `docs/webiny-di-guide.md`**: inline link in the DI subsection: "For the full `@webiny/di` guide, see [webiny-di-guide.md](webiny-di-guide.md)." One direction only — the DI guide is untouched.
- **README.md → guide pages**: documentation index section with a bulleted list of links. Quick start also links to `docs/guides/commands.md` for detailed command reference.
- **Guide pages → README**: none (guides are self-contained; users arrive via README links).
- All links use relative paths.

## Constraints

- No information loss — every distinct piece of information from the original AGENTS.md and README.md must land somewhere (extracted file, AGENTS.md summary, or README hub). Duplicate prose restating content that already exists in an extracted file is not information loss when removed.
- Links between docs use relative paths.
- AGENTS.md section 8 verification commands (the `yarn format:fix` / `yarn ts-check` / etc. block) move to `docs/testing.md` since that's where agents look before committing.
- Existing `docs/guides/pipeline-customizer.md` already has detailed customizer usage; see "Merge rules" section above for how README content is reconciled.
