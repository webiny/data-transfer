# Documentation Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split AGENTS.md (440 lines) and README.md (652 lines) into focused, linked documents — 11 new files, 3 updated files.

**Architecture:** Extract content from two monolithic files into topic-focused docs. Agent-facing detail goes under `docs/` (5 files). User-facing guides go under `docs/guides/` (6 files). Source files are slimmed to summaries + links after extraction. One existing guide (`docs/guides/pipeline-customizer.md`) absorbs unique content from README.

**Tech Stack:** Markdown only. No code changes.

## Global Constraints

- No information loss — every distinct piece of information from AGENTS.md and README.md must land in an extracted file, a summary, or the README hub. Duplicate prose restating content that already exists elsewhere is not information loss when removed.
- All links use relative paths.
- Link convention — AGENTS.md uses footer-style: `> Full reference: [title](docs/path.md)`. README uses a documentation index section with bulleted links.
- Detail files do NOT link back to AGENTS.md or README (they are standalone references).
- Commit after each task.

## Source file section map

### AGENTS.md sections (by line range)

| # | Section | Lines | Action |
|---|---------|-------|--------|
| 0 | Code navigation | 9-12 | Keep |
| 1 | Project at a glance | 14-32 | Keep |
| 2 | Public API surface | 34-68 | Extract → `docs/public-api.md` |
| 3 | Project structure | 70-188 | Extract → `docs/project-structure.md` |
| 4 | Architecture patterns | 190-307 | Extract → `docs/architecture.md` |
| 5 | Testing | 309-341 | Extract → `docs/testing.md` |
| 6 | Hard-won decisions | 343-376 | Extract → `docs/hard-won-decisions.md` |
| 7 | Open work | 378-392 | Keep |
| 8 | Commands | 394-427 | Extract → `docs/guides/commands.md` + verification block → `docs/testing.md` |
| 9 | Memory files | 429-440 | Keep |

### README.md sections (by line range)

| Section | Lines | Action |
|---------|-------|--------|
| Intro + quick start | 1-65 | Keep (trimmed) |
| Config reference (all subsections) | 67-243 | Extract → `docs/guides/config-reference.md` |
| Writing a preset (all subsections) | 245-398 | Extract → `docs/guides/writing-presets.md` |
| Writing transformers (all subsections) | 400-554 | Extract → `docs/guides/writing-transformers.md` |
| Custom DI — setup.ts | 556-573 | Merge → `docs/guides/pipeline-customizer.md` |
| Extending built-in presets | 575-624 | Merge → `docs/guides/pipeline-customizer.md` |
| Pipeline runtime semantics | 626-636 | Extract → `docs/guides/pipeline-runtime.md` |
| Troubleshooting | 638-649 | Extract → `docs/guides/troubleshooting.md` |
| License | 650-652 | Keep |

---

### Task 1: Extract AGENTS.md content into 5 detail files

**Files:**
- Create: `docs/public-api.md`
- Create: `docs/project-structure.md`
- Create: `docs/architecture.md`
- Create: `docs/testing.md`
- Create: `docs/hard-won-decisions.md`

**Interfaces:**
- Consumes: AGENTS.md sections 2-6, 8 (verification block only)
- Produces: 5 standalone reference docs that Task 4 will link to from AGENTS.md

- [ ] **Step 1: Create `docs/public-api.md`**

Copy AGENTS.md lines 34-68 (section 2 content, starting after the `---` separator). Give it a title and make it standalone:

```markdown
# Public API surface

Everything users import lives in `src/index.ts`. ...
```

Copy the full section content verbatim. Do NOT include the agent-facing rule at line 67 ("Rule: when adding something to `src/index.ts`...") — that stays in AGENTS.md's summary (Task 4 handles this).

- [ ] **Step 2: Create `docs/project-structure.md`**

Copy AGENTS.md lines 70-188 (section 3). Title:

```markdown
# Project structure
```

Copy the full `src/` tree and the "Dirs that are **gone**" note verbatim.

- [ ] **Step 3: Create `docs/architecture.md`**

Copy AGENTS.md lines 190-307 (section 4 — all subsections: DI, feature layout, pipeline runtime, context surface, scanner/processor/executor, config tuning, AWS retry). Title:

```markdown
# Architecture patterns
```

Copy all subsections verbatim. In the "DI via `@webiny/di`" subsection, add at the end:

```markdown
For the full `@webiny/di` guide, see [webiny-di-guide.md](webiny-di-guide.md).
```

- [ ] **Step 4: Create `docs/testing.md`**

Copy AGENTS.md lines 309-341 (section 5). Title:

```markdown
# Testing
```

