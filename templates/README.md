# Webiny Data Transfer

Transfer data between Webiny environments.

## Setup

1. Copy the example project and fill in your AWS config:

```bash
cp -r projects/example projects/my-env
cp projects/my-env/.env.example projects/my-env/.env
# edit projects/my-env/.env with your credentials and table names
```

2. Run the transfer:

```bash
yarn transfer
```

The wizard discovers projects in `projects/`, asks which one to use, and which preset to run.

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
    .env.example         # template
    models/              # CMS model overrides (optional)
presets/                 # your custom presets (auto-discovered)
transformers/            # your custom transformers
```

Duplicate `projects/example/` for each environment — each has its own `.env` so credentials stay isolated.

## Presets

### Built-in (shipped with @webiny/data-transfer)

| Preset         | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `v5-to-v6-ddb` | Full Webiny v5 to v6 migration (DynamoDB + S3)                |
| `v5-to-v6-os`  | OpenSearch companion table migration (run after v5-to-v6-ddb) |
| `copy-ddb`     | Verbatim DynamoDB + S3 copy                                   |
| `copy-os`      | Verbatim OpenSearch companion copy                            |
| `copy-files`   | S3-only file copy                                             |

### Project presets (in presets/)

Custom presets in `presets/` are listed alongside built-ins. See `presets/example.ts` for a starting point.

## Docs

See the `@webiny/data-transfer` [documentation](https://www.npmjs.com/package/@webiny/data-transfer).
