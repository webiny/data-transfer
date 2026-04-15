# DynamoDB + OpenSearch Storage Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `"ddb-os"` storage mode so the migration tool writes to both the primary DynamoDB table and the OpenSearch DynamoDB table (which triggers a Lambda that syncs into ES/OS), with lifecycle hooks to disable/enable ES indexing around the migration.

**Architecture:** The user config uses a discriminated union on `storage` field (`"ddb"` | `"ddb-os"`). When `"ddb-os"`, TypeScript enforces that `target.opensearch` (endpoint, tableName, auth) is provided -- the compiler catches missing config, not just runtime validation. Config is validated at runtime with Zod; types are inferred from schemas (`src/config/validation.ts`). The main CLI process connects to the target OpenSearch cluster via `createOpenSearchClient` from `src/opensearch/client.ts` (wrapping `@opensearch-project/opensearch`) to disable refresh before migration and re-enable it after. Worker processes write transformed records to both the primary table (via `putPrimaryRecord`) and the OS DDB table (via `putOsRecord`) -- both emit standard `PUT_RECORD` commands targeting different tables, so the executor needs no changes. Internally, `MigrationConfig` carries an optional `opensearch` object; its presence is the runtime equivalent of `"ddb-os"` mode.

**Tech Stack:** TypeScript, Zod (schema validation + type inference), `@opensearch-project/opensearch` (Client + AwsSigv4Signer), Vitest

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/config/validation.ts` | Zod schemas for full config. Exports inferred types: `MigrationConfiguration`, `DdbMigrationConfiguration`, `DdbOsMigrationConfiguration`, `AccountConfiguration`, `TargetAccountConfiguration`, `StorageType` |
| `src/opensearch/client.ts` | Already created. Client factory using `@opensearch-project/opensearch` with explicit auth (basic or AWS SigV4). Exports `Client`, `OpenSearchAuth`, `createOpenSearchClient(endpoint, auth)`. |
| `src/opensearch/lifecycle.ts` | `OpenSearchBeforeMigration` and `OpenSearchAfterMigration` -- disable/restore refresh_interval on all target indexes |
| `__tests__/config-ddb-os.test.ts` | Config validation tests for ddb and ddb-os storage modes |
| `__tests__/put-os-record.test.ts` | Tests for `putOsRecord` context method |
| `__tests__/opensearch-lifecycle.test.ts` | Tests for before/after migration lifecycle hooks |

### Modified files

| File | What changes |
|------|-------------|
| `src/config/types.ts` | Remove `MigrationConfiguration` interface. Re-export types from `validation.ts`. Keep `AwsCredentials` if used elsewhere. |
| `src/config/loader.ts` | Replace manual `validateConfig` with Zod `schema.parse()`. Import schema from `validation.ts`. |
| `src/core/types.ts` | Add optional `opensearch?: { endpoint: string; targetTable: string }` to `MigrationConfig` |
| `src/core/context.ts` | Implement `putOsRecord` -- emit `PUT_RECORD` targeting `config.opensearch.targetTable` |
| `src/cli.ts` | Log OS config when present; run lifecycle hooks in main process |
| `src/process-segment.ts` | Pass `opensearch` from user config into `MigrationConfig` |

### Files NOT changed

| File | Why |
|------|-----|
| `src/core/executor.ts` | `putOsRecord` emits standard `PUT_RECORD` commands with the OS table name; executor already groups by table -- no changes needed |
| `src/core/runner.ts` | Runner processes pipelines; storage mode is irrelevant to it |
| `src/presets/v5-to-v6.ts` | Preset registers pipelines; OS record writing happens inside individual transformers later |
| All existing `__tests__/*.test.ts` | `opensearch` is optional on `MigrationConfig` -- existing tests compile and pass without changes |

---

## Task 1: Zod schemas + config validation

**Files:**
- Create: `src/config/validation.ts`
- Modify: `src/config/types.ts`
- Modify: `src/config/loader.ts`
- Test: `__tests__/config-ddb-os.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/config-ddb-os.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config/loader.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  MigrationConfiguration,
  DdbMigrationConfiguration,
  DdbOsMigrationConfiguration
} from "../src/config/validation.ts";

describe("config validation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "migration-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(config: object): string {
    const filePath = join(tmpDir, "config.ts");
    writeFileSync(filePath, `export default ${JSON.stringify(config, null, 2)};`);
    return filePath;
  }

  it("should accept valid ddb config", async () => {
    const configPath = writeConfig({
      storage: "ddb",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" }
      },
      migration: { preset: "v5-to-v6" }
    });

    const config = await loadConfig(configPath);
    expect(config.storage).toBe("ddb");
  });

  it("should accept valid ddb-os config with basic auth", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          endpoint: "https://es.example.com",
          tableName: "tgt-es",
          auth: { type: "basic", username: "admin", password: "admin" }
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    const config = await loadConfig(configPath);
    expect(config.storage).toBe("ddb-os");
  });

  it("should accept valid ddb-os config with AWS auth", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          endpoint: "https://search-xxx.eu-central-1.es.amazonaws.com",
          tableName: "tgt-es",
          auth: {
            type: "aws",
            region: "eu-central-1",
            service: "opensearch",
            accessKeyId: "AKIA...",
            secretAccessKey: "secret"
          }
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    const config = await loadConfig(configPath);
    expect(config.storage).toBe("ddb-os");
  });

  it("should reject missing storage field", async () => {
    const configPath = writeConfig({
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject invalid storage type", async () => {
    const configPath = writeConfig({
      storage: "invalid",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject ddb-os without target.opensearch", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject ddb-os with missing opensearch.endpoint", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          tableName: "tgt-es",
          auth: { type: "basic", username: "admin", password: "admin" }
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject ddb-os with missing opensearch.auth", async () => {
    const configPath = writeConfig({
      storage: "ddb-os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        s3: { bucket: "src-bucket" }
      },
      target: {
        region: "eu-central-1",
        dynamodb: { tableName: "tgt" },
        s3: { bucket: "tgt-bucket" },
        opensearch: {
          endpoint: "https://es.example.com",
          tableName: "tgt-es"
        }
      },
      migration: { preset: "v5-to-v6" }
    });

    await expect(loadConfig(configPath)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/config-ddb-os.test.ts`
Expected: FAIL -- `validation.ts` doesn't exist, `loadConfig` doesn't use Zod yet.

- [ ] **Step 3: Create Zod schemas in `src/config/validation.ts`**

```typescript
// src/config/validation.ts
import { z } from "zod";

// ============================================================================
// Auth Schemas
// ============================================================================

const basicAuthSchema = z.object({
  type: z.literal("basic"),
  username: z.string(),
  password: z.string()
});

const awsAuthSchema = z.object({
  type: z.literal("aws"),
  region: z.string(),
  service: z.enum(["opensearch", "opensearch-serverless"]),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string().optional()
});

const opensearchAuthSchema = z.discriminatedUnion("type", [
  basicAuthSchema,
  awsAuthSchema
]);

// ============================================================================
// Shared Schemas
// ============================================================================

const awsCredentialsSchema = z.object({
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string().optional()
});

const accountConfigSchema = z.object({
  region: z.string(),
  credentials: awsCredentialsSchema.optional(),
  dynamodb: z.object({ tableName: z.string() }),
  s3: z.object({ bucket: z.string() })
});

const opensearchTargetConfigSchema = z.object({
  endpoint: z.string().url(),
  tableName: z.string(),
  auth: opensearchAuthSchema
});

const targetAccountConfigSchema = accountConfigSchema.extend({
  opensearch: opensearchTargetConfigSchema
});

const migrationSettingsSchema = z.object({
  preset: z.string(),
  segments: z.number().int().positive().optional(),
  modelsDir: z.string().optional()
});

// ============================================================================
// Discriminated Union
// ============================================================================

const ddbConfigSchema = z.object({
  storage: z.literal("ddb"),
  source: accountConfigSchema,
  target: accountConfigSchema,
  migration: migrationSettingsSchema
});

const ddbOsConfigSchema = z.object({
  storage: z.literal("ddb-os"),
  source: accountConfigSchema,
  target: targetAccountConfigSchema,
  migration: migrationSettingsSchema
});

export const migrationConfigSchema = z.discriminatedUnion("storage", [
  ddbConfigSchema,
  ddbOsConfigSchema
]);

// ============================================================================
// Inferred Types
// ============================================================================

export type MigrationConfiguration = z.infer<typeof migrationConfigSchema>;
export type DdbMigrationConfiguration = z.infer<typeof ddbConfigSchema>;
export type DdbOsMigrationConfiguration = z.infer<typeof ddbOsConfigSchema>;
export type AccountConfiguration = z.infer<typeof accountConfigSchema>;
export type TargetAccountConfiguration = z.infer<typeof targetAccountConfigSchema>;
export type StorageType = MigrationConfiguration["storage"];
export type OpenSearchTargetConfig = z.infer<typeof opensearchTargetConfigSchema>;
```

- [ ] **Step 4: Update `src/config/types.ts` to re-export from validation**

```typescript
// src/config/types.ts
export type {
  MigrationConfiguration,
  DdbMigrationConfiguration,
  DdbOsMigrationConfiguration,
  AccountConfiguration,
  TargetAccountConfiguration,
  StorageType,
  OpenSearchTargetConfig
} from "./validation.ts";
```

- [ ] **Step 5: Update `src/config/loader.ts` to use Zod**

Replace the manual `validateConfig` function with Zod parsing:

```typescript
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { migrationConfigSchema, type MigrationConfiguration } from "./validation.ts";

export async function loadConfig(configPath: string): Promise<MigrationConfiguration> {
  const absolutePath = resolve(process.cwd(), configPath);
  const fileUrl = pathToFileURL(absolutePath).href;

  try {
    const module = await import(fileUrl);
    const config = module.default;

    if (!config) {
      throw new Error(`Config file ${configPath} must have a default export`);
    }

    return migrationConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
    }
    throw error;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run __tests__/config-ddb-os.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/config/validation.ts src/config/types.ts src/config/loader.ts __tests__/config-ddb-os.test.ts
git commit -m "feat: add Zod config validation with discriminated union for ddb/ddb-os storage"
```

---

## Task 2: MigrationConfig opensearch fields + putOsRecord

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/context.ts`
- Test: `__tests__/put-os-record.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/put-os-record.test.ts
import { describe, it, expect } from "vitest";
import { createContext } from "../src/core/context.ts";
import { MigrationConfig } from "../src/core/types.ts";
import { ModelProvider } from "../src/models/model-provider.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";

describe("putOsRecord", () => {
  const database = new MockDatabaseClient();
  const modelProvider = new ModelProvider(database, "source-table");

  it("should emit a PUT_RECORD command targeting the OS table", () => {
    const config: MigrationConfig = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider,
      opensearch: {
        endpoint: "https://es.example.com",
        targetTable: "target-os-table"
      }
    };

    const record = { PK: "T#root#CMS#CME#abc", SK: "REV#0001", TYPE: "cms.entry" };
    const ctx = createContext(record, config, database);

    ctx.putOsRecord({ PK: "OS#abc", SK: "A", data: { test: true } });

    expect(ctx.commands).toHaveLength(1);
    expect(ctx.commands[0]).toEqual({
      type: "PUT_RECORD",
      table: "target-os-table",
      record: { PK: "OS#abc", SK: "A", data: { test: true } }
    });
  });

  it("should throw when opensearch is not configured", () => {
    const config: MigrationConfig = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider
    };

    const record = { PK: "T#root#CMS#CME#abc", SK: "REV#0001", TYPE: "cms.entry" };
    const ctx = createContext(record, config, database);

    expect(() => ctx.putOsRecord({ PK: "OS#abc", SK: "A" })).toThrow("opensearch");
  });

  it("should allow mixing putPrimaryRecord and putOsRecord commands", () => {
    const config: MigrationConfig = {
      sourcePrimaryTable: "source-table",
      targetPrimaryTable: "target-table",
      sourceFmBucket: "source-bucket",
      targetFmBucket: "target-bucket",
      modelProvider,
      opensearch: {
        endpoint: "https://es.example.com",
        targetTable: "target-os-table"
      }
    };

    const record = { PK: "T#root#CMS#CME#abc", SK: "REV#0001", TYPE: "cms.entry" };
    const ctx = createContext(record, config, database);

    ctx.putPrimaryRecord({ PK: "NEW#abc", SK: "A", data: {} });
    ctx.putOsRecord({ PK: "OS#abc", SK: "A", data: {} });

    expect(ctx.commands).toHaveLength(2);
    expect(ctx.commands[0].table).toBe("target-table");
    expect(ctx.commands[1].table).toBe("target-os-table");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/put-os-record.test.ts`
Expected: FAIL -- `opensearch` does not exist on `MigrationConfig`, and `putOsRecord` throws "not yet implemented".

- [ ] **Step 3: Add opensearch to MigrationConfig**

In `src/core/types.ts`, update the `MigrationConfig` interface:

```typescript
export interface MigrationConfig {
  sourcePrimaryTable: string;
  targetPrimaryTable: string;
  sourceFmBucket: string;
  targetFmBucket: string;
  modelProvider: ModelProvider;
  sourceStorage?: StorageClient;
  /** OpenSearch config. Present when running in ddb-os mode. */
  opensearch?: {
    endpoint: string;
    targetTable: string;
  };
}
```

- [ ] **Step 4: Implement putOsRecord in context**

In `src/core/context.ts`, replace the `putOsRecord` method:

```typescript
    putOsRecord(record: Record<string, unknown>) {
      if (!config.opensearch) {
        throw new Error(
          'putOsRecord requires opensearch to be configured. Use storage "ddb-os" with target.opensearch in your config.'
        );
      }
      commands.push({
        type: "PUT_RECORD",
        table: config.opensearch.targetTable,
        record
      });
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/put-os-record.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass. Existing tests don't set `opensearch` and never call `putOsRecord`, so they are unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/context.ts __tests__/put-os-record.test.ts
git commit -m "feat: implement putOsRecord targeting the OS DynamoDB table"
```

---

## Task 3: OpenSearch client factory (already created)

`src/opensearch/client.ts` is already implemented. It exports:
- `OpenSearchBasicAuth`, `OpenSearchAwsAuth`, `OpenSearchAuth` -- auth type discriminated union
- `createOpenSearchClient(endpoint: string, auth: OpenSearchAuth): Client` -- creates client with explicit endpoint and auth (basic or AWS SigV4, supports `"opensearch"` and `"opensearch-serverless"` service types)
- `Client` is re-exported from `@opensearch-project/opensearch`

- [ ] **Step 1: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Commit**

```bash
git add src/opensearch/client.ts
git commit -m "feat: add OpenSearch client factory with basic and AWS SigV4 auth"
```

---

## Task 4: Before/After migration lifecycle hooks

**Files:**
- Create: `src/opensearch/lifecycle.ts`
- Test: `__tests__/opensearch-lifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/opensearch-lifecycle.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OpenSearchBeforeMigration,
  OpenSearchAfterMigration
} from "../src/opensearch/lifecycle.ts";