Copy the full section. Then append the verification commands block from AGENTS.md section 8 (lines 329-339 — the `yarn npm audit` through `git status` block with the "All six checks are required" note). Structure it as:

```markdown
## Verification before commit

[the verification block from section 8]
```

This consolidates all testing/verification guidance in one file.

- [ ] **Step 5: Create `docs/hard-won-decisions.md`**

Copy AGENTS.md lines 343-376 (section 6). Title:

```markdown
# Hard-won decisions

These are one-line summaries. Each links to a spec or PR if fuller context is needed.
```

Copy all bullet points verbatim.

- [ ] **Step 6: Verify and commit**

Run:
```bash
wc -l docs/public-api.md docs/project-structure.md docs/architecture.md docs/testing.md docs/hard-won-decisions.md
```

Verify each file is non-empty and reads as a standalone doc. Commit:

```bash
git add docs/public-api.md docs/project-structure.md docs/architecture.md docs/testing.md docs/hard-won-decisions.md
git commit -m "docs: extract AGENTS.md detail sections into standalone files"
```

---

### Task 2: Extract README content into 6 guide files

**Files:**
- Create: `docs/guides/config-reference.md`
- Create: `docs/guides/writing-presets.md`
- Create: `docs/guides/writing-transformers.md`
- Create: `docs/guides/pipeline-runtime.md`
- Create: `docs/guides/commands.md`
- Create: `docs/guides/troubleshooting.md`

**Interfaces:**
- Consumes: README.md sections (config, presets, transformers, runtime, commands from AGENTS.md section 8, troubleshooting)
- Produces: 6 standalone guide pages that Task 5 will link to from README

- [ ] **Step 1: Create `docs/guides/config-reference.md`**

Copy README lines 67-243 (from `## Config reference` through end of `### Debug options`). Title:

```markdown
# Config reference
```

Includes: config.ts example, `loadEnv` explanation, env helpers, credentials, IAM permissions tables, modelsDir, tuning, debug options with snapshot/logFile. Copy verbatim.

- [ ] **Step 2: Create `docs/guides/writing-presets.md`**

Copy README lines 245-398 (from `## Writing a preset` through `### Built-in presets`). Title:

```markdown
# Writing a preset
```

Includes: preset shape example, `pipelineBuilderFactory.create()` reference, builder methods table, filters with predicates table, multiple pipelines example, zero-transformer example, built-in presets list. Copy verbatim.

- [ ] **Step 3: Create `docs/guides/writing-transformers.md`**

Copy README lines 400-554 (from `## Writing transformers` through `### Built-in processors`). Title:

```markdown
# Writing transformers
```

Includes: factory variants, context type aliases table, base context API table, processor slices tables, `copyFileToTarget` example, `replaceFileUrls` example, built-in processors table. Copy verbatim.

- [ ] **Step 4: Create `docs/guides/pipeline-runtime.md`**

Copy README lines 626-636 (the `## Pipeline runtime semantics` section). Title:

```markdown
# Pipeline runtime semantics
```

Includes: merge groups, first-match-wins, unmatched records, hooks, parallelism, re-running shards. Copy verbatim.

- [ ] **Step 5: Create `docs/guides/commands.md`**

This file combines content from TWO sources:

**Source A — AGENTS.md section 8** (lines 394-427): the full commands section EXCEPT the verification block (which went to `docs/testing.md` in Task 1). This includes: `yarn install`, `yarn format:fix`/`yarn format:check`, `yarn ts-check`, `yarn test`, `npx @webiny/data-transfer init`, `yarn transfer init-project`, guided setup wizard flow (wizard steps, JSON file formats, preset selection, dry-run, `WizardResult`), direct run with `--config`, JSON file format details, `--segments` re-drive.

**Source B — README.md** (lines 13-65): the quick-start wizard walkthrough (`.env` population, account ID warning, preset selection description, dry-run mode, populating your `.env` subsections). Only the DETAILED content — the README quick start will keep a minimal snippet.

Title and structure:

```markdown
# Commands

## Installation

[yarn install from AGENTS.md section 8]

## Guided setup (recommended)

[Wizard flow from AGENTS.md section 8 lines 403-411 + README lines 22-40 merged — deduplicate, keep the fuller version of each point]

### Populating your .env

[README lines 44-65 — the Option A / Option B / mixed formats / CMS model exports subsections]

### JSON file formats

[AGENTS.md lines 423-426]

## Direct run with config

[AGENTS.md lines 412-420 + README lines 412-420 equivalent]

## Re-running specific shards

[AGENTS.md line 427 content]

## Scaffolding

### `npx @webiny/data-transfer init`

[AGENTS.md line 401]

### `yarn transfer init-project <name>`

[AGENTS.md lines 402-403]

## Dev commands

[Format, type-check, test, lint, check:imports — the non-verification usage from AGENTS.md section 8]
```

