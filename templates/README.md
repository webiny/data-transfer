# Webiny Data Transfer

Transfer data between Webiny environments.

## Quick start

### 1. Create a project

```bash
cp -r projects/example projects/my-env
```

### 2. Run the guided wizard

```bash
yarn transfer
```

The wizard walks you through the full setup:

1. **Select project** — picks from `projects/` directories
2. **Import credentials** — drop your Webiny output or Pulumi state JSON files into `projects/my-env/`, and the wizard extracts regions, table names, and bucket names automatically:
   - `source.webiny.json` + `target.webiny.json` (from `yarn webiny output core --json`)
   - or `source.pulumi.json` + `target.pulumi.json` (Pulumi state files)
3. **Write .env** — the wizard populates `projects/my-env/.env` from the imported values
4. **Select preset** — choose which transfer to run (e.g., `v5-to-v6-ddb`, `copy-ddb`)
5. **Run transfer** — executes the migration

On subsequent runs, the wizard skips steps that are already done (`.env` exists, JSON files already processed) and goes straight to preset selection.

### Direct run (skip wizard)

```bash
yarn transfer --config=./projects/my-env/config.ts --preset=copy-ddb
```

## Project structure

```
projects/                # one folder per environment pair
  example/               # copy this to create a new project
    config.ts            # source/target AWS settings
    .env                 # credentials (gitignored)
    .env.example         # template for manual setup
    models/              # CMS model overrides (optional)
presets/                 # your custom presets (auto-discovered)
transformers/            # your custom transformers
```

Duplicate `projects/example/` for each environment pair — each has its own `.env` so credentials stay isolated.

## Presets

### Built-in (shipped with @webiny/data-transfer)

| Preset         | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `v5-to-v6-ddb` | Full Webiny v5 to v6 migration (DynamoDB + S3)                |
| `v5-to-v6-os`  | OpenSearch companion table migration (run after v5-to-v6-ddb) |
| `copy-ddb`     | Verbatim DynamoDB + S3 copy                                   |
| `copy-os`      | Verbatim OpenSearch companion copy                            |
| `copy-files`   | S3-only file copy                                             |

For v5 to v6 migration, run `v5-to-v6-ddb` first, then `v5-to-v6-os`.

### Custom presets (in presets/)

Custom presets in `presets/` are listed alongside built-ins. See `presets/example.ts` for a starting point.

## Documentation

- [Config reference](https://github.com/webiny/data-transfer/blob/main/docs/guides/config-reference.md) — config.ts setup, env helpers, credentials, IAM, tuning
- [Writing presets](https://github.com/webiny/data-transfer/blob/main/docs/guides/writing-presets.md) — preset shape, pipeline builder, filters, built-in presets
- [Writing transformers](https://github.com/webiny/data-transfer/blob/main/docs/guides/writing-transformers.md) — transformer factories, context types, processor slices
- [Pipeline customizer](https://github.com/webiny/data-transfer/blob/main/docs/guides/pipeline-customizer.md) — extending built-in presets
- [Pipeline runtime](https://github.com/webiny/data-transfer/blob/main/docs/guides/pipeline-runtime.md) — merge groups, first-match-wins, hooks, parallelism
- [Commands](https://github.com/webiny/data-transfer/blob/main/docs/guides/commands.md) — CLI commands and flags
- [Troubleshooting](https://github.com/webiny/data-transfer/blob/main/docs/guides/troubleshooting.md) — common issues and debugging
