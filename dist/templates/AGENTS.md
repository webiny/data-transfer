# Project guide

This project uses [`@webiny/data-transfer`](https://www.npmjs.com/package/@webiny/data-transfer) to move DynamoDB + S3 (and optionally OpenSearch) data between Webiny environments. It was scaffolded by `@webiny/data-transfer init`.

## Layout

```
projects/<env-name>/
    config.ts                   # Unified config (DDB + S3 + optional OpenSearch)
    setup.ts                    # Optional custom DI wiring
    models/                     # Optional CMS model overrides
    presets/                    # User preset files (auto-discovered by presetsDir)
    .env                        # Your credentials + table/bucket names (gitignored)
    .env.example                # Template to copy from

transformers/                   # Your custom record transformers
presets/                        # Shared presets (across projects)
features/                       # Custom DI features (advanced)
```

Duplicate the `projects/<env-name>/` folder for each environment — each has its own `.env` so credentials stay isolated.

## Writing configs and presets

Two Claude skills ship with this project (`.claude/skills/`) and activate automatically when you ask Claude for help:

- **`writing-data-transfer-config`** — when editing a `config.ts`.
- **`writing-data-transfer-preset`** — when editing a preset file under `presets/`.

Both include:

- The exact shapes `createConfig` / `createTransferPreset` accept.
- `fromEnv` / `numberFromEnv` / `fromAwsProfile` usage.
- Source/target collision + whitespace-trimming rules (both built into the Zod validators).
- Pipeline filter order, first-match-wins semantics, silent-drop behavior for unmatched records.

If you're writing code by hand, the same info lives in the skill markdown files under `.claude/skills/writing-data-transfer-{config,preset}/SKILL.md`.

## Running a transfer

### First-time setup — guided wizard

Run `yarn transfer` (no `--config`) to launch the **guided setup wizard**:

```bash
yarn transfer
```

The wizard:

1. Asks which project to set up (from `projects/`).
2. Validates Webiny output or Pulumi state JSON files you drop in `projects/<name>/`.
3. Writes `.env` from the template and exits.

**Before running the wizard, place one of these in `projects/<name>/`:**

- `source.webiny.json` + `target.webiny.json` — output of `yarn webiny output core --json` from each Webiny project.
- `source.pulumi.json` + `target.pulumi.json` — Pulumi state file at `.pulumi/apps/core/.pulumi/stacks/core/<env>.json`. Mixed formats are allowed.

After reviewing the written `.env`, run `yarn transfer` again. With `.env` present and no JSON files, the wizard skips to config selection and runs the transfer.

### Direct run (skip wizard)

```bash
# One config covers everything; the preset determines which storage operations run.
# The wizard selects the preset at runtime, or pass --preset directly:
yarn transfer --config=./projects/example/config.ts --preset=v5-to-v6-ddb
yarn transfer --config=./projects/example/config.ts --preset=v5-to-v6-os
```

Always run DDB before OS — OS depends on models + tenants written by the DDB transfer.

## Verifying configs before a real run

A misconfigured transfer can destroy production data. The Zod schema in `createConfig` already rejects:

- Same S3 bucket on both sides (would overwrite source files).
- Same region + same DDB/OS-DDB table name (would read and write to the same table).
- Whitespace-only or empty string values.
- Leading/trailing whitespace on any field (auto-trimmed — catches paste errors).

Build-time validation still leaves room for semantic mistakes. Before running against prod, at minimum:

1. Dry-run against a sandbox account first.
2. Confirm `SOURCE_*` and `TARGET_*` values in `.env` are **actually different** by eye.
3. Scan the target region's tables via the AWS console to confirm the target table name doesn't already hold data you care about.

## Docs

- `@webiny/data-transfer` package README — on npm and in `node_modules/@webiny/data-transfer/README.md`.
- The two skills above for hands-on guidance.