When merging overlapping wizard/setup content, keep the fuller version. Discard duplicate prose per the spec's merge rules.

- [ ] **Step 6: Create `docs/guides/troubleshooting.md`**

Copy README lines 638-649 (the `## Troubleshooting` section). Title:

```markdown
# Troubleshooting
```

Copy all bullet points verbatim.

- [ ] **Step 7: Verify and commit**

Run:
```bash
wc -l docs/guides/config-reference.md docs/guides/writing-presets.md docs/guides/writing-transformers.md docs/guides/pipeline-runtime.md docs/guides/commands.md docs/guides/troubleshooting.md
```

Verify each file is non-empty and reads standalone. Commit:

```bash
git add docs/guides/config-reference.md docs/guides/writing-presets.md docs/guides/writing-transformers.md docs/guides/pipeline-runtime.md docs/guides/commands.md docs/guides/troubleshooting.md
git commit -m "docs: extract README sections into standalone guide pages"
```

---

### Task 3: Merge unique README content into `docs/guides/pipeline-customizer.md`

**Files:**
- Modify: `docs/guides/pipeline-customizer.md`

**Interfaces:**
- Consumes: README lines 556-624 ("Custom DI — setup.ts" + "Extending built-in presets")
- Produces: updated pipeline-customizer guide with any unique content absorbed

- [ ] **Step 1: Compare README content against existing guide**

Read README lines 556-573 ("Custom DI — setup.ts") and lines 575-624 ("Extending built-in presets"). Compare paragraph-by-paragraph against `docs/guides/pipeline-customizer.md`.

The existing guide already covers:
- Quick start with `setup.ts` example (lines 8-48) — covers the README's setup.ts section
- `canUse()` targeting (lines 49-57) — covers README's `canUse` description
- Adding transformers (lines 59-78) — covers README's transformer usage
- Per-record blackholing (lines 80-107) — covers README's `ctx.blackhole()` content
- Ordering (lines 109-117) — covers README's ordering notes
- Unmatched warning (lines 119-130) — covers README's unmatched warning
- Limitations (lines 162-173) — covers README's customizer scope

- [ ] **Step 2: Identify unique README content not in the guide**

Walk through each README paragraph:

README "Custom DI — setup.ts" (lines 556-573):
- `initDataTransfer` typed helper — guide's quick start already shows this ✓
- "runs before loading your preset" timing — guide doesn't explicitly state this timing
- "container is a @webiny/di container with all core features already wired" — guide doesn't mention this
- "optional — delete it if you don't need custom DI wiring" — guide doesn't state optionality

README "Extending built-in presets" (lines 575-624):
- The code example — guide already has a fuller version ✓
- `canUse` description — guide covers this ✓
- `configure(builder)` description — guide covers this ✓
- `ctx.blackhole()` description — guide has a dedicated section ✓
- "Unmatched warning" — guide covers this ✓
- Link to pipeline-customizer guide — self-referential, skip

- [ ] **Step 3: Add unique content to the guide**

Add a "Prerequisites" or "How it works" section after the quick start that captures the unique info. Insert after line 48 (after the quick start example explanation):

```markdown
## How it works

The CLI looks for `setup.ts` next to your config file. If present, it runs
`await fn({ container })` **before** loading your preset — so the preset can
`container.resolve(...)` anything you registered.

`container` is a `@webiny/di` container with all core data-transfer features
already wired (scanners, processors, executors, etc.). `initDataTransfer` is
a typed helper that validates the export shape.

`setup.ts` is optional — delete it if you don't need custom DI wiring.
```

- [ ] **Step 4: Verify completeness**

Walk through each README paragraph from "Custom DI — setup.ts" and "Extending built-in presets" one more time. Confirm every piece of information is either:
- Already in the guide (mark ✓)
- Just added in step 3 (mark ✓)
- Duplicate prose that restates existing guide content (mark as discarded)

- [ ] **Step 5: Commit**

```bash
git add docs/guides/pipeline-customizer.md
git commit -m "docs: absorb unique README setup.ts content into pipeline-customizer guide"
```

---

### Task 4: Slim AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: all 5 detail files from Task 1, `docs/guides/commands.md` from Task 2, `docs/testing.md` from Task 1
- Produces: slimmed AGENTS.md (~120-150 lines) with summaries + links

- [ ] **Step 1: Replace section 2 (Public API surface)**

Replace AGENTS.md lines 34-68 with:

