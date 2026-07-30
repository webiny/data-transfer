# Data Transfer Project

This project uses [`@webiny/data-transfer`](https://www.npmjs.com/package/@webiny/data-transfer) to move DynamoDB, S3, and OpenSearch data between Webiny environments.

## Layout

```
projects/                # one folder per environment pair
  <name>/
    config.ts            # source/target AWS config
    .env                 # credentials (gitignored)
    models/              # CMS model overrides (optional)
presets/                 # custom presets (auto-discovered alongside built-ins)
transformers/            # custom record transformers
```

Each project folder is an independent environment pair with its own `.env`.

## Built-in presets

`v5-to-v6-ddb`, `v5-to-v6-os`, `copy-ddb`, `copy-os`, `copy-files` — shipped with the package, always available. For v5 to v6 migration, run `v5-to-v6-ddb` first, then `v5-to-v6-os`.

## Claude skills

Two skills ship with this project (`.claude/skills/`):

- **writing-data-transfer-config** — help with `config.ts`
- **writing-data-transfer-preset** — help with preset files

## Running

```bash
yarn transfer                                                    # guided wizard
yarn transfer --config=./projects/my-env/config.ts --preset=copy-ddb  # direct run
```
