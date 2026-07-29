# `@webiny/data-transfer`

A data-transfer tool for Webiny environments. Copies DynamoDB, S3, and OpenSearch records between AWS accounts with optional transformer chains.

## Use cases

- **v5 to v6 migration** — built-in presets handle the full migration pipeline.
- **Prod to dev seeding** — zero transformers, just copy data as-is.
- **Custom transfers** — author your own transformers, pipelines, and presets.

## Getting started

```bash
npx @webiny/data-transfer my-transfer
cd my-transfer
```

This scaffolds a new project with a `config.ts`, example preset, and everything wired up. The wizard walks you through credentials, preset selection, and transfer execution:

```bash
yarn transfer
```

### Manual setup

If you prefer to set up manually:

```bash
yarn add @webiny/data-transfer
```

Then create a `config.ts`:

```typescript
import { createConfig, fromAwsProfile, loadEnv } from "@webiny/data-transfer";

loadEnv(import.meta.url);

export default createConfig({
    source: {
        dynamodb: { table: "Source-Table", region: "us-east-1" },
        credentials: fromAwsProfile("source-profile"),
    },
    target: {
        dynamodb: { table: "Target-Table", region: "eu-central-1" },
        credentials: fromAwsProfile("target-profile"),
    },
    pipeline: {
        preset: "copy-ddb",
    },
});
```

Run it:

```bash
yarn webiny-data-transfer --config=./config.ts --preset=copy-ddb
```

### Upgrading

```bash
yarn up @webiny/data-transfer
```

The scaffolded project depends on `@webiny/data-transfer` via a caret range, so minor and patch updates are picked up automatically.

## Built-in presets

| Preset         | Description                                                                     |
| -------------- | ------------------------------------------------------------------------------- |
| `v5-to-v6-ddb` | Full Webiny v5 to v6 migration of the primary DynamoDB table                    |
| `v5-to-v6-os`  | Migration of the OpenSearch companion DynamoDB table (run after `v5-to-v6-ddb`) |
| `copy-ddb`     | Verbatim DynamoDB + S3 copy (no transformations)                                |
| `copy-os`      | Verbatim OpenSearch companion table copy (no transformations)                   |
| `copy-files`   | S3-only file copy                                                               |

Custom presets placed in your project's `presets/` directory are listed alongside built-ins.

## Documentation

- [Config reference](docs/guides/config-reference.md) — `config.ts` setup, env helpers, credentials, IAM permissions, tuning, debug options
- [Commands](docs/guides/commands.md) — guided wizard, direct `--config` runs, `init`, `init-project`, `--segments`
- [Writing presets](docs/guides/writing-presets.md) — preset shape, pipeline builder, filters, multi-pipeline patterns
- [Writing transformers](docs/guides/writing-transformers.md) — transformer factories, context types, processor slices, built-ins
- [Extending built-in presets](docs/guides/pipeline-customizer.md) — PipelineCustomizer, `setup.ts`, custom DI
- [Pipeline runtime](docs/guides/pipeline-runtime.md) — merge groups, first-match-wins, unmatched records, hooks
- [Troubleshooting](docs/guides/troubleshooting.md) — common issues and fixes

## Development

```bash
git clone git@github.com:webiny/data-transfer.git
cd data-transfer
yarn install
yarn full    # format, lint, typecheck, test, coverage
yarn build   # compile to dist/
```

## License

MIT