```markdown
## 2. Public API surface

Everything users import lives in `src/index.ts`: config builder (`createConfig`), env helpers, AWS credential helpers, transformer/filter factories, scanner/processor classes, preset helper, pipeline construction, context types. Five built-in presets: `v5-to-v6-ddb`, `v5-to-v6-os`, `copy-ddb`, `copy-os`, `copy-files`.

**Rule:** when adding to `src/index.ts`, it must be something a user building their own transformers/pipelines/presets genuinely needs. Domain-specific migration transformers remain internal.

> Full reference: [Public API surface](docs/public-api.md)
```

The agent-facing rule stays inline per the spec.

- [ ] **Step 2: Replace section 3 (Project structure)**

Replace AGENTS.md lines 70-188 with:

```markdown
## 3. Project structure

Source lives in `src/` with `cli.ts` entry point, `bootstrap.ts` DI setup, `index.ts` public API. Domain logic is in `src/features/` (one dir per feature), pipeline abstractions in `src/domain/pipeline/`, transform primitives in `src/domain/transform/`, ~30 built-in transformers in `src/transformers/`, and 5 built-in presets in `src/presets/`.

> Full reference: [Project structure](docs/project-structure.md)
```

- [ ] **Step 3: Replace section 4 (Architecture patterns)**

Replace AGENTS.md lines 190-307 with:

```markdown
## 4. Architecture patterns

DI via `@webiny/di` — `createAbstraction` / `createImplementation`, all processors share one token, constructor identity is the discriminator. Feature layout follows `abstractions/` + impl + `feature.ts` + `index.ts`. Pipeline runtime: first-match-wins per merge group, `onEnd` hooks replace auto-put magic, slice-merged context (`BaseTransformContext ∧ MergeSlices<TProcessors>`).

> Full reference: [Architecture patterns](docs/architecture.md)
```

- [ ] **Step 4: Replace section 5 (Testing)**

Replace AGENTS.md lines 309-341 with:

```markdown
## 5. Testing

Tests in `__tests__/` mirror `src/`. Shared containers in `__tests__/containers/`, mock clients in `__tests__/services/`. Integration tests under `__tests__/integration/` run against local dynalite. Golden-file preset test in `pipeline.preset.test.ts`.

Verification before any commit: `yarn npm audit`, `yarn format:fix`, `yarn ts-check`, `yarn test:coverage`, `yarn lint`, `yarn check:imports`. All six required.

> Full reference: [Testing](docs/testing.md)
```

- [ ] **Step 5: Replace section 6 (Hard-won decisions)**

Replace AGENTS.md lines 343-376 with:

```markdown
## 6. Hard-won decisions (read before changing)

~30 documented decisions covering: unified `createConfig`, runtime preset selection, zero-transformer support, record-carries-everything invariant, slice-merging processors, first-match-wins pipeline dispatch, `afterShard` hook, `PipelineCustomizer`, per-record `ctx.blackhole()`, and more.

> Full reference: [Hard-won decisions](docs/hard-won-decisions.md)
```

- [ ] **Step 6: Replace section 8 (Commands)**

Replace AGENTS.md lines 394-427 with:

```markdown
## 8. Commands / running the tool

Install: `yarn install`. Run guided setup: `yarn transfer` (no `--config`). Direct run: `yarn transfer --config=./path/config.ts --preset=<name>`.

> Full command reference: [Commands](docs/guides/commands.md)
> Verification commands: [Testing — Verification before commit](docs/testing.md#verification-before-commit)
```

- [ ] **Step 7: Verify line count and commit**

Run:
```bash
wc -l AGENTS.md
```

Target: ~120-150 lines. If over 150, look for remaining verbose sections to trim. If under 100, summaries may be too terse — add a sentence.

```bash
git add AGENTS.md
git commit -m "docs: slim AGENTS.md to summaries with links to detail files"
```

---

### Task 5: Slim README.md

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: all 6 guide files from Task 2, updated `docs/guides/pipeline-customizer.md` from Task 3
- Produces: hub-page README (~100-150 lines)

- [ ] **Step 1: Write the new README.md**

Replace the entire README with a hub page. Structure:

