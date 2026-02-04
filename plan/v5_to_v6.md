# v5 to v6

This document highlights all changes in v6 that affect the data storage compared to v5.

Based on this document, a migration tool will be developed.

## Migration Plan

As a high-level plan, we want to build a migration tool which scans all DynamoDB records from the source table, applies changes as described in this document, and stores the new records to the target table. Records that do not have a transformer defined will be IGNORED. Dynamo table scan can be done in a parallel manner, which will dramatically speed up the overall migration.

For Elasticsearch / Opensearch systems:

1. disable ES/OS indexing
2. run the migration (this will also put data into the ddb-to-es table)
3. enable ES/OS indexing

NOTES:

- API keys will **NOT** be migrated! If keeping old API keys is a requirement, developers need to implement their own authenticator to handle existing API tokens from their v5 projects. New API tokens are prefixed with `wat_` for authentication optimization.

## DynamoDB Records

<aside>
💡

IMPORTANT: Changes described in this section are global, and affect ALL records in the system. These changes apply to all sections of this document.

</aside>

- all records in DynamoDB now have a `data` attribute, as an envelope for all application data
- `GSI_TENANT` attribute contains clean tenant ID, e.g.: `root` or `6981ece4f8a451d3750bde3e`
- locale ID was removed from all keys (primary and GSIs; example: `L#en-US` is no longer part of any key)
- `webinyVersion` attribute was dropped
- list of valid top level document attributes (all other keys need to go into `data`):
    - `PK` (required)
    - `SK` (required)
    - `GSI_TENANT` (required)
    - `GSI1_PK` (optional)
    - `GSI1_SK` (optional)
    - `GSI2_PK` (optional)
    - `GSI2_SK` (optional)
    - `TYPE` (required)
    - `data` (required)
    - `expiresAt` (optional)
    - `_ct` (used by `dynamodb-toolbox`)
    - `_et` (used by `dynamodb-toolbox`)
    - `_md` (used by `dynamodb-toolbox`)

## Headless CMS

- removed redundant `#CME#CME#` from PK (`CME` string appeared **twic**e in v5)
- entry PK:
    - before: `T#root#L#en-US#CMS#CME#CME#698262002baa500002afd371`
    - after: `T#root#CMS#CME#697fba1ee12d630002b7ad15`
- remove the revision number `#0001` (fixed values) from `data.location.folderId` attribute
- update modelIds in keys, and `modelId` attribute, using this map (old -> new):
    - `fmFile` -> `wbyFmFile`
    - `acoFolder` -> `wbyAcoFolder`
    - `acoFilter` -> `wbyAcoFilter`
    - `webinyTask` -> `wbyTask`
    - `webinyTaskLog` -> `wbyTaskLog`
    - `wby_recordLocking` -> `wbyRecordLock`

## Folders

- folder IDs no longer contain a revision id `#0001` when data is returned via API
- when querying the API, folder id input also doesn’t contain the revision id
- FLP records need to be updated to remove the `#0001` part from `data.id` and `data.parentId`
- Implement as a `Transformer`

## File Manager

### Object Storage (S3 Bucket)

- bucket object location follows this pattern: `tenants/{tenantId}/files/{fileId}/{fileName}`
- old S3 objects need to be copied to the new location

### File Metadata

- `.metadata` files are no longer created in the S3 bucket
- file metadata is stored in a global key-value store, and will be generated from file data we already have in the database
- Creating metadata records, as well as copying of S3 object, should be handled in a `FileWriter` implementation

```json
{
  "PK": "KV#global:FileManager/File/698255e9a099180002913d56/Metadata",
  "SK": "A",
  "data": {
    "key": "FileManager/File/698255e9a099180002913d56/Metadata",
    "scope": "global",
    "value": {
      "bucketKey": "tenants/root/files/698255e9a099180002913d56/image-2.jpg",
      "contentType": "image/jpeg",
      "id": "698255e9a099180002913d56",
      "size": 271223,
      "tenant": "root"
    }
  },
  "TYPE": "KeyValueStore",
  "_ct": "2026-02-03T20:09:14.187Z",
  "_et": "KeyValueStore",
  "_md": "2026-02-03T20:09:14.187Z"
}
```

