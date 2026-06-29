# Commands

## Installation

```bash
yarn install
```

## Guided setup (recommended)

`yarn transfer` (no `--config`) launches `TransferWizard`. It walks you through:

1. Selecting a project from `projects/`.
2. Collecting your Webiny output or Pulumi state JSON files and writing `.env`.
3. Selecting a preset and optional dry-run mode, then starting the transfer.

**First run (no `.env` yet):** if JSON output files are present (`source/target.webiny.json` or `.pulumi.json`), the wizard extracts values from your JSON files, writes `.env`, and exits so you can review it before anything runs. Run `yarn transfer` again to continue.

**Subsequent runs (`.env` exists, no JSON files):** the wizard skips env setup entirely and goes straight to preset selection.

**`.env` exists AND JSON files present:** the wizard asks whether to **repopulate** `.env` from the JSON files or **use the existing** `.env`. Choose "repopulate" to refresh after deploying a new environment; choose "use existing" to skip to preset selection.

**Account ID warning:** the wizard extracts the AWS account ID from `primaryDynamodbTableArn` in the JSON files. If source and target account IDs differ, the wizard warns and advises setting `SOURCE_PROFILE` and `TARGET_PROFILE` in `.env` so the right credentials are used for each side.

**Preset selection:** each preset is listed with its one-line description (`v5-to-v6-ddb — Full DDB migration`). User-supplied presets in `presetsDir` appear alongside built-ins.

**Dry-run mode:** after selecting a preset the wizard asks "Dry run?" (default: No). In dry-run mode the tool scans and transforms records normally but skips all writes to the target (DynamoDB, S3, OpenSearch). Useful for validating your pipeline and transformer chain before committing a full transfer.

Returns `WizardResult { configPath, preset, dryRun }`. Workers receive `--preset <name>` and optionally `--dry-run`.

New project folders are **gitignored** by default — credentials and env files stay local. Only `projects/v5-to-v6/` is committed as the reference example.

### Populating your .env

The wizard needs output files from your source and target Webiny systems. Place them in `projects/<name>/` before running `yarn transfer`:

**Option A — Webiny CLI output (recommended):**

```bash
# In your source Webiny project:
yarn webiny output core --json > source.webiny.json
# In your target Webiny project:
yarn webiny output core --json > target.webiny.json
```

**Option B — Pulumi state file (when you don't have Webiny CLI access):**

```bash
# Copy from: .pulumi/apps/core/.pulumi/stacks/core/<env>.json
cp /path/to/source-project/state.json projects/<name>/source.pulumi.json
cp /path/to/target-project/state.json projects/<name>/target.pulumi.json
```

Mixed formats are allowed (e.g. `source.webiny.json` + `target.pulumi.json`).

**CMS model exports (optional):** drop your exported model definitions into `projects/<name>/models/`. Export them from the Webiny Admin CMS → Models → Export, then copy the file there. See [`modelsDir`](config-reference.md#modelsdir) for accepted formats.

### JSON file formats

Place in `projects/<name>/` before running `yarn transfer`:

- `source.webiny.json` / `target.webiny.json` — output of `yarn webiny output core --json` run in the source/target Webiny project.
- `source.pulumi.json` / `target.pulumi.json` — Pulumi state file at `.pulumi/apps/core/.pulumi/stacks/core/<env>.json` in the source/target project. Mixed formats (e.g. `source.webiny.json` + `target.pulumi.json`) are allowed.

## Direct run with config

```bash
# After .env is written:
yarn transfer --config=./projects/v5-to-v6/config.ts --preset=v5-to-v6-ddb
# Then OpenSearch (if needed):
yarn transfer --config=./projects/v5-to-v6/config.ts --preset=v5-to-v6-os
```

`.env*` is gitignored. One `config.ts` covers both DDB and OS runs — the preset determines which storage operations execute.

## Re-running specific shards

```bash
yarn transfer --config=... --segments=1,3
```

Runs only the listed indices. Workers still receive `--total=<pipeline.segments>`, so each shard scans the exact same slice as in a full run. Use after a partial failure to avoid re-scanning the whole table. Parsing + validation live in `src/commands/run/segmentsFilter.ts`.

## Scaffolding

### `npx @webiny/data-transfer init`

```bash
npx @webiny/data-transfer init my-transfer-folder
```

Scaffolds a new standalone transfer project from `templates/`.

### `yarn transfer init-project <name>`

```bash
yarn transfer init-project <name>
```

Adds a project folder to this repo — creates `projects/<name>/` with `config.ts`, `.env.example`, `models/`, and `presets/`. Template lives in `templates/internal-project/`. New project folders are **gitignored** (`projects/*/` except `projects/v5-to-v6/`) — credentials stay local.

## Dev commands

- Format: `yarn format:fix` / `yarn format:check`
- Type-check: `yarn ts-check`
- Test: `yarn test` (or `yarn test:coverage`)
- Lint: `yarn lint`
- Import checks: `yarn check:imports`