```markdown
# `@webiny/data-transfer`

A generic data-transfer tool for Webiny environments. Copies DynamoDB + S3 (or OpenSearch) records between AWS accounts, optionally running a transformer chain on each record.

**Use cases:**

- **v5 → v6 migration** — write a preset that registers the relevant pipelines.
- **Prod → dev seeding** — zero transformers, just copy.
- **Custom transfers** — write your own transformers + pipelines + preset for bespoke data moves.

The package ships five built-in presets (`v5-to-v6-ddb`, `v5-to-v6-os`, `copy-ddb`, `copy-os`, `copy-files`) plus full authoring support for your own.

## Quick start

[Keep the clone/install/yarn transfer block from lines 14-20]

`yarn transfer` (no `--config`) launches the **guided setup wizard**. It walks you through selecting a project, collecting credentials, choosing a preset, and starting the transfer. See the [full command reference](docs/guides/commands.md) for all options including direct `--config` runs, re-driving specific shards, and project scaffolding.

## Built-in presets

| Preset | Description |
|--------|-------------|
| `v5-to-v6-ddb` | Full Webiny v5 → v6 migration of the primary DynamoDB table |
| `v5-to-v6-os` | Migration of the OpenSearch companion DynamoDB table (run after `v5-to-v6-ddb`) |
| `copy-ddb` | Verbatim DynamoDB + S3 copy (no transformations) |
| `copy-os` | Verbatim OpenSearch companion table copy (no transformations) |
| `copy-files` | S3-only file copy |

Custom presets placed in your `presetsDir` are listed alongside built-ins.

## Documentation

- [Config reference](docs/guides/config-reference.md) — `config.ts` setup, env helpers, credentials, IAM permissions, tuning, debug options
- [Commands](docs/guides/commands.md) — guided wizard, direct `--config` runs, `init`, `init-project`, `--segments`
- [Writing presets](docs/guides/writing-presets.md) — preset shape, pipeline builder, filters, multi-pipeline patterns
- [Writing transformers](docs/guides/writing-transformers.md) — transformer factories, context types, processor slices, built-ins
- [Extending built-in presets](docs/guides/pipeline-customizer.md) — PipelineCustomizer, `setup.ts`, custom DI
- [Pipeline runtime](docs/guides/pipeline-runtime.md) — merge groups, first-match-wins, unmatched records, hooks
- [Troubleshooting](docs/guides/troubleshooting.md) — common issues and fixes

## License

See `LICENSE`.
```

- [ ] **Step 2: Verify line count**

Run:
```bash
wc -l README.md
```

Target: ~100-150 lines.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: slim README.md to hub page with documentation index"
```

---

### Task 6: Final verification

**Files:**
- All files from Tasks 1-5

- [ ] **Step 1: Check all links resolve**

Run from the repo root:

```bash
# Extract all markdown links from AGENTS.md and README.md, check each file exists
grep -oP '\[.*?\]\(\K[^)]+' AGENTS.md README.md | while read -r link; do
  # Strip anchor fragments
  file=$(echo "$link" | sed 's/#.*//')
  if [ -n "$file" ] && [ ! -f "$file" ]; then
    echo "BROKEN: $link"
  fi
done
```

All links should resolve. Fix any broken ones.

- [ ] **Step 2: Verify line counts**

```bash
echo "=== Target: AGENTS.md ~120-150 ==="
wc -l AGENTS.md
echo "=== Target: README.md ~100-150 ==="
wc -l README.md
echo "=== All new files ==="
wc -l docs/public-api.md docs/project-structure.md docs/architecture.md docs/testing.md docs/hard-won-decisions.md docs/guides/config-reference.md docs/guides/writing-presets.md docs/guides/writing-transformers.md docs/guides/pipeline-runtime.md docs/guides/commands.md docs/guides/troubleshooting.md
```

- [ ] **Step 3: Content parity audit**

Spot-check that key content landed somewhere:

```bash
# These terms should appear in the extracted files (not lost)
grep -l "createConfig" docs/public-api.md docs/guides/config-reference.md
grep -l "flushEvery" docs/architecture.md docs/guides/config-reference.md docs/hard-won-decisions.md
grep -l "dynalite" docs/testing.md
grep -l "first-match-wins" docs/architecture.md docs/guides/pipeline-runtime.md docs/hard-won-decisions.md
grep -l "isRetryableAwsError" docs/architecture.md docs/hard-won-decisions.md
grep -l "init-project" docs/guides/commands.md
grep -l "yarn ts-check" docs/testing.md
grep -l "AccessDenied" docs/guides/troubleshooting.md
```

Each grep should return at least one file. If any returns empty, content was lost — find and restore it.

- [ ] **Step 4: Commit any fixes**

If any links or content needed fixing:

```bash
git add -A
git commit -m "docs: fix links and restore missing content from restructure"
```

If no fixes needed, skip this step.

- [ ] **Step 5: Run project checks**

```bash
yarn format:fix
yarn ts-check
yarn test:coverage
yarn lint
yarn check:imports
```

These should all pass (doc-only changes don't affect code). Commit any format fixes if `yarn format:fix` touched anything.