### File Manager Settings

- migrate the old settings record to a new one

Before:

```json
{
  "PK": "T#root#FM#SETTINGS",
  "SK": "A",
  "data": {
    "srcPrefix": "https://d8eqa02y4s7ns.cloudfront.net/files/",
    "tenant": "root",
    "uploadMaxFileSize": 10737418240,
    "uploadMinFileSize": 0
  },
  "TYPE": "fm.settings",
  "_ct": "2025-02-14T14:19:58.794Z",
  "_et": "FM.Settings",
  "_md": "2025-02-14T14:19:58.794Z"
}
```

After:

```json
{
  "PK": "KV#root:FileManager/General",
  "SK": "A",
  "data": {
    "key": "FileManager/General",
    "scope": "root",
    "value": {
      "srcPrefix": "https://d3plr9a7hza9tk.cloudfront.net/files/",
      "uploadMaxFileSize": 10737418240,
      "uploadMinFileSize": 0
    }
  },
  "TYPE": "KeyValueStore",
  "_ct": "2026-02-01T19:11:21.832Z",
  "_et": "KeyValueStore",
  "_md": "2026-02-01T19:11:21.832Z"
}
```

## Mailer Settings

- migrate the old settings record to a new one
- there is only one mailer settings entry, identified by `{ modelId: "mailerSettings", SK: "L" }`
- if found, copy its `values` object into the new record

Before:

```json
{
  "SK": "L",
  "modelId": "mailerSettings",
  "values": {
    "from": "noreply@hostname.com",
    "host": "hostname.com",
    "password": "U2FsdGVkX1/6k2xNUKb2oeQD+570saZOZyYGKpo+0PI=",
    "port": 8000,
    "replyTo": "reply@hostname.com",
    "user": "user1"
  }
}
```

After:

```json
{
  "PK": "KV#root:Mailer/Settings/Transport",
  "SK": "A",
  "data": {
    "key": "Mailer/Settings/Transport",
    "scope": "root",
    "value": {
      "from": "noreply@hostname.com",
      "host": "hostname.com",
      "password": "U2FsdGVkX1/6k2xNUKb2oeQD+570saZOZyYGKpo+0PI=",
      "port": 8000,
      "replyTo": "reply@hostname.com",
      "user": "user1"
    }
  },
  "TYPE": "KeyValueStore",
  "_ct": "2026-02-01T19:11:21.832Z",
  "_et": "KeyValueStore",
  "_md": "2026-02-01T19:11:21.832Z"
}
```

## Security Roles

Before:

```json
{
 "PK": "T#root#GROUP#6983019b5119180002ccf5ee",
 "SK": "A",
 "createdBy": {
  "displayName": "Pavel Denisjuk",
  "id": "67af5108ac973600020bb056",
  "type": "admin"
 },
 "createdOn": "2026-02-04T08:21:47.519Z",
 "description": "Test role",
 "GSI1_PK": "T#root#GROUPS",
 "GSI1_SK": "test-role-1",
 "id": "6983019b5119180002ccf5ee",
 "name": "Test Role #1",
 "permissions": [
  {
   "name": "security.*"
  },
  {
   "name": "adminUsers.*"
  }
 ],
 "slug": "test-role-1",
 "system": false,
 "tenant": "root",
 "TYPE": "security.group",
 "webinyVersion": "0.0.0",
 "_ct": "2026-02-04T08:21:47.520Z",
 "_et": "SecurityGroup",
 "_md": "2026-02-04T08:21:47.520Z"
}
```

After:

