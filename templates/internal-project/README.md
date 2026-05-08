# Transfer project

This folder is **gitignored** — credentials and env files stay local only.

## Setup

Run the guided wizard from the repo root — it will populate your `.env` automatically:

```bash
# From the repo root:
yarn dev
```

The wizard asks which project to set up, validates your Webiny output or Pulumi state JSON files, and writes `.env`. Before running it, place one of these in this folder:

- `source.webiny.json` + `target.webiny.json` (from `yarn webiny output core --json` in each Webiny project)
- `source.pulumi.json` + `target.pulumi.json` (Pulumi state at `.pulumi/apps/core/.pulumi/stacks/core/<env>.json`)

Mixed formats are allowed. After the wizard writes `.env`, review it before running the transfer.

To set up manually instead:

```bash
cp .env.example .env
# Edit .env — fill in region, table names, and AWS credentials
```

## Running

Run DDB transfer first, then OS. They are independent and don't share state.

```bash
# From the repo root — guided (wizard selects config):
yarn dev

# Or direct:
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
