# Webiny v5 to v6 Migration Tool

A TypeScript-based CLI tool for migrating Webiny v5 DynamoDB records to v6 format.

## Features

- **Parallel Processing**: Scan DynamoDB table in parallel segments for faster migration
- **Database Abstraction**: Clean interface for database operations (easy to test or replace)
- **Storage Abstraction**: S3 file copying with retry logic and concurrency control
- **Transformation Pipeline**: Composable transformers for record migration
- **Global Transformations**: All records receive required v6 changes (data envelope, GSI_TENANT, locale removal)
- **Specific Transformations**: Type-specific migrations for CMS, File Manager, Mailer, Security, and Folders
- **No Build Step**: Uses `tsx` to run TypeScript directly

## Installation

```bash
# Install dependencies
yarn install

# Make executable
chmod +x bin.js
```

## Usage

### Via npx (from GitHub)

```bash
npx github:webiny/v5-to-v6 \
  --segments=4 \
  --sourcePrimaryTable=webiny-v5-table \
  --targetPrimaryTable=webiny-v6-table \
  --sourceFmBucket=webiny-v5-files \
  --targetFmBucket=webiny-v6-files
```

### Local Development

```bash
yarn dev \
  --segments=4 \
  --sourcePrimaryTable=webiny-v5-table \
  --targetPrimaryTable=webiny-v6-table \
  --sourceFmBucket=webiny-v5-files \
  --targetFmBucket=webiny-v6-files
```

## CLI Options

- `--segments`: Number of parallel segments to process (default: 1)
- `--sourcePrimaryTable`: Source DynamoDB table name (required)
- `--targetPrimaryTable`: Target DynamoDB table name (required)
- `--sourceFmBucket`: Source S3 bucket for File Manager files (required)
- `--targetFmBucket`: Target S3 bucket for File Manager files (required)

## Architecture

### Project Structure

```
src/
├── cli.ts                      # Main CLI entry point
├── process-segment.ts          # Worker process for parallel scanning
├── core/                       # Core pipeline infrastructure
│   ├── types.ts                # Command & context types
│   ├── context.ts              # Transform context creator
│   ├── transformer.ts          # Transformer interface
│   ├── pipeline.ts             # Pipeline composition
│   ├── runner.ts               # Migration runner
│   └── executor.ts             # Command executor
├── database/                   # Database abstraction
│   ├── interface.ts            # DatabaseClient interface
│   └── dynamodb-client.ts      # DynamoDB implementation
├── storage/                    # Storage abstraction
│   ├── interface.ts            # StorageClient interface
│   └── s3-client.ts            # S3 implementation
├── filters/                    # Record filters
│   └── index.ts                # Filter helpers (isType, isModel, etc.)
├── transformers/               # Record transformers
│   ├── global/                 # Applied to ALL records
│   │   ├── wrap-in-data.ts     # Wrap in data envelope
│   │   ├── add-gsi-tenant.ts   # Add GSI_TENANT
│   │   └── remove-locale.ts    # Remove locale from keys
│   ├── cms/                    # CMS-specific transformers
│   ├── file-manager/           # File Manager transformers
│   ├── folders/                # Folder transformers
│   ├── mailer/                 # Mailer transformers
│   └── security/               # Security transformers
└── utils/                      # Utilities
    ├── logger.ts               # Logger
    └── tenants.ts              # Tenant & locale utilities
```

### How It Works

1. **Main Process**: Spawns N worker processes (one per segment)
2. **Worker Process**:
   - Fetches tenants and default locales
   - Scans its assigned DynamoDB segment
   - Filters records (only default locale)
   - Transforms matched records through pipelines
   - Executes commands (PUT records, copy S3 files)
3. **Transformation Pipeline**:
   - Records pass through filters to find matching pipeline
   - Transformers modify records in sequence
   - Commands are accumulated (PUT_RECORD, S3_COPY)
   - Executor batches and executes all commands

### Migrations Performed

#### Global (All Records)
- Wrap non-reserved attributes in `data` envelope
- Add `GSI_TENANT` attribute
- Remove locale codes from PK/SK/GSI keys
- Remove `webinyVersion` attribute

#### CMS Entries
- Remove duplicate `#CME#CME#` → `#CME#`
- Update modelIds: `fmFile` → `wbyFmFile`, etc.
- Remove `#0001` from `data.location.folderId`

#### File Manager
- Migrate settings to KeyValue format
- Create file metadata records
- Update S3 paths: `files/` → `tenants/{tenant}/files/{id}/{name}`
- Copy files to new S3 location

#### Folders
- Remove `#0001` from `data.id` and `data.parentId`

#### Mailer
- Migrate settings to KeyValue format

#### Security
- Transform `GROUP` → `ROLE` in all keys and types
- Transform `GROUPS` → `ROLES` in GSI keys

## AWS Credentials

The tool uses AWS SDK default credential chain. Ensure you have valid AWS credentials configured:

```bash
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

Or use AWS profile:

```bash
export AWS_PROFILE=my-profile
```

## Development

```bash
# Run TypeScript type checking
yarn ts-check

# Run the CLI in development mode
yarn dev --help

# Run tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run with debug logging
DEBUG=1 yarn dev ...
```

## Notes

- **API Keys**: v5 API keys will NOT be migrated (see plan for details)
- **Default Locale Only**: Only records for the default locale of each tenant are migrated
- **Skipped Records**: Records without a matching pipeline are silently skipped
- **Idempotency**: Running the migration multiple times will create duplicates (clean target table first)
- **Elasticsearch/OpenSearch**: ES/OS support will be added in a future update

## License

MIT