```json
{
  "PK": "T#root#ROLE#69807cccb4514900020cfe09",
  "SK": "A",
  "data": {
    "createdBy": {
      "displayName": "Pavel Denisjuk",
      "id": "697fa558f0f6060002d6c10a",
      "type": "admin"
    },
    "createdOn": "2026-02-02T10:30:36.880Z",
    "description": null,
    "id": "69807cccb4514900020cfe09",
    "name": "Content Editor",
    "permissions": [
      {
        "name": "security.*"
      },
      {
        "name": "adminUsers.*"
      }
    ],
    "plugin": false,
    "slug": "content-editor",
    "system": false,
    "tenant": "root"
  },
  "GSI1_PK": "T#root#ROLES",
  "GSI1_SK": "content-editor",
  "GSI_TENANT": "root",
  "TYPE": "security.role",
  "_ct": "2026-02-02T10:44:21.026Z",
  "_et": "SecurityRole",
  "_md": "2026-02-02T10:44:21.026Z"
}
```

## Execution

### Main Script

- a CLI app using `yargs`
- `--segments` parameter controls how many segments (parallel processes) will be used to scan Dynamo table
- for each segment, a child process is spawned in a separate process, using `execa` library
- the child process runs the same app, but a different command, e.g.: `worker`
- both main script and worker script compose the same app. Main script will process `BeforeMigration` and `AfterMigration` abstractions

### Worker Script

- Init phase:
    - fetch all tenants using `GSI1_PK=TENANTS`
    - for each tenant, fetch default locale: `T#{tenantId}#I18N#L#D`
- Processing phase:
    - only process records for the default locale
    - run a SCAN on the entire table
    - each record needs to go through a filter and transformation pipeline
    - if a record contains a locale code (`T#{tenantId}#L#`), make sure it’s a default locale (otherwise skip)
    

## Architecture

- composes the main app based on the CLI parameters
    - if ES/OS - disable indexing (and re-enable when finished); this is determined with `--storage=ddb` or `--storage=ddb-es`, and is implemented via `BeforeMigration` and `AfterMigration` abstractions
- each record type we want to process needs to have its own pipeline defined

Sample implementation code:

