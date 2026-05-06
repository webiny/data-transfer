# Transfer project

This folder is **gitignored** — credentials and env files stay local only.

## Setup

```bash
cp .env.example .env
# Edit .env — fill in region, table names, and AWS credentials
```

## Running

Run DDB transfer first, then OS. They are independent and don't share state.

```bash
# From the repo root:
yarn dev --config=./projects/{{PROJECT_NAME}}/ddb.transfer.config.ts
yarn dev --config=./projects/{{PROJECT_NAME}}/os.transfer.config.ts
```

## Config notes

### `auditLog` (DDB config)

The `target.auditLog` field is required. It defaults to `null`, which means audit
log records are dropped during transfer. To transfer them, uncomment the line in
`ddb.transfer.config.ts` and set `TARGET_AUDIT_LOGS_TABLE` in `.env`:

```
auditLog: { dynamodb: { tableName: fromEnv("TARGET_AUDIT_LOGS_TABLE") } }
```

The audit log table must be different from the main target DDB table.

### `presetsDir`

Both configs have `presetsDir: "./presets"` pre-wired. Drop `.ts` preset files
into `presets/` and reference them by filename (without extension) in `pipeline.preset`:

```ts
pipeline: { preset: "my-preset", presetsDir: "./presets" }
```

### `modelsDir`

Uncomment `modelsDir: "./models"` in the pipeline config if you need to load CMS
model JSON overrides. Required for the OS transfer when using transformers that
read model definitions. Place JSON files in `models/` — single model, array, or
Webiny admin export formats are all accepted.

### Credentials

The configs use profile-based credentials (`fromAwsProfile`). To switch to literal
credentials, replace the `credentials` line in the config:

```ts
credentials: {
    accessKeyId: fromEnv("SOURCE_AWS_ACCESS_KEY_ID"),
    secretAccessKey: fromEnv("SOURCE_AWS_SECRET_ACCESS_KEY")
}
```
