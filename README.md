# `@webiny/data-transfer`

A generic data-transfer tool for Webiny environments. Copies DynamoDB + S3 (or OpenSearch) records between AWS accounts, optionally running a transformer chain on each record.

**Use cases:**

- **v5 → v6 migration** — write a preset that registers the relevant pipelines.
- **Prod → dev seeding** — zero transformers, just copy.
- **Custom transfers** — write your own transformers + pipelines + preset for bespoke data moves.

The package ships five built-in presets (`v5-to-v6-ddb`, `v5-to-v6-os`, `copy-ddb`, `copy-os`, `copy-files`) plus full authoring support for your own.

## Quick start

```bash
git clone git@github.com:webiny/data-transfer.git
cd data-transfer
yarn install
yarn transfer
```

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