```json
// ============================================================================
// Commands - represent deferred side effects
// ============================================================================

interface PutRecordCommand {
  type: "PUT_RECORD";
  table: string;
  record: Record<string, unknown>;
}

interface UpdateRecordCommand {
  type: "UPDATE_RECORD";
  table: string;
  key: { PK: string; SK: string };
  updates: Record<string, unknown>;
}

interface DeleteRecordCommand {
  type: "DELETE_RECORD";
  table: string;
  key: { PK: string; SK: string };
}

interface S3CopyCommand {
  type: "S3_COPY";
  sourceBucket: string;
  sourceKey: string;
  targetBucket: string;
  targetKey: string;
}

type Command =
  | PutRecordCommand
  | UpdateRecordCommand
  | DeleteRecordCommand
  | S3CopyCommand;

// ============================================================================
// Transform Context - passed through the pipeline
// ============================================================================

interface TransformContext<TRecord = Record<string, unknown>> {
  /** Mutable working record - transformers modify this */
  record: TRecord;
  /** Original record (immutable) */
  readonly original: Readonly<TRecord>;
  /** Accumulated commands */
  readonly commands: Command[];
  /** Emit a side-effect command */
  emit(command: Command): void;
  /** Replace the working record entirely (for schema migrations) */
  replace<TNew>(newRecord: TNew): asserts this is TransformContext<TNew>;
  /** Emit an additional record (not the primary one) */
  putRecord(record: Record<string, unknown>, table?: string): void;
}

function createContext<T extends Record<string, unknown>>(
  record: T,
  defaultTable: string
): TransformContext<T> {
  const commands: Command[] = [];

  const ctx: TransformContext<any> = {
    record: structuredClone(record),
    original: Object.freeze(structuredClone(record)),
    commands,
    emit(command: Command) {
      commands.push(command);
    },
    replace(newRecord) {
      ctx.record = newRecord;
    },
    putRecord(record: Record<string, unknown>, table = defaultTable) {
      commands.push({ type: "PUT_RECORD", table, record });
    },
  };

  return ctx;
}

// ============================================================================
// Transformer Interface
// ============================================================================

interface Transformer<T = Record<string, unknown>> {
  name: string;
  transform(ctx: TransformContext<T>): void | Promise<void>;
}

// ============================================================================
// Record Filter
// ============================================================================

type RecordFilter<T = Record<string, unknown>> = (record: T) => boolean;

// ============================================================================
// Pipeline Result
// ============================================================================

interface PipelineResult {
  commands: Command[];
}

// ============================================================================
// Pipeline
// ============================================================================

class TransformPipeline<TInput extends Record<string, unknown>> {
  private transformers: Transformer<any>[] = [];
  private filters: RecordFilter<TInput>[] = [];
  private defaultTable: string;

  constructor(defaultTable: string) {
    this.defaultTable = defaultTable;
  }

  /** Add a filter - record must pass ALL filters to be processed */
  filter(predicate: RecordFilter<TInput>): this {
    this.filters.push(predicate);
    return this;
  }

  use<T>(transformer: Transformer<T>): this {
    this.transformers.push(transformer);
    return this;
  }

  /** Check if a record should be processed */
  accepts(record: TInput): boolean {
    return this.filters.every(f => f(record));
  }

  async run(record: TInput): Promise<PipelineResult | null> {
    // Skip records that don't pass filters
    if (!this.accepts(record)) {
      return null;
    }

    const ctx = createContext(record, this.defaultTable);

    for (const transformer of this.transformers) {
      await transformer.transform(ctx);
    }

    ctx.putRecord(ctx.record, this.defaultTable);

    return { commands: ctx.commands };
  }
}

// ============================================================================
// Filter Helpers
// ============================================================================

const isType = (type: string): RecordFilter =>
  (record) => record.TYPE === type;

const isModel = (modelId: string): RecordFilter =>
  (record) => record.modelId === modelId;

const isTenant = (tenant: string): RecordFilter =>
  (record) => record.tenant === tenant;

const and = <T>(...filters: RecordFilter<T>[]): RecordFilter<T> =>
  (record) => filters.every(f => f(record));

const or = <T>(...filters: RecordFilter<T>[]): RecordFilter<T> =>
  (record) => filters.some(f => f(record));

// ============================================================================
// Migration Runner
// ============================================================================

class MigrationRunner {
  private pipelines: TransformPipeline<any>[] = [];

  register(pipeline: TransformPipeline<any>): this {
    this.pipelines.push(pipeline);
    return this;
  }

  async processRecord(record: Record<string, unknown>): Promise<Command[]> {
    for (const pipeline of this.pipelines) {
      if (pipeline.accepts(record)) {
        const result = await pipeline.run(record);
        return result?.commands ?? [];
      }
    }

    // No pipeline matched - could log, throw, or return empty
    console.warn(`No pipeline matched record: ${record.PK}`);
    return [];
  }

  async processAll(records: Record<string, unknown>[]): Promise<Command[]> {
    const allCommands: Command[] = [];

    for (const record of records) {
      const commands = await this.processRecord(record);
      allCommands.push(...commands);
    }

    return allCommands;
  }
}

// ============================================================================
// Command Executor
// ============================================================================

interface ExecutorDependencies {
  dynamodb: { put: Function; update: Function; delete: Function };
  s3: { copy: Function };
}

async function executeCommands(
  commands: Command[],
  deps: ExecutorDependencies
): Promise<void> {
  for (const command of commands) {
    switch (command.type) {
      case "PUT_RECORD":
        await deps.dynamodb.put(command.table, command.record);
        break;
      case "UPDATE_RECORD":
        await deps.dynamodb.update(command.table, command.key, command.updates);
        break;
      case "DELETE_RECORD":
        await deps.dynamodb.delete(command.table, command.key);
        break;
      case "S3_COPY":
        await deps.s3.copy(
          command.sourceBucket,
          command.sourceKey,
          command.targetBucket,
          command.targetKey
        );
        break;
    }
  }
}

// ============================================================================
// Example Transformers
// ============================================================================

// Transformer 1: Update location
const updateLocation: Transformer = {
  name: "updateLocation",
  transform(ctx) {
    ctx.record.data.values["object@location"] = {
      "text@folderId": "new-folder-id",
      "text@bucket": "new-bucket",
    };
  },
};

// Transformer 2: Update file key and emit S3 copy
const updateFileKey: Transformer = {
  name: "updateFileKey",
  transform(ctx) {
    const oldKey = ctx.record.data.values["text@key"];
    const newKey = `files/${ctx.record.entryId}/${ctx.record.data.values["text@name"]}`;

    // Mutate the working record
    ctx.record.data.values["text@key"] = newKey;

    // Emit S3 copy command
    ctx.emit({
      type: "S3_COPY",
      sourceBucket: "old-bucket",
      sourceKey: oldKey,
      targetBucket: "new-bucket",
      targetKey: newKey,
    });
  },
};

// Transformer 3: Create delivery metadata (additional record)
const createDeliveryRecord: Transformer = {
  name: "createDeliveryRecord",
  transform(ctx) {
    // Reads from ctx.record which has mutations from previous transformers
    ctx.putRecord({
      PK: `DELIVERY#${ctx.record.tenant}`,
      SK: `FILE#${ctx.record.entryId}`,
      fileKey: ctx.record.data.values["text@key"], // ← has the NEW key
      contentType: ctx.record.data.values["text@type"],
      size: ctx.record.data.values["number@size"],
    }, "DeliveryTable");
  },
};

