# Data Transfer Project

This project uses [`@webiny/data-transfer`](https://www.npmjs.com/package/@webiny/data-transfer) to move DynamoDB, S3, and OpenSearch data between Webiny environments.

## Layout

```
config.ts           # source/target AWS config
.env                # credentials (gitignored)
presets/             # custom presets (auto-discovered by presetsDir)
transformers/        # custom record transformers
models/              # CMS model overrides (optional)
```

## Claude skills

Two skills ship with this project (`.claude/skills/`):

- **writing-data-transfer-config** — help with `config.ts`
- **writing-data-transfer-preset** — help with preset files

## Running

```bash
yarn transfer                                           # guided wizard
yarn transfer --config=./config.ts --preset=copy-ddb    # direct run
```
