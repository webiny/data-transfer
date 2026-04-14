# Webiny v5 to v6 Migration Tool

## Usage

### Configuration File Approach

Create a migration configuration file (e.g., `migration.config.ts`):

```typescript
import { MigrationConfiguration } from "./src/config/types";

const config: MigrationConfiguration = {
  storage: "ddb", // "ddb" or "ddb-os"
  source: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!
    },
    dynamodb: { tableName: "webiny-v5-table" },
    s3: { bucket: "webiny-v5-files" }
  },
  target: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.TARGET_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.TARGET_AWS_SECRET_ACCESS_KEY!
    },
    dynamodb: { tableName: "webiny-v6-table" },
    s3: { bucket: "webiny-v6-files" }
  },
  migration: {
    preset: "v5-to-v6", // REQUIRED - use built-in preset or path to custom
    segments: 4,
    modelsDir: "./path/to/models"
  }
};

export default config;
```

Then run:

```bash
npx github:webiny/v5-to-v6 --config=./migration.config.ts
```

### Storage Modes

The `storage` field determines how data is written to the target environment:

- **`ddb`** — DynamoDB only. Records are written to the target DynamoDB table.
- **`ddb-os`** — DynamoDB + OpenSearch. Records are written to both the target DynamoDB table and the OpenSearch DynamoDB table (which triggers a Lambda that syncs data into OpenSearch/Elasticsearch).

### DynamoDB + OpenSearch (`ddb-os`) Configuration

When using `ddb-os` storage, the `target.opensearch` section is **required**:

```typescript
const config: MigrationConfiguration = {
  storage: "ddb-os",
  source: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!
    },
    dynamodb: { tableName: "webiny-v5-table" },
    s3: { bucket: "webiny-v5-files" }
  },
  target: {
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.TARGET_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.TARGET_AWS_SECRET_ACCESS_KEY!
    },
    dynamodb: { tableName: "webiny-v6-table" },
    s3: { bucket: "webiny-v6-files" },
    opensearch: {
      endpoint: "https://search-xxx.us-east-1.es.amazonaws.com",
      targetTableName: "webiny-v6-es-table",
      sourceTableName: "webiny-v5-es-table",
      service: "opensearch" // or "opensearch-serverless" for OpenSearch Serverless
    }
  },
  migration: {
    preset: "v5-to-v6",
    segments: 4
  }
};
```

The OpenSearch client uses the target account's `credentials` and `region` for AWS SigV4 signing. The `service` field defaults to `"opensearch"` (managed OpenSearch) — set it to `"opensearch-serverless"` for OpenSearch Serverless.

**Lifecycle hooks:** When running in `ddb-os` mode, the tool automatically:
1. Disables `refresh_interval` on all target OpenSearch indexes before migration starts
2. Re-enables `refresh_interval` (`1s`) on all indexes after migration completes

This prevents excessive indexing overhead during bulk data transfer.

### Migration Presets

**Built-in Presets:**
- `v5-to-v6` - Migrates all Webiny v5 data to v6 format

**Example Presets:** (see `examples/`)
- `cms-only` - Only CMS models and entries
- `cms-model-with-files` - Specific model with referenced files

### Creating Custom Presets

Custom presets use **PipelineBuilder** to configure filters and transformers. This approach separates "what to process" (filters) from "how to transform" (transformers):

```typescript
import type { MigrationPreset, MigrationConfig } from "@/src/core/types";
import { MigrationRunner } from "@/src/core/runner";
import { DatabaseClient } from "@/src/database/interface";
import { PipelineBuilder, isCmsModel, isCmsEntry } from "@/src/core/pipelines";

// Import transformers you need
import { wrapInData } from "@/src/transformers/global/wrap-in-data";
import { addGsiTenant } from "@/src/transformers/global/add-gsi-tenant";
import { removeLocale } from "@/src/transformers/global/remove-locale";
import { removeAttributes } from "@/src/transformers/global/remove-attributes";

export const publishedOnlyPreset: MigrationPreset = {
  name: "published-only",
  description: "Migrate only published CMS entries",
  configure(runner: MigrationRunner, config: MigrationConfig, database: DatabaseClient) {
    // Models pipeline
    const models = new PipelineBuilder()
      .filter(isCmsModel)
      .use(wrapInData)
      .use(addGsiTenant)
      .use(removeLocale)
      .use(removeAttributes)
      .build();

    // Published entries only
    const entries = new PipelineBuilder()
      .filter(isCmsEntry)
      .filter(record => record.status === "published")
      .use(wrapInData)
      .use(addGsiTenant)
      .use(removeLocale)
      .use(removeAttributes)
      .build();

    runner.register(models).register(entries);
  }
};
```

