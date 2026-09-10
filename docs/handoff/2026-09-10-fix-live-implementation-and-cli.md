# Session Handoff — 2026-09-04 to 2026-09-10 — Fix-Live Implementation, CLI Menu, and Bug Fixes

## What was done

This multi-day session implemented the full fix-live reconciler and CLI command menu (both plans from the 2026-09-04 design session), then fixed several user-facing bugs discovered during real-world testing.

### Plan 1: Fix-Live Reconciler (PR #42, merged)
- Fixed root cause: `OsProcessor.querySourceRecord` now returns decompressed rows, `addLiveField` uses `readPositiveIntegerVersion` with root-then-data fallback
- Added `IDynamoDbClient.updateAttribute` (conditional SET with path expression), `ScanOptions.limit/sortKeyEquals`
- Added `FileTool.appendLineOrThrow` for JSONL report writing
- Built the full `FixLive` feature: `LiveFieldReconciler` (pure decision logic, 24 test cases), `ChangeReport` (JSONL), `FixLiveState` (dry-run gate), `BaseLiveFieldRunner` + `DdbLiveFieldRunner` + `OsLiveFieldRunner`
- Dynalite integration tests for both DDB and OS runners
- 10 commits, all subagent-reviewed

### Plan 2: CLI Command Menu (PR #42, merged)
- Added `Prompts`/`UI` abstraction backed by `@clack/prompts` — commands never import a prompt library
- Added `Command` token + `CommandRegistry` (lazy `resolveAll`)
- Moved `commands/run/` → `commands/transfer/`, wrapped all 5 commands as `Command` implementations
- New `src/cli.ts` with registry-driven yargs + `$0 [folder]` default for backwards compatibility
- `FixLiveCommand` guided flow: selectProject → guardV6 → confirmSystem → selectMode → runTable → summarise
- Docs: commands guide, troubleshooting, hard-won decisions (7 new entries), AGENTS.md
- 8 commits, all subagent-reviewed

### Inquirer Removal (PR #42, merged)
- `TransferWizard` migrated from `@inquirer/prompts` to `Prompts`/`UI` abstraction
- `@inquirer/core` and `@inquirer/prompts` removed from dependencies
- `ExitPromptError` catch replaced with null-return pattern

### Bug Fixes (PRs #44, #46, #48, plus current branch)
- **envWriter** (PR #44, #46): supports plain `KEY=value` `.env.example` format — uncomments commented-out known keys, appends missing ones. Config template auto-enables OpenSearch conditionally.
- **Preset discovery** (PR #48): skips `.d.ts` declaration files, reads name/description from module export instead of filename, warns on import failure.
- **Worker bin path** (current branch): resolves `cli.js` when `bin.js` is absent in published packages.

## Key decisions

- `Prompts`/`UI` abstraction: select/confirm/text return null on cancel, never exit. Commands map null to exit 130. Only `Clack*.ts` files import `@clack/prompts`.
- `fix-live` writes only when certain — any ambiguity skips the whole PK. Uses `UpdateItem` with path expression, conditioned on `_md`.
- `fix-live` scans L rows + `queryAll(PK)` per entry — no reliance on scan ordering.
- CLI commands are `Command` implementations behind a lazy registry. `hidden: true` keeps internal commands out of the menu.
- Coverage thresholds raised from 79/84/71/79 to 81/85/74/81.

## Current state

- Branch: `bruno/fix/worker-bin-path` (3 commits ahead of origin — worker bin fix + changeset + AGENTS.md update)
- Main: at `ed10cd0` (release 0.0.7)
- Tests: 842 passed (135 files)
- Typecheck: passing
- All merged PRs: #42, #44, #46, #48
- Pending: worker bin path fix (not yet pushed/PR'd)

## What might come next

- Push `bruno/fix/worker-bin-path` and create PR for the worker bin fix
- Publish a new release with the worker fix
- Run actual v5→v6 migration against the Siemens project to validate end-to-end
- `fix-live` OS propagation — confirm v6's DDB stream handler treats a `data`-only change on the OS companion table as an index update
- Relax the "source.opensearch and target.opensearch must both be set" schema rule — enforce at preset time instead of config validation
- End-to-end AWS smoke test
