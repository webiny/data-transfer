# AI Agent Guidelines

This document is read by AI agents when working on this codebase. It describes the current architecture, hard-won decisions, and conventions that must be followed.

**This document is updated as the codebase evolves.** Treat anything that contradicts the current code as stale — the code is the source of truth.

---

## 0. Code navigation

Use the **codegraph MCP** as the first tool for browsing code. `codegraph_explore` answers most questions ("how does X work", "where is Y defined", architecture traces) in a single call — it returns verbatim source grouped by file. Only fall back to `Read` / `grep` when codegraph doesn't cover a specific detail or the index hasn't caught a very recent change.

---

## 1. Project at a glance

**Package:** `@webiny/data-transfer`.

**What it does:** a generic data-transfer tool for Webiny environments. The flagship use case is v5→v6 migration, but the infrastructure is storage-agnostic and transformer-optional — **"copy prod data into dev with zero transformation"** is a first-class use case.

**Runtime flow (when deployed):**

1. User writes a single `config.ts`: `createConfig({ source, target, pipeline })`. One file covers DDB, S3, and optional OpenSearch. **User-side custom DI:** `register` callback in `createConfig()` is the primary path (runs before preset loading). `setup.ts` next to the config file is the alternative for larger setups. Both are optional.
2. CLI `transfer` command (no `--config`): the `TransferWizard` selects a project, writes `.env`, then on subsequent runs prompts for a preset and returns `WizardResult { configPath, preset }`. With `--config`: skips wizard, preset passed as `--preset` flag.
3. Bootstrap loads the config, registers all features (DDB + S3 always; OS conditional on `config.target.opensearch != null`), loads the named preset, spawns worker processes per segment.
4. Each worker runs one or more shards: scans source → for each record, first-match-wins pipeline runs: filters → transformers → each processor's `onEnd?` hook (sequential, array order) → commands accumulate in a pending buffer. Every `tuning.flushEvery` records (default 500) each processor's `execute()` drains its own keys from that buffer (sequential, array order) and the buffer resets — this bounds peak memory to `flushEvery × avg_record_size`. A final flush at shard end drains any remainder. `Commands.unclaimedKeys()` surfaces commands no processor claimed.

**Read before big refactors:**

- `docs/design/generic-pipeline-framework.md` — long-term design (pipeline-centric model, merge groups keyed by scanner, first-match-wins).
- `docs/superpowers/specs/2026-04-18-*.md` — recent design docs (transformer-library, preset-migration).

---

## 2. Public API surface

Everything users import lives in `src/index.ts`: config builder (`createConfig`), env helpers, AWS credential helpers, transformer/filter factories, scanner/processor classes, preset helper, pipeline construction, context types. Five built-in presets: `v5-to-v6-ddb`, `v5-to-v6-os`, `copy-ddb`, `copy-os`, `copy-files`.

**Rule:** when adding to `src/index.ts`, it must be something a user building their own transformers/pipelines/presets genuinely needs. Domain-specific migration transformers remain internal.

> Full reference: [Public API surface](docs/public-api.md)

---

## 3. Project structure

Source lives in `src/` with `cli.ts` entry point, `bootstrap.ts` DI setup, `index.ts` public API. Domain logic is in `src/features/` (one dir per feature), pipeline abstractions in `src/domain/pipeline/`, transform primitives in `src/domain/transform/`, ~30 built-in transformers in `src/transformers/`, and 5 built-in presets in `src/presets/`. Build scripts live in `scripts/features/BuildPackages/` (DI-based, mirrors `@webiny/stdlib`). Build tsconfigs in `config/`. Changeset config in `.changeset/`. CI/CD workflows in `.github/workflows/`.

> Full reference: [Project structure](docs/project-structure.md)

---

## 4. Architecture patterns

DI via `@webiny/di` — `createAbstraction` / `createImplementation`, all processors share one token, constructor identity is the discriminator. Feature layout follows `abstractions/` + impl + `feature.ts` + `index.ts`. Pipeline runtime: first-match-wins per merge group, `onEnd` hooks replace auto-put magic, slice-merged context (`BaseTransformContext ∧ MergeSlices<TProcessors>`).

> Full reference: [Architecture patterns](docs/architecture.md)

---

## 5. Testing

Tests in `__tests__/` mirror `src/`. Shared containers in `__tests__/containers/`, mock clients in `__tests__/services/`. Integration tests under `__tests__/integration/` run against local dynalite. Golden-file preset test in `pipeline.preset.test.ts`.

Verification before any commit: `yarn npm audit`, `yarn format:fix`, `yarn ts-check`, `yarn test:coverage`, `yarn lint`, `yarn check:imports`. All six required.

> Full reference: [Testing](docs/testing.md)

---

## 6. Hard-won decisions (read before changing)

~30 documented decisions covering: unified `createConfig`, runtime preset selection, zero-transformer support, record-carries-everything invariant, slice-merging processors, first-match-wins pipeline dispatch, `afterShard` hook, `PipelineCustomizer`, per-record `ctx.blackhole()`, and more.

> Full reference: [Hard-won decisions](docs/hard-won-decisions.md)

---

## 7. Known open work (in priority order)

### Merged branches (for historical context)

- `bruno/feat/di-features` — slice-merging-processors refactor, afterShard hook, dynalite integration suite, golden-file preset test. **Merged to `main`.**
- `bruno/feat/os-transfer` — `v5-to-v6-os` preset, `OsScanner` + `OsProcessor`, `addLiveField`, OS transformers, `ModelProvider` multi-format JSON. **Merged to `main`.**

### Open work

1. **First npm publish** — infrastructure is in place (changesets, CI, publish workflow, build scripts). Needs: `NPM_TOKEN` secret in GitHub, first `yarn changeset` to create a version bump, merge to main.
2. **Init scaffolding smoke** — `init` scaffolds from `templates/`. Scaffold output: `config.ts`, `presets/example.ts`, optional `setup.ts`. Do a smoke run to verify a scaffolded project compiles + runs against a live sandbox.
3. **End-to-end AWS smoke** — no test has ever run against real AWS. Day-long sandbox exercise. Catches real issues mocks can't.
4. **Public API audit pass (post-refactor)** — `src/index.ts` grew organically. Re-audit before publish to confirm the surface matches user-authoring intent. `DdbCoreTransformContext` (= Base ∧ DdbProcessorSlice) was added as the narrower alternative to `DdbTransformContext`.

---

## 8. Commands / running the tool

Install: `yarn install`. Run guided setup: `yarn transfer` (no `--config`). Direct run: `yarn transfer --config=./path/config.ts --preset=<name>`. Build: `yarn build`. Pack dry-run: `yarn pack:packages`. Release: `yarn release` (build + changeset publish). Init user project: `npx @webiny/data-transfer my-folder`.

> Full command reference: [Commands](docs/guides/commands.md)
> Verification commands: [Testing — Verification before commit](docs/testing.md#verification-before-commit)

---

## 9. Memory files

Persistent user/project memory for agents lives in `~/.claude/projects/.../memory/` and is indexed by `MEMORY.md`. Key entries:

- `user_role.md` — Bruno, senior Webiny engineer.
- `feedback_*` files — house style rules (braces, access modifiers, namespace types, no inline structural types, camelCase file names, no reflect-metadata imports, terse responses, commit per section).
- `feedback_no_transformers_required.md` — zero-transformer rule.
- `feedback_keep_ctx_original.md` — ctx.original stays.
- `project_*` files — project context and open TODOs.

When in doubt about a preference, check `MEMORY.md` first. When adding a new hard-won decision, save it to a memory file AND surface it in section 6 of this doc.
