# Webiny Data Transfer

Transfer Webiny data between environments.

## Getting Started

### 1. Install dependencies

```bash
yarn install
```

### 2. Configure a project

Copy the example project and fill in your values:

```bash
cp -r projects/example projects/my-project
cp projects/my-project/.env.example projects/my-project/.env
```

Edit `projects/my-project/.env` with your region, table, and bucket names. AWS credentials come from `~/.aws/credentials` — set `SOURCE_PROFILE` / `TARGET_PROFILE` if you want a non-default profile.

### 3. Run the DynamoDB transfer

```bash
yarn transfer --config=./projects/my-project/ddb.transfer.config.ts
```

### 4. Run the OpenSearch transfer (if applicable)

```bash
yarn transfer --config=./projects/my-project/os.transfer.config.ts
```

Always run the DDB transfer first, then the OS transfer.

## Project Structure

```
projects/           Per-project configs and .env files
transformers/       Custom record transformers
presets/            Custom pipeline presets
features/           Custom DI features
```

## Multiple Projects

Duplicate the `projects/example/` folder for each environment you want to transfer:

```
projects/
  production/
    ddb.transfer.config.ts
    os.transfer.config.ts
    .env
  staging/
    ddb.transfer.config.ts
    os.transfer.config.ts
    .env
```

Each project has its own `.env` file so credentials are isolated.

## Configuration

### DDB Transfer

The DDB config transfers all DynamoDB records (CMS entries, models, security, file manager, settings) and S3 files.

See `projects/example/ddb.transfer.config.ts` for the full template.

### OS Transfer

The OS config transfers CMS entries from the OpenSearch DynamoDB table. It decompresses gzipped records, applies transformations, and writes to the target OS DynamoDB table.

See `projects/example/os.transfer.config.ts` for the full template.

### Pipeline Options

- `preset` - File path to your preset, resolved relative to the config file's directory (e.g. `"./presets/my-preset.ts"` or `"../../presets/example.ts"`). No built-in presets ship with the package — author your own.
- `segments` - Number of parallel workers for scanning (default: 1)
- `modelsDir` - Path to a directory with custom CMS model JSON files (optional). Resolved relative to the config file's directory.

## Writing a Custom Preset

The package ships with starter files so you can compose your own transfer:

- `transformers/stampMigratedAt.ts` — a minimal custom transformer (plain function mutating `ctx.record`).
- `presets/example.ts` — a minimal preset that registers one pipeline using the transformer.
- `projects/example/custom.transfer.config.ts` — a config pointing at the custom preset above.

Run it:

```bash
yarn transfer --config=./projects/example/custom.transfer.config.ts
```

A preset is an object:

```typescript
import type { MigrationPreset } from "@webiny/data-transfer";
import { DdbScanner, DdbProcessor, S3Processor } from "@webiny/data-transfer";

const preset: MigrationPreset = {
  name: "my",
  description: "...",
  configure({ runner, pipelineBuilderFactory }) {
    const myPipeline = pipelineBuilderFactory
      .create({
        name: "my-pipeline",
        scanner: DdbScanner,
        processors: [DdbProcessor] // add S3Processor too if any
        // transformer uses ctx.copyFile / ctx.getFile
      })
      .use(myTransformer) // optional; chain as many as you want
      // .filter(createFilter(...))       // optional; chain as many as you want
      .build();

    runner.register(myPipeline);
  }
};

export default preset;
```

The `configure` callback also receives `container` — the DI container — if you
need to `container.resolve(...)` a custom service you registered in `setup.ts`.

The `processors: [...]` array is the set of processors whose slices are merged
onto the transformer context. `DdbProcessor` contributes `ctx.putRecord(...)`;
`S3Processor` contributes `ctx.copyFile(...)` + `ctx.getFile(...)`; `OsProcessor`
contributes `ctx.putRecord(...)` for the OpenSearch lane. Include every
processor whose helpers your transformers reach for on `ctx`.

**Zero transformers is valid** — a pipeline with no `.filter()` and no `.use()` accepts every record and emits it verbatim (pure data copy). Useful for prod-to-dev seeding.

## Custom DI Wiring: `setup.ts`

If you want to register your own processors / features / bindings into the DI
container, drop a `setup.ts` file next to your transfer config:

```typescript
// projects/my-project/setup.ts
import { initDataTransfer } from "@webiny/data-transfer";
import { MyCustomProcessor } from "../../features/MyCustomProcessor.ts";

export default initDataTransfer(async ({ container }) => {
  container.register(MyCustomProcessor);
});
```

The CLI picks it up automatically and runs it **before** loading your preset,
so the preset can `container.resolve(...)` anything you registered. The file
is optional — delete it if you don't need custom DI wiring.

## Security

- `.env` files are gitignored and must never be committed
- Each project has its own `.env` for credential isolation
- Use IAM roles with minimal required permissions
