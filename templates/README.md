# Webiny Data Transfer

Transfer data between Webiny environments.

## Setup

```bash
cp .env.example .env    # fill in your AWS config
```

## Usage

```bash
yarn transfer                                           # guided wizard
yarn transfer --config=./config.ts --preset=copy-ddb    # direct run
```

## Project structure

```
config.ts           # main config — source/target AWS settings
.env                # credentials + table/bucket names (gitignored)
presets/             # your custom presets (auto-discovered)
transformers/        # your custom transformers
models/              # CMS model overrides (optional)
```

## Built-in presets

| Preset       | Description                        |
| ------------ | ---------------------------------- |
| `copy-ddb`   | Verbatim DynamoDB + S3 copy        |
| `copy-os`    | Verbatim OpenSearch companion copy |
| `copy-files` | S3-only file copy                  |

Custom presets in `presets/` are listed alongside built-ins.

## Docs

See the `@webiny/data-transfer` [documentation](https://www.npmjs.com/package/@webiny/data-transfer).
