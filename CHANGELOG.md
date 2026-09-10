# @webiny/data-transfer

## 0.0.8

### Patch Changes

- 758b0d0: Fix worker process spawning in published packages — resolve `cli.js` when `bin.js` is absent.

## 0.0.7

### Patch Changes

- b47e61f: Fix preset discovery listing `.d.ts` declaration files as duplicate entries. Preset names and descriptions are now read from the module export instead of derived from filenames. Warns when a preset file fails to import.

## 0.0.6

### Patch Changes

- 74a0a2f: Fix `.env` population for older scaffolded projects: `writeEnv` now supports plain `KEY=value` `.env.example` files by uncommenting commented-out known keys and appending missing ones. Config template auto-enables OpenSearch when the env vars are set — no manual uncommenting needed.

## 0.0.5

### Patch Changes

- b4c7028: Fix `writeEnv` to support plain `KEY=value` format in `.env.example` — older scaffolded projects no longer crash during the wizard. Both `{{TOKEN}}` placeholders and plain env lines are handled; falls back to the built-in template when no `.env.example` exists.

## 0.0.4

### Patch Changes

- 9ea3519: Fix `addLiveField` in the OS lane and add `fix-live` reconciler command. `OsProcessor.querySourceRecord` now returns decompressed rows, so the published revision's `version` is readable — entries with a draft on top of a published revision correctly get `live: { version }` instead of `live: {}`. Add the `fix-live` command to reconcile already-migrated systems: scans DynamoDB and OpenSearch companion tables, reports changes in JSONL, writes only via conditional `UpdateItem`. Add a command menu (`yarn transfer` with no args), `@clack/prompts`-backed `Prompts`/`UI` abstraction, and `Command` registry. Remove `@inquirer/prompts` — all prompts now go through the abstraction. Update dependencies.

## 0.0.3

### Patch Changes

- d5e620c: Fix cross-account migration by bypassing `@webiny/aws-sdk` client cache. Add `--config`, `--preset`, and `--dry-run` flags to skip the wizard. Wire `copyFileToTarget` in `copy-files` and `v5-to-v6-ddb` presets so S3 files are actually copied. URL-encode `CopySource` path segments for keys with special characters. Fix flaky dynalite integration test with `waitForTableActive`.

## 0.0.2

### Patch Changes

- 7a81895: Strip `#NNNN` revision suffixes from `id`, `parentId`, and `inheritedFrom` in FLP permission records during transfer. Fix npm 11 publish by dropping `./` prefix from bin entries. Pin `@changesets/cli` to 2.x.

## 0.0.1

### Patch Changes

- 534dfc3: initial release

## 0.0.1-alpha.3

### Patch Changes

- fa34265: Add `update-skills` CLI command for updating Claude Code skills from the installed package. Ship `.gitignore` in scaffolded projects (npm strips dotfiles, so we ship as `.gitignore.example` and rename during scaffold).

## 0.0.1-alpha.2

### Patch Changes

- 3cab748: Add MCP server (`webiny-data-transfer-mcp`) with `list_topics` and `get_topic` tools serving 44 documentation topics. Export all 27 built-in transformers and all 18 filter predicates as public API. Consolidate CI workflows and update all GitHub Actions to latest versions.

## 0.0.1-alpha.1

### Patch Changes

- 24a502a: Consolidate CI workflows, update all GitHub Actions to latest versions, add register callback example to scaffolded config template, fix scaffold yarn install in CI environments.

## 0.0.1-alpha.0

### Patch Changes

- Initial alpha release of the standalone data-transfer package. Includes CLI with guided wizard, DynamoDB/OpenSearch/S3 transfer support, built-in presets (v5-to-v6, copy), pipeline framework with customizable transformers and filters, and project scaffolding via `npx @webiny/data-transfer`.