**Available Filters:**
- `isCmsModel`, `isCmsEntry` - CMS records
- `isFmFile`, `isFmSettings` - File Manager
- `isSecurityTeam`, `isCustomSecurityGroup` - Security
- `isFlpRecord` - Folder permissions
- `isMailerSettings` - Mailer
- `byType(type)`, `byTypePrefix(prefix)` - Generic filters

**Key Transformers:**
- `wrapInData` - MUST be first - wraps attributes in data envelope
- `addGsiTenant`, `removeLocale`, `removeAttributes` - Global transformations
- `fixCmePk`, `fixBrokenStorageKeys`, `transformRichText` - CMS-specific
- `groupsToRoles`, `transformPermissions` - Security
- `migrateFileManagerSettings`, `migrateMailerSettings` - Settings

See `src/presets/v5-to-v6.ts` for a complete example.

### Transform Context Methods

Transformers receive a `TransformContext` with these methods for emitting commands:

- `ctx.putPrimaryRecord(record)` — write a record to the target DynamoDB table
- `ctx.putOsRecord(record)` — write a record to the OpenSearch DynamoDB table (requires `ddb-os` storage mode)
- `ctx.copyFile(sourceKey, targetKey)` — copy a file between S3 buckets
- `ctx.queryRecord(pk, sk?)` — query a record from the source DynamoDB table
- `ctx.getFile(key)` — read a file from the source S3 bucket
- `ctx.replace(newRecord)` — replace the working record entirely
- `ctx.modelProvider` — access CMS model definitions
- `ctx.cache` — shared `Map` that persists across records within a migration run

## Transformations

### Global (All Records)

- Wrap non-reserved attributes in `data` envelope
- Add `GSI_TENANT` attribute
- Remove locale codes from PK/SK/GSI keys
- Remove `webinyVersion` and `tenant` attributes

### Security Groups → Roles

- Transform `security.group` → `security.role`
- Transform `GROUP` → `ROLE` in keys
- Transform `GROUPS` → `ROLES` in GSI keys
- Remove `content.i18n` permission
- Flatten `cms.contentModel` models from locale object to array
- Transform `cms.contentModelGroup` groups from IDs to slugs
- Skip full-access and anonymous roles

### Security Teams

- Wrap in data envelope
- Add `GSI_TENANT` attribute

### CMS Entries

- Remove duplicate `#CME#CME#` → `#CME#`
- Update modelIds:
  - fmFile -> `wbyFmFile`
  - acoFolder -> `wbyAcoFolder`
  - acoFilter -> `wbyAcoFilter`
  - webinyTask -> `wbyTask`
  - webinyTaskLog -> `wbyTaskLog`
  - wby_recordLocking -> `wbyRecordLock`
- Remove `#0001` from entry `data.location.folderId`
- Transform rich-text fields to Lexical format with gzip compression
- Update GSI keys to remove locale
- Fix incorrect storageIds in entries (use model definition as the source of truth)

### File Manager Files

- Update S3 paths: remove revision from path
- Create file metadata KeyValue records
- Copy files to new S3 location
- Update file entry `text@key` values

### File Manager Settings

- Migrate to KeyValue format (`KV#root:FileManager/General`)

### Folders

- Remove `#0001` from `data.id` and `data.parentId`

### Mailer Settings

- Migrate to KeyValue format (`KV#root:Mailer/Settings/Transport`)