// ============================================================================
// Example Types for Settings Migration
// ============================================================================

interface OriginalFMSettings {
  PK: string;
  SK: string;
  data: {
    srcPrefix: string;
    tenant: string;
    uploadMaxFileSize: number;
    uploadMinFileSize: number;
  };
  TYPE: string;
  _ct: string;
  _et: string;
  _md: string;
}

// Transformer 4: Settings migration (full replacement)
const migrateSettings: Transformer<OriginalFMSettings> = {
  name: "migrateSettingsToKeyValue",
  transform(ctx) {
    const { tenant, ...settingsValue } = ctx.original.data;

    ctx.replace({
      PK: `KV#${tenant}:FileManager/General`,
      SK: "A",
      data: {
        key: "FileManager/General",
        scope: tenant,
        value: settingsValue,
      },
      TYPE: "KeyValueStore",
      _ct: new Date().toISOString(),
      _et: "KeyValueStore",
      _md: new Date().toISOString(),
    });

    // Delete old record
    ctx.emit({
      type: "DELETE_RECORD",
      table: "MainTable",
      key: { PK: ctx.original.PK, SK: ctx.original.SK },
    });
  },
};

// ============================================================================
// Example Usage
// ============================================================================

// Pipeline with filters
const filePipeline = new TransformPipeline<any>("MainTable")
  .filter(isType("cms.entry.l"))
  .filter(isModel("fmFile"))
  .use(updateLocation)
  .use(updateFileKey)
  .use(createDeliveryRecord);

const settingsPipeline = new TransformPipeline<OriginalFMSettings>("MainTable")
  .filter(isType("fm.settings"))
  .use(migrateSettings);

// Runner
const runner = new MigrationRunner()
  .register(filePipeline)
  .register(settingsPipeline);

// Usage:
// const commands = await runner.processAll(dynamoRecords);
// await executeCommands(commands, deps);
```

## Usage

- the app will be execute via `npx github:webiny/v5-to-v6`
- parameters:
    - `--segments`
    - `--storage` : `ddb` or `ddb-os`
    - `--sourcePrimaryTable`
    - `--targetPrimaryTable`
    - `--sourceFmBucket`
    - `--targetFmBucket`
    
    ---
    
    - `--sourceOsTable`
    - `--targetOsTable`
    - `--osEndpoint`
