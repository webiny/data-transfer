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

Edit `projects/my-project/.env` with your AWS credentials and resource names.

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

- `preset` - The transformation preset to use (e.g., `"v5-to-v6"`, `"v5-to-v6-os"`)
- `segments` - Number of parallel workers for scanning (default: 1)
- `modelsDir` - Path to a directory with custom CMS model JSON files (optional)

## Security

- `.env` files are gitignored and must never be committed
- Each project has its own `.env` for credential isolation
- Use IAM roles with minimal required permissions