function createMockClient() {
  return {
    cat: {
      indices: vi.fn()
    },
    indices: {
      putSettings: vi.fn()
    }
  } as any;
}

describe("OpenSearchBeforeMigration", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("should disable refresh on all existing indexes", async () => {
    client.cat.indices.mockResolvedValue({
      body: [
        { index: "root-en-us-cms-entries" },
        { index: "root-en-us-fm-files" }
      ]
    });

    client.indices.putSettings.mockResolvedValue({ body: {} });

    const hook = new OpenSearchBeforeMigration(client);
    await hook.execute();

    expect(client.indices.putSettings).toHaveBeenCalledTimes(2);

    expect(client.indices.putSettings).toHaveBeenCalledWith({
      index: "root-en-us-cms-entries",
      body: { index: { refresh_interval: "-1" } }
    });

    expect(client.indices.putSettings).toHaveBeenCalledWith({
      index: "root-en-us-fm-files",
      body: { index: { refresh_interval: "-1" } }
    });
  });

  it("should handle cluster with no indexes", async () => {
    client.cat.indices.mockResolvedValue({ body: [] });

    const hook = new OpenSearchBeforeMigration(client);
    await hook.execute();

    expect(client.indices.putSettings).not.toHaveBeenCalled();
  });
});

describe("OpenSearchAfterMigration", () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it("should enable refresh on all indexes", async () => {
    client.cat.indices.mockResolvedValue({
      body: [
        { index: "root-en-us-cms-entries" },
        { index: "root-en-us-fm-files" }
      ]
    });

    client.indices.putSettings.mockResolvedValue({ body: {} });

    const hook = new OpenSearchAfterMigration(client);
    await hook.execute();

    expect(client.indices.putSettings).toHaveBeenCalledTimes(2);

    expect(client.indices.putSettings).toHaveBeenCalledWith({
      index: "root-en-us-cms-entries",
      body: { index: { refresh_interval: "1s" } }
    });

    expect(client.indices.putSettings).toHaveBeenCalledWith({
      index: "root-en-us-fm-files",
      body: { index: { refresh_interval: "1s" } }
    });
  });

  it("should handle cluster with no indexes", async () => {
    client.cat.indices.mockResolvedValue({ body: [] });

    const hook = new OpenSearchAfterMigration(client);
    await hook.execute();

    expect(client.indices.putSettings).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/opensearch-lifecycle.test.ts`
Expected: FAIL -- `OpenSearchBeforeMigration` and `OpenSearchAfterMigration` don't exist.

- [ ] **Step 3: Implement lifecycle hooks**

```typescript
// src/opensearch/lifecycle.ts
import type { Client } from "@opensearch-project/opensearch";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger();

export interface MigrationLifecycleHook {
  name: string;
  execute(): Promise<void>;
}

export class OpenSearchBeforeMigration implements MigrationLifecycleHook {
  readonly name = "opensearch:before";
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async execute(): Promise<void> {
    const { body: indexes } = await this.client.cat.indices({ format: "json" });

    if (!indexes || indexes.length === 0) {
      logger.info("No indexes found in target OpenSearch cluster.");
      return;
    }

    const indexNames = indexes.map((idx: { index: string }) => idx.index);
    logger.info(`Found ${indexNames.length} indexes: ${indexNames.join(", ")}`);

    for (const indexName of indexNames) {
      logger.info(`Disabling refresh on index: ${indexName}`);
      await this.client.indices.putSettings({
        index: indexName,
        body: { index: { refresh_interval: "-1" } }
      });
    }

    logger.info("Indexing disabled on all target indexes.");
  }
}

export class OpenSearchAfterMigration implements MigrationLifecycleHook {
  readonly name = "opensearch:after";
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async execute(): Promise<void> {
    const { body: indexes } = await this.client.cat.indices({ format: "json" });

    if (!indexes || indexes.length === 0) {
      logger.info("No indexes found in target OpenSearch cluster.");
      return;
    }

    const indexNames = indexes.map((idx: { index: string }) => idx.index);

    for (const indexName of indexNames) {
      logger.info(`Enabling refresh on index: ${indexName}`);
      await this.client.indices.putSettings({
        index: indexName,
        body: { index: { refresh_interval: "1s" } }
      });
    }

    logger.info("Indexing restored on all target indexes.");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/opensearch-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/opensearch/lifecycle.ts __tests__/opensearch-lifecycle.test.ts
git commit -m "feat: add OpenSearch before/after migration lifecycle hooks"
```

---

## Task 5: Wire storage config into CLI and process-segment

**Files:**
- Modify: `src/process-segment.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Update process-segment to pass opensearch into MigrationConfig**

In `src/process-segment.ts`, update the `migrationConfig` object. When `config.storage === "ddb-os"`, pass the opensearch config:

```typescript
  // Create migration config
  const migrationConfig: MigrationConfig = {
    sourcePrimaryTable: options.config.source.dynamodb.tableName,
    targetPrimaryTable: options.config.target.dynamodb.tableName,
    sourceFmBucket: options.config.source.s3.bucket,
    targetFmBucket: options.config.target.s3.bucket,
    modelProvider,
    sourceStorage,
    ...(options.config.storage === "ddb-os" && {
      opensearch: {
        endpoint: options.config.target.opensearch.endpoint,
        targetTable: options.config.target.opensearch.tableName
      }
    })
  };
```

- [ ] **Step 2: Update CLI to log storage mode and run lifecycle hooks**

In `src/cli.ts`, add imports at the top:

```typescript
import { createOpenSearchClient } from "./opensearch/client.ts";
import {
  OpenSearchBeforeMigration,
  OpenSearchAfterMigration
} from "./opensearch/lifecycle.ts";
```

Update the logging section:

```typescript
      logger.info("Starting migration with configuration:");
      logger.info(`  Run ID: ${runId}`);
      logger.info(`  Storage: ${config.storage}`);
      logger.info(`  Preset: ${config.migration.preset}`);
      logger.info(`  Segments: ${segments}`);
      logger.info(`  Source Region: ${config.source.region}`);
      logger.info(`  Source Table: ${config.source.dynamodb.tableName}`);
      logger.info(`  Source Bucket: ${config.source.s3.bucket}`);
      logger.info(`  Target Region: ${config.target.region}`);
      logger.info(`  Target Table: ${config.target.dynamodb.tableName}`);
      logger.info(`  Target Bucket: ${config.target.s3.bucket}`);
      if (config.storage === "ddb-os") {
        logger.info(`  OS Endpoint: ${config.target.opensearch.endpoint}`);
        logger.info(`  OS Table: ${config.target.opensearch.tableName}`);
      }
```

Update the migration execution block to run lifecycle hooks:

```typescript
      try {
        // Run before-migration hook (ddb-os only)
        if (config.storage === "ddb-os") {
          const osClient = createOpenSearchClient(
            config.target.opensearch.endpoint,
            config.target.opensearch.auth
          );
          const beforeHook = new OpenSearchBeforeMigration(osClient);
          logger.info("Running OpenSearch before-migration hook...");
          await beforeHook.execute();
        }

        // Spawn worker processes
        const workers: Promise<void>[] = [];

        for (let segment = 0; segment < segments; segment++) {
          workers.push(spawnWorker(segment, segments, runId, argv.config));
        }

        // Wait for all workers to complete
        await Promise.all(workers);

        // Run after-migration hook (ddb-os only)
        if (config.storage === "ddb-os") {
          const osClient = createOpenSearchClient(
            config.target.opensearch.endpoint,
            config.target.opensearch.auth
          );
          const afterHook = new OpenSearchAfterMigration(osClient);
          logger.info("Running OpenSearch after-migration hook...");
          await afterHook.execute();
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`Migration completed successfully in ${duration}s`);
      } catch (error) {
        logger.error({ error }, "Migration failed");
        process.exit(1);
      }
```

Note: TypeScript narrows `config.target` to `TargetAccountConfiguration` (with required `opensearch`) inside the `config.storage === "ddb-os"` branch -- no `!` assertions or optional chaining needed.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/process-segment.ts
git commit -m "feat: wire ddb-os storage config into CLI and process-segment"
```

---

## Summary

After completing all 5 tasks:

| What | Status |
|------|--------|
| Zod config validation with discriminated union | Working -- schema validates + infers types |
| `TargetAccountConfiguration` with required `opensearch` (endpoint, tableName, auth) | Working |
| `putOsRecord` on `TransformContext` | Working -- emits `PUT_RECORD` to OS DDB table |
| Executor changes | None needed -- groups by table name naturally |
| OpenSearch client via `@opensearch-project/opensearch` | Working -- explicit basic or AWS SigV4 auth |
| Before-migration: disable `refresh_interval` | Working |
| After-migration: restore `refresh_interval` | Working |
| CLI logging for OS config | Working |
| Existing tests | Unmodified, all passing |

### What's NOT in this plan (future work)

- **Index creation during migration** -- when a transformer encounters a record for an index that doesn't exist yet in the target OS, it should create the index with `refresh_interval: "-1"`. This requires the OS client to be available in worker context, and a caching layer (using `TransformContext.cache`) to avoid checking every record. The tool is designed to run multiple times, so indexes from prior runs will already exist.
- **Health checks before batch writes** -- can be added to worker processes later using the OpenSearch client if needed.
- **Transformers that call `putOsRecord`** -- individual pipeline transformers need to be updated to emit OS records alongside primary records. This depends on understanding the exact record format the ddb-to-os Lambda expects.
