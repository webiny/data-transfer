# OpenSearch Process Segment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate `process-os-segment` that scans the source OpenSearch DynamoDB table, runs CMS entry transformations on decompressed records, then gzips results in parallel and writes them to the target OS DynamoDB table.

**Architecture:** Two separate configs (`storage: "ddb"` vs `storage: "os"`) drive two independent process-segment files. The OS segment decompresses `CmsEntriesElasticsearch` records' `data.value`, adds a derived `TYPE`, and runs the inner record through the same CMS entry pipeline as DDB. The pipeline auto-puts the transformed record as a `PUT_RECORD` command. An `executeOsCommands` function intercepts those commands, gzips all records' `data` fields in parallel via `Promise.all`, builds the OS DDB shape using outer metadata from the source record, and batch-writes to the target OS table.

**Tech Stack:** TypeScript, Zod, Vitest, existing `GzipCompression` utility

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/process-os-segment.ts` | OS table scan, decompress, process through runner, delegate to OS executor |
| `src/opensearch/executor.ts` | Gzip records in parallel, build OS DDB shape, batch write to target |
| `src/opensearch/decompress-record.ts` | Decompress OS DDB record, derive TYPE from SK, return inner record + metadata |
| `src/presets/v5-to-v6-os.ts` | OS preset — CMS entry pipeline only (no FM files, no security, no settings) |
| `__tests__/os-decompress-record.test.ts` | Tests for decompress + strip-locale-from-index |
| `__tests__/os-executor.test.ts` | Tests for gzip + OS DDB shape building |
| `__tests__/config-os.test.ts` | Tests for the new `"os"` config schema |

### Modified files

| File | What changes |
|------|-------------|
| `src/config/validation.ts` | Rewrite schemas: `"ddb"` keeps current shape, `"os"` gets new source/target shape |
| `src/config/types.ts` | Update re-exports for new type names |
| `src/core/preset-loader.ts` | Register `"v5-to-v6-os"` built-in preset |
| `src/cli.ts` | Add `process-os-segment` command, route workers by storage type, lifecycle hooks for `"os"` only |
| `src/process-segment.ts` | Remove stale `"ddb-os"` opensearch spread |

### Files NOT changed

| File | Why |
|------|-----|
| `src/core/pipeline.ts` | No `skipAutoPut` needed — pipeline auto-put is used, executor handles the rest |
| `src/core/runner.ts` | Runner unchanged |
| `src/core/context.ts` | Context unchanged |
| `src/core/executor.ts` | DDB executor unchanged — OS has its own executor |
| `src/presets/v5-to-v6.ts` | DDB preset untouched |
| `src/presets/v5-to-v6/*.ts` | Existing pipeline classes untouched |

---

## Task 1: Rewrite Zod config schemas

**Files:**
- Modify: `src/config/validation.ts`
- Modify: `src/config/types.ts`
- Modify: `src/process-segment.ts` (remove stale opensearch spread)
- Create: `__tests__/config-os.test.ts`
- Delete: `__tests__/config-ddb-os.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/config-os.test.ts`:

```typescript
// __tests__/config-os.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config/loader.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

  it("should accept valid os config", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: {
        region: "eu-central-1",
        credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
        dynamodb: { tableName: "src-primary" },
        opensearch: { tableName: "src-es" }
      },
      target: {
        region: "eu-central-1",
        credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
        opensearch: {
          endpoint: "https://search-xxx.eu-central-1.es.amazonaws.com",
          tableName: "tgt-es",
          service: "opensearch"
        }
      },
      migration: { preset: "v5-to-v6-os" }
    });

    const config = await loadConfig(configPath);
    expect(config.storage).toBe("os");
  });

  it("should accept os config with opensearch-serverless", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src-primary" },
        opensearch: { tableName: "src-es" }
      },
      target: {
        region: "eu-central-1",
        opensearch: {
          endpoint: "https://xxx.eu-central-1.aoss.amazonaws.com",
          tableName: "tgt-es",
          service: "opensearch-serverless"
        }
      },
      migration: { preset: "v5-to-v6-os" }
    });

    const config = await loadConfig(configPath);
    if (config.storage === "os") {
      expect(config.target.opensearch.service).toBe("opensearch-serverless");
    }
  });

  it("should reject missing storage field", async () => {
    const configPath = writeConfig({
      source: { region: "eu-central-1", dynamodb: { tableName: "s" }, s3: { bucket: "b" } },
      target: { region: "eu-central-1", dynamodb: { tableName: "t" }, s3: { bucket: "b" } },
      migration: { preset: "v5-to-v6" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject invalid storage type", async () => {
    const configPath = writeConfig({
      storage: "invalid",
      source: { region: "eu-central-1", dynamodb: { tableName: "s" }, s3: { bucket: "b" } },
      target: { region: "eu-central-1", dynamodb: { tableName: "t" }, s3: { bucket: "b" } },
      migration: { preset: "v5-to-v6" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject os config without source.opensearch", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: { region: "eu-central-1", dynamodb: { tableName: "src" } },
      target: {
        region: "eu-central-1",
        opensearch: { endpoint: "https://es.example.com", tableName: "tgt-es", service: "opensearch" }
      },
      migration: { preset: "v5-to-v6-os" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject os config without source.dynamodb", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: { region: "eu-central-1", opensearch: { tableName: "src-es" } },
      target: {
        region: "eu-central-1",
        opensearch: { endpoint: "https://es.example.com", tableName: "tgt-es", service: "opensearch" }
      },
      migration: { preset: "v5-to-v6-os" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject os config without target.opensearch", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        opensearch: { tableName: "src-es" }
      },
      target: { region: "eu-central-1" },
      migration: { preset: "v5-to-v6-os" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should reject os config without target.opensearch.service", async () => {
    const configPath = writeConfig({
      storage: "os",
      source: {
        region: "eu-central-1",
        dynamodb: { tableName: "src" },
        opensearch: { tableName: "src-es" }
      },
      target: {
        region: "eu-central-1",
        opensearch: { endpoint: "https://es.example.com", tableName: "tgt-es" }
      },
      migration: { preset: "v5-to-v6-os" }
    });
    await expect(loadConfig(configPath)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/config-os.test.ts`
Expected: FAIL — `"os"` storage type not recognized.

- [ ] **Step 3: Rewrite `src/config/validation.ts`**

```typescript
import { z } from "zod";

// ============================================================================
// Shared Schemas
// ============================================================================

const awsCredentialsSchema = z.object({
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string().optional()
});

const migrationSettingsSchema = z.object({
  preset: z.string(),
  segments: z.number().int().positive().optional(),
  modelsDir: z.string().optional()
});

// ============================================================================
// DDB Account Schema
// ============================================================================

const ddbAccountConfigSchema = z.object({
  region: z.string(),
  credentials: awsCredentialsSchema.optional(),
  dynamodb: z.object({ tableName: z.string() }),
  s3: z.object({ bucket: z.string() })
});

// ============================================================================
// OS Account Schemas
// ============================================================================

const osSourceAccountConfigSchema = z.object({
  region: z.string(),
  credentials: awsCredentialsSchema.optional(),
  dynamodb: z.object({ tableName: z.string() }),
  opensearch: z.object({ tableName: z.string() })
});

const osTargetAccountConfigSchema = z.object({
  region: z.string(),
  credentials: awsCredentialsSchema.optional(),
  opensearch: z.object({
    endpoint: z.url(),
    tableName: z.string(),
    service: z.enum(["opensearch", "opensearch-serverless"])
  })
});

// ============================================================================
// Discriminated Union
// ============================================================================

const ddbConfigSchema = z.object({
  storage: z.literal("ddb"),
  source: ddbAccountConfigSchema,
  target: ddbAccountConfigSchema,
  migration: migrationSettingsSchema
});

const osConfigSchema = z.object({
  storage: z.literal("os"),
  source: osSourceAccountConfigSchema,
  target: osTargetAccountConfigSchema,
  migration: migrationSettingsSchema
});

export const migrationConfigSchema = z.discriminatedUnion("storage", [
  ddbConfigSchema,
  osConfigSchema
]);

// ============================================================================
// Inferred Types
// ============================================================================

export type MigrationConfiguration = z.infer<typeof migrationConfigSchema>;
export type DdbMigrationConfiguration = z.infer<typeof ddbConfigSchema>;
export type OsMigrationConfiguration = z.infer<typeof osConfigSchema>;
export type DdbAccountConfiguration = z.infer<typeof ddbAccountConfigSchema>;
export type OsSourceAccountConfiguration = z.infer<typeof osSourceAccountConfigSchema>;
export type OsTargetAccountConfiguration = z.infer<typeof osTargetAccountConfigSchema>;
export type StorageType = MigrationConfiguration["storage"];
```

- [ ] **Step 4: Update `src/config/types.ts`**

```typescript
export type {
  MigrationConfiguration,
  DdbMigrationConfiguration,
  OsMigrationConfiguration,
  DdbAccountConfiguration,
  OsSourceAccountConfiguration,
  OsTargetAccountConfiguration,
  StorageType
} from "./validation.ts";
```

- [ ] **Step 5: Fix `src/process-segment.ts` — remove stale opensearch spread**

Replace the `migrationConfig` block (lines 74-87) — remove the `...(options.config.storage === "ddb-os"` spread:

```typescript
  const migrationConfig: MigrationConfig = {
    sourcePrimaryTable: options.config.source.dynamodb.tableName,
    targetPrimaryTable: options.config.target.dynamodb.tableName,
    sourceFmBucket: options.config.source.s3.bucket,
    targetFmBucket: options.config.target.s3.bucket,
    modelProvider,
    sourceStorage
  };
```

- [ ] **Step 6: Delete `__tests__/config-ddb-os.test.ts`**

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: All tests pass. Fix any existing tests that break from the schema change (add `storage: "ddb"` where needed, update opensearch references).

- [ ] **Step 8: Commit**

```bash
git add src/config/validation.ts src/config/types.ts src/process-segment.ts __tests__/config-os.test.ts
git rm __tests__/config-ddb-os.test.ts
git commit -m "feat: rewrite config schemas — separate ddb and os storage types"
```

---

## Task 2: OS record decompress utility

**Files:**
- Create: `src/opensearch/decompress-record.ts`
- Test: `__tests__/os-decompress-record.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/os-decompress-record.test.ts
import { describe, it, expect } from "vitest";
import { decompressOsRecord, stripLocaleFromIndex } from "../src/opensearch/decompress-record.ts";
import { GzipCompression } from "../src/utils/gzip-compression.ts";

const gzip = new GzipCompression();

describe("decompressOsRecord", () => {
  it("should decompress a CmsEntriesElasticsearch record and derive TYPE from SK=L", async () => {
    const innerData = {
      PK: "T#root#L#en-US#CMS#CME#abc123",
      SK: "L",
      modelId: "category",
      status: "draft",
      values: { title: "Test" }
    };
    const compressed = await gzip.compress(innerData);

    const osRecord = {
      PK: "T#root#L#en-US#CMS#CME#abc123",
      SK: "L",
      data: compressed,
      index: "root-headless-cms-en-us-category",
      _et: "CmsEntriesElasticsearch",
      _ct: "2026-04-13T09:00:00.000Z",
      _md: "2026-04-13T09:00:00.000Z"
    };

    const result = await decompressOsRecord(osRecord);

    expect(result).not.toBeNull();
    expect(result!.record.TYPE).toBe("cms.entry.l");
    expect(result!.record.PK).toBe("T#root#L#en-US#CMS#CME#abc123");
    expect(result!.record.modelId).toBe("category");
    expect(result!.record.values).toEqual({ title: "Test" });
    expect(result!.metadata.index).toBe("root-headless-cms-en-us-category");
    expect(result!.metadata._ct).toBe("2026-04-13T09:00:00.000Z");
    expect(result!.metadata._md).toBe("2026-04-13T09:00:00.000Z");
  });

  it("should derive TYPE cms.entry.p from SK=P", async () => {
    const innerData = { PK: "T#root#L#en-US#CMS#CME#abc123", SK: "P", modelId: "category" };
    const compressed = await gzip.compress(innerData);

    const osRecord = {
      PK: "T#root#L#en-US#CMS#CME#abc123",
      SK: "P",
      data: compressed,
      index: "root-headless-cms-en-us-category",
      _et: "CmsEntriesElasticsearch",
      _ct: "2026-04-13T09:00:00.000Z",
      _md: "2026-04-13T09:00:00.000Z"
    };

    const result = await decompressOsRecord(osRecord);
    expect(result!.record.TYPE).toBe("cms.entry.p");
  });

  it("should return null for non-CmsEntriesElasticsearch records", async () => {
    const osRecord = {
      PK: "T#root#L#en-US#PB#P#abc123",
      SK: "L",
      data: { some: "data" },
      index: "root-en-us-page-builder",
      _et: "PbPagesEs",
      _ct: "2026-04-13T09:00:00.000Z",
      _md: "2026-04-13T09:00:00.000Z"
    };

    const result = await decompressOsRecord(osRecord);
    expect(result).toBeNull();
  });

  it("should return null if decompression fails", async () => {
    const osRecord = {
      PK: "T#root#L#en-US#CMS#CME#abc123",
      SK: "L",
      data: { compression: "gzip", value: "not-valid-gzip" },
      index: "root-headless-cms-en-us-category",
      _et: "CmsEntriesElasticsearch",
      _ct: "2026-04-13T09:00:00.000Z",
      _md: "2026-04-13T09:00:00.000Z"
    };

    const result = await decompressOsRecord(osRecord);
    expect(result).toBeNull();
  });
});

describe("stripLocaleFromIndex", () => {
  it("should remove locale from cms index", () => {
    expect(stripLocaleFromIndex("root-headless-cms-en-us-category", "en-US"))
      .toBe("root-headless-cms-category");
  });

  it("should remove locale from different position", () => {
    expect(stripLocaleFromIndex("root-en-us-page-builder", "en-US"))
      .toBe("root-page-builder");
  });

  it("should handle de-DE locale", () => {
    expect(stripLocaleFromIndex("root-headless-cms-de-de-category", "de-DE"))
      .toBe("root-headless-cms-category");
  });

  it("should return index unchanged if locale not found", () => {
    expect(stripLocaleFromIndex("root-headless-cms-category", "en-US"))
      .toBe("root-headless-cms-category");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/os-decompress-record.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `src/opensearch/decompress-record.ts`**

```typescript
import { GzipCompression } from "../utils/gzip-compression.ts";

const gzip = new GzipCompression();

export interface OsRecordMetadata {
  index: string;
  _ct: string;
  _md: string;
}

export interface DecompressedOsRecord {
  record: Record<string, unknown>;
  metadata: OsRecordMetadata;
}

/**
 * Decompress a CmsEntriesElasticsearch OS DynamoDB record.
 * Returns the inner CMS entry with a derived TYPE field, plus outer metadata.
 * Returns null for non-CMS records or if decompression fails.
 */
export async function decompressOsRecord(
  osRecord: Record<string, unknown>
): Promise<DecompressedOsRecord | null> {
  if (osRecord._et !== "CmsEntriesElasticsearch") {
    return null;
  }

  const data = osRecord.data as { compression?: string; value?: string } | undefined;
  if (!data || !gzip.canDecompress(data as any)) {
    return null;
  }

  const inner = await gzip.decompress(data as any);
  if (!inner) {
    return null;
  }

  const sk = osRecord.SK as string;

  return {
    record: {
      ...inner,
      TYPE: sk === "L" ? "cms.entry.l" : "cms.entry.p"
    },
    metadata: {
      index: osRecord.index as string,
      _ct: osRecord._ct as string,
      _md: osRecord._md as string
    }
  };
}

/**
 * Remove the locale segment from an OpenSearch index name.
 * e.g., "root-headless-cms-en-us-category" + "en-US" → "root-headless-cms-category"
 */
export function stripLocaleFromIndex(index: string, locale: string): string {
  const localeLower = locale.toLowerCase().replace("_", "-");
  return index.replace(`-${localeLower}-`, "-");
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/os-decompress-record.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/opensearch/decompress-record.ts __tests__/os-decompress-record.test.ts
git commit -m "feat: add OS record decompression and index locale stripping"
```

---

## Task 3: OS executor

**Files:**
- Create: `src/opensearch/executor.ts`
- Test: `__tests__/os-executor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/os-executor.test.ts
import { describe, it, expect, vi } from "vitest";
import { executeOsCommands, type OsCommandItem } from "../src/opensearch/executor.ts";
import { GzipCompression } from "../src/utils/gzip-compression.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";

const gzip = new GzipCompression();

describe("executeOsCommands", () => {
  it("should gzip record data and write OS-shaped records to target table", async () => {
    const database = new MockDatabaseClient();
    const batchPutSpy = vi.spyOn(database, "batchPut").mockResolvedValue();

    const items: OsCommandItem[] = [
      {
        record: {
          PK: "T#root#CMS#CME#abc123",
          SK: "L",
          TYPE: "cms.entry.l",
          GSI_TENANT: "root",
          data: { modelId: "category", values: { title: "Test" } }
        },
        metadata: {
          index: "root-headless-cms-en-us-category",
          _ct: "2026-04-13T09:00:00.000Z",
          _md: "2026-04-13T09:00:00.000Z"
        },
        locale: "en-US"
      }
    ];

    await executeOsCommands(items, {
      database,
      targetTable: "target-os-table"
    });

    expect(batchPutSpy).toHaveBeenCalledTimes(1);
    const [table, records] = batchPutSpy.mock.calls[0];
    expect(table).toBe("target-os-table");
    expect(records).toHaveLength(1);

    const osRecord = records[0];
    expect(osRecord.PK).toBe("T#root#CMS#CME#abc123");
    expect(osRecord.SK).toBe("L");
    expect(osRecord.TYPE).toBe("cms.entry.l");
    expect(osRecord.GSI_TENANT).toBe("root");
    expect(osRecord.index).toBe("root-headless-cms-category");
    expect(osRecord._et).toBe("CmsEntriesElasticsearch");
    expect(osRecord._ct).toBe("2026-04-13T09:00:00.000Z");
    expect(osRecord._md).toBe("2026-04-13T09:00:00.000Z");
    expect(osRecord.data.compression).toBe("gzip");
    expect(typeof osRecord.data.value).toBe("string");

    // Verify gzipped content
    const decompressed = await gzip.decompress(osRecord.data);
    expect(decompressed.modelId).toBe("category");
    expect(decompressed.values).toEqual({ title: "Test" });
  });

  it("should gzip multiple records in parallel", async () => {
    const database = new MockDatabaseClient();
    const batchPutSpy = vi.spyOn(database, "batchPut").mockResolvedValue();

    const items: OsCommandItem[] = [
      {
        record: {
          PK: "T#root#CMS#CME#aaa",
          SK: "L",
          TYPE: "cms.entry.l",
          GSI_TENANT: "root",
          data: { modelId: "category", values: { title: "A" } }
        },
        metadata: { index: "root-headless-cms-en-us-category", _ct: "2026-01-01T00:00:00Z", _md: "2026-01-01T00:00:00Z" },
        locale: "en-US"
      },
      {
        record: {
          PK: "T#root#CMS#CME#bbb",
          SK: "P",
          TYPE: "cms.entry.p",
          GSI_TENANT: "root",
          data: { modelId: "article", values: { title: "B" } }
        },
        metadata: { index: "root-headless-cms-en-us-article", _ct: "2026-01-02T00:00:00Z", _md: "2026-01-02T00:00:00Z" },
        locale: "en-US"
      }
    ];

    await executeOsCommands(items, {
      database,
      targetTable: "target-os-table"
    });

    expect(batchPutSpy).toHaveBeenCalledTimes(1);
    const [, records] = batchPutSpy.mock.calls[0];
    expect(records).toHaveLength(2);
    expect(records[0].PK).toBe("T#root#CMS#CME#aaa");
    expect(records[0].index).toBe("root-headless-cms-category");
    expect(records[1].PK).toBe("T#root#CMS#CME#bbb");
    expect(records[1].index).toBe("root-headless-cms-article");
  });

  it("should skip empty items list", async () => {
    const database = new MockDatabaseClient();
    const batchPutSpy = vi.spyOn(database, "batchPut").mockResolvedValue();

    await executeOsCommands([], { database, targetTable: "target-os-table" });

    expect(batchPutSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/os-executor.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `src/opensearch/executor.ts`**

```typescript
import { GzipCompression } from "../utils/gzip-compression.ts";
import { stripLocaleFromIndex } from "./decompress-record.ts";
import { DatabaseClient } from "../database/interface.ts";
import { OsRecordMetadata } from "./decompress-record.ts";

const gzip = new GzipCompression();

// ============================================================================
// Types
// ============================================================================

export interface OsCommandItem {
  /** The transformed record from the pipeline (has PK, SK, TYPE, GSI_TENANT, data envelope) */
  record: Record<string, unknown>;
  /** Outer metadata from the source OS DynamoDB record */
  metadata: OsRecordMetadata;
  /** Locale extracted from the original PK (for index stripping) */
  locale: string;
}

export interface OsExecutorDependencies {
  database: DatabaseClient;
  targetTable: string;
}

// ============================================================================
// OS Command Executor
// ============================================================================

/**
 * Gzip all records' data envelopes in parallel, build OS DynamoDB shapes,
 * and batch-write to the target OS table.
 */
export async function executeOsCommands(
  items: OsCommandItem[],
  deps: OsExecutorDependencies
): Promise<void> {
  if (items.length === 0) return;

  // Gzip all records in parallel
  const osRecords = await Promise.all(
    items.map(async ({ record, metadata, locale }) => {
      const compressed = await gzip.compress(record.data);
      const index = stripLocaleFromIndex(metadata.index, locale);

      return {
        PK: record.PK,
        SK: record.SK,
        data: compressed,
        index,
        TYPE: record.TYPE,
        GSI_TENANT: record.GSI_TENANT,
        _et: "CmsEntriesElasticsearch",
        _ct: metadata._ct,
        _md: metadata._md
      };
    })
  );

  await deps.database.batchPut(deps.targetTable, osRecords);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/os-executor.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/opensearch/executor.ts __tests__/os-executor.test.ts
git commit -m "feat: add OS executor with parallel gzip and batch write"
```

---

## Task 4: `v5-to-v6-os` preset + register in preset-loader

**Files:**
- Create: `src/presets/v5-to-v6-os.ts`
- Modify: `src/core/preset-loader.ts`

- [ ] **Step 1: Create the OS preset**

```typescript
// src/presets/v5-to-v6-os.ts
import { MigrationRunner } from "../core/runner.ts";
import { MigrationPreset } from "../core/types.ts";
import { PipelineBuilder, isCmsEntry } from "../core/pipelines.ts";

// Import global transformers
import { wrapInData } from "../transformers/global/wrap-in-data.ts";
import { addGsiTenant } from "../transformers/global/add-gsi-tenant.ts";
import { removeLocale } from "../transformers/global/remove-locale.ts";
import { removeAttributes } from "../transformers/global/remove-attributes.ts";

// Import CMS transformers
import { fixCmePk } from "../transformers/cms/fix-cme-pk.ts";
import { fixBrokenStorageKeys } from "../transformers/cms/fix-broken-storage-keys.ts";
import { transformRichText } from "../transformers/cms/transform-rich-text.ts";
import { updateModelIds } from "../transformers/cms/update-model-ids.ts";
import { removeFolderRevision } from "../transformers/cms/remove-folder-revision.ts";

// ============================================================================
// Webiny v5 to v6 OS Migration Preset
// ============================================================================

/**
 * Preset for migrating CMS entries from the v5 OpenSearch DynamoDB table.
 * Only registers CMS entry pipeline — OS table only contains CMS entries
 * (pages and other types are skipped during decompression).
 *
 * Uses the same transformers as the DDB preset. The pipeline auto-puts
 * the transformed record as a PUT_RECORD command. The OS executor
 * (in process-os-segment) intercepts these commands, gzips the data,
 * and writes OS-shaped records to the target table.
 */
export const v5ToV6OsPreset: MigrationPreset = {
  name: "v5-to-v6-os",
  description: "Webiny v5 to v6 OpenSearch migration — CMS entries",
  configure(runner: MigrationRunner): void {
    const cmsEntries = new PipelineBuilder()
      .filter(isCmsEntry)
      .use(wrapInData)
      .use(addGsiTenant)
      .use(removeLocale)
      .use(fixCmePk)
      .use(fixBrokenStorageKeys)
      .use(transformRichText)
      .use(updateModelIds)
      .use(removeFolderRevision)
      .use(removeAttributes)
      .build();

    runner.register(cmsEntries);
  }
};

export default v5ToV6OsPreset;
```

- [ ] **Step 2: Register in preset-loader**

In `src/core/preset-loader.ts`, update the `BUILT_IN_PRESETS` map (line 10-12):

```typescript
const BUILT_IN_PRESETS = new Map<string, string>([
  ["v5-to-v6", new URL("../presets/v5-to-v6.ts", import.meta.url).pathname],
  ["v5-to-v6-os", new URL("../presets/v5-to-v6-os.ts", import.meta.url).pathname]
]);
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/presets/v5-to-v6-os.ts src/core/preset-loader.ts
git commit -m "feat: add v5-to-v6-os preset for CMS entry OS migration"
```

---

## Task 5: `process-os-segment.ts`

**Files:**
- Create: `src/process-os-segment.ts`

- [ ] **Step 1: Create the OS process segment**

```typescript
// src/process-os-segment.ts
import { DynamoDBClient } from "./database/dynamodb-client.ts";
import { createLogger } from "./utils/logger.ts";
import { fetchTenantsWithLocales, isDefaultLocaleRecord } from "./utils/tenants.ts";
import { MigrationConfig, PutRecordCommand } from "./core/types.ts";
import { OsMigrationConfiguration } from "./config/types.ts";
import { ModelProvider } from "./models/model-provider.ts";
import { MigrationRunner } from "./core/runner.ts";
import { loadPreset } from "./core/preset-loader.ts";
import { decompressOsRecord } from "./opensearch/decompress-record.ts";
import { executeOsCommands, type OsCommandItem } from "./opensearch/executor.ts";

// ============================================================================
// Process OS Segment Command
// ============================================================================

export interface ProcessOsSegmentOptions {
  runId: string;
  segment: number;
  total: number;
  config: OsMigrationConfiguration;
}

export async function processOsSegment(options: ProcessOsSegmentOptions): Promise<void> {
  const logger = createLogger({
    msgPrefix: `[os-segment #${options.segment}] `
  });

  logger.info(
    `Starting OS segment ${options.segment} of ${options.total} (${Math.round(
      (options.segment / options.total) * 100
    )}%)`
  );

  // Source DB client — reads primary table (models, tenants) and OS table (scan)
  const sourceDatabase = new DynamoDBClient({
    region: options.config.source.region,
    credentials: options.config.source.credentials
  });

  // Target DB client — writes to target OS DynamoDB table
  const targetDatabase = new DynamoDBClient({
    region: options.config.target.region,
    credentials: options.config.target.credentials
  });

  // Fetch tenants and default locales from source primary table
  logger.info("Fetching tenants and default locales...");
  const tenantLocales = await fetchTenantsWithLocales(
    sourceDatabase,
    options.config.source.dynamodb.tableName
  );
  logger.info(`Found ${tenantLocales.size} tenants`);

  // Preload models from source primary table
  logger.info("Preloading models...");
  const modelProvider = new ModelProvider(
    sourceDatabase,
    options.config.source.dynamodb.tableName,
    options.config.migration.modelsDir
  );
  await modelProvider.preloadModels(tenantLocales);

  // Create migration config — targetPrimaryTable receives the auto-put records,
  // which the OS executor intercepts and rewrites as gzipped OS records.
  const migrationConfig: MigrationConfig = {
    sourcePrimaryTable: options.config.source.dynamodb.tableName,
    targetPrimaryTable: options.config.target.opensearch.tableName,
    sourceFmBucket: "",
    targetFmBucket: "",
    modelProvider
  };

  // Load and configure preset
  logger.info(`Loading preset: ${options.config.migration.preset}`);
  const preset = await loadPreset(options.config.migration.preset);
  logger.info(`Loaded preset: "${preset.name}" - ${preset.description}`);

  const runner = new MigrationRunner(migrationConfig, sourceDatabase);
  preset.configure(runner, migrationConfig, sourceDatabase);

  // Process records
  let processedCount = 0;
  let migratedCount = 0;
  let skippedCount = 0;
  const batchSize = 100;

  // Batch collects decompressed records + their metadata for the OS executor
  const batch: Array<{
    record: Record<string, unknown>;
    metadata: { index: string; _ct: string; _md: string };
    locale: string;
  }> = [];

  logger.info(`Scanning OS table: ${options.config.source.opensearch.tableName}...`);

  for await (const record of sourceDatabase.scan(options.config.source.opensearch.tableName, {
    segment: options.segment,
    totalSegments: options.total
  })) {
    processedCount++;

    // Decompress — returns null for non-CmsEntriesElasticsearch
    const decompressed = await decompressOsRecord(record);
    if (!decompressed) {
      skippedCount++;
      continue;
    }

    // Filter: only default locale records
    if (!isDefaultLocaleRecord(decompressed.record, tenantLocales)) {
      skippedCount++;
      continue;
    }

    // Extract locale before pipeline transforms the PK
    const locale = extractLocaleFromPk(decompressed.record.PK as string) || "en-US";

    batch.push({
      record: decompressed.record,
      metadata: decompressed.metadata,
      locale
    });

    // Process in batches
    if (batch.length >= batchSize) {
      await processOsBatch(batch, runner, targetDatabase, options.config.target.opensearch.tableName);
      migratedCount += batch.length;
      batch.length = 0;

      if (processedCount % 1000 === 0) {
        logger.info(
          `Progress: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
        );
      }
    }
  }

  // Process remaining
  if (batch.length > 0) {
    await processOsBatch(batch, runner, targetDatabase, options.config.target.opensearch.tableName);
    migratedCount += batch.length;
  }

  logger.info(
    `OS segment ${options.segment} completed: ${processedCount} processed, ${migratedCount} migrated, ${skippedCount} skipped`
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Run a batch of decompressed records through the pipeline, then hand off
 * the transformed records to the OS executor for parallel gzip + write.
 */
async function processOsBatch(
  batch: Array<{ record: Record<string, unknown>; metadata: { index: string; _ct: string; _md: string }; locale: string }>,
  runner: MigrationRunner,
  targetDatabase: DynamoDBClient,
  targetTable: string
): Promise<void> {
  const osItems: OsCommandItem[] = [];

  for (const item of batch) {
    const commands = await runner.processRecord(item.record);

    for (const cmd of commands) {
      if (cmd.type === "PUT_RECORD") {
        osItems.push({
          record: (cmd as PutRecordCommand).record,
          metadata: item.metadata,
          locale: item.locale
        });
      }
    }
  }

  await executeOsCommands(osItems, {
    database: targetDatabase,
    targetTable
  });
}

function extractLocaleFromPk(pk: string): string | null {
  const match = pk.match(/#L#([^#]+)#/);
  return match ? match[1] : null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/process-os-segment.ts
git commit -m "feat: add OS process segment with batch decompress and parallel gzip"
```

---

## Task 6: CLI routing

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Update CLI with OS routing**

Update `src/cli.ts`:

1. Add import at the top:

```typescript
import { processOsSegment } from "./process-os-segment.ts";
```

2. Rewrite the default command handler to branch by storage type for logging and lifecycle hooks. Replace the entire handler body (`async argv => { ... }`) with:

```typescript
    async argv => {
      const config = await loadConfig(argv.config);
      const runId = String(Date.now());
      const segments = config.migration.segments || 1;

      logger.info("Starting migration with configuration:");
      logger.info(`  Run ID: ${runId}`);
      logger.info(`  Storage: ${config.storage}`);
      logger.info(`  Preset: ${config.migration.preset}`);
      logger.info(`  Segments: ${segments}`);

      if (config.storage === "ddb") {
        logger.info(`  Source Region: ${config.source.region}`);
        logger.info(`  Source Table: ${config.source.dynamodb.tableName}`);
        logger.info(`  Source Bucket: ${config.source.s3.bucket}`);
        logger.info(`  Target Region: ${config.target.region}`);
        logger.info(`  Target Table: ${config.target.dynamodb.tableName}`);
        logger.info(`  Target Bucket: ${config.target.s3.bucket}`);
      } else {
        logger.info(`  Source Region: ${config.source.region}`);
        logger.info(`  Source Primary Table: ${config.source.dynamodb.tableName}`);
        logger.info(`  Source OS Table: ${config.source.opensearch.tableName}`);
        logger.info(`  Target Region: ${config.target.region}`);
        logger.info(`  Target OS Table: ${config.target.opensearch.tableName}`);
        logger.info(`  OS Endpoint: ${config.target.opensearch.endpoint}`);
      }

      const startTime = Date.now();
      const workerCommand = config.storage === "os" ? "process-os-segment" : "process-segment";

      // OS lifecycle hooks
      const osClient =
        config.storage === "os" && config.target.credentials
          ? createOpenSearchClient({
              endpoint: config.target.opensearch.endpoint,
              region: config.target.region,
              service: config.target.opensearch.service,
              credentials: config.target.credentials
            })
          : null;

      try {
        if (osClient) {
          const beforeHook = new OpenSearchBeforeMigration(osClient);
          logger.info("Running OpenSearch before-migration hook...");
          await beforeHook.execute();
        }

        const workers: Promise<void>[] = [];
        for (let segment = 0; segment < segments; segment++) {
          workers.push(spawnWorker(segment, segments, runId, argv.config, workerCommand));
        }
        await Promise.all(workers);

        if (osClient) {
          try {
            const afterHook = new OpenSearchAfterMigration(osClient);
            logger.info("Running OpenSearch after-migration hook...");
            await afterHook.execute();
          } catch (error) {
            logger.error(
              { error },
              "Failed to re-enable indexing. Data migration succeeded, but refresh_interval must be restored manually."
            );
          }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`Migration completed successfully in ${duration}s`);
      } catch (error) {
        logger.error({ error }, "Migration failed");
        process.exit(1);
      }
    }
```

3. Add `process-os-segment` CLI command after the existing `process-segment` command:

```typescript
  .command(
    "process-os-segment",
    "Process a specific OS table segment (used internally by worker processes)",
    yargs => {
      return yargs
        .option("runId", { type: "string", demandOption: true, description: "Run ID" })
        .option("segment", { type: "number", demandOption: true, description: "Segment number" })
        .option("total", { type: "number", demandOption: true, description: "Total segments" })
        .option("config", { type: "string", demandOption: true, description: "Config file path" });
    },
    async argv => {
      const config = await loadConfig(argv.config);
      if (config.storage !== "os") {
        throw new Error(`process-os-segment requires storage: "os". Got: "${config.storage}"`);
      }
      await processOsSegment({
        runId: argv.runId,
        segment: argv.segment,
        total: argv.total,
        config
      });
    }
  )
```

4. Update `spawnWorker` to accept a `command` parameter:

```typescript
async function spawnWorker(
  segment: number,
  total: number,
  runId: string,
  configPath: string,
  command: string = "process-segment"
): Promise<void> {
  const binPath = fileURLToPath(new URL("../bin.js", import.meta.url));

  const args = [
    binPath,
    command,
    "--runId",
    runId,
    "--segment",
    segment.toString(),
    "--total",
    total.toString(),
    "--config",
    configPath
  ];

  const { exitCode } = await execa("node", args, {
    stdio: "inherit"
  });

  if (exitCode !== 0) {
    throw new Error(`Worker process for segment ${segment} failed with code ${exitCode}`);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add CLI routing for OS process segment with lifecycle hooks"
```

---

## Task 7: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Key changes:

1. The "Storage Modes" section should list `"ddb"` and `"os"` (remove `"ddb-os"`)
2. The OS config section should match `migrationOs.config.example.ts`:
   - source has `dynamodb` + `opensearch`
   - target has only `opensearch` (with `endpoint`, `tableName`, `service`)
   - No S3 on either side, no `auth` section
3. Explain: OS client uses target account `credentials` and `region`
4. Add a note: "Run the DDB migration first (`storage: "ddb"`), then the OS migration (`storage: "os"`). They use separate config files."
5. Remove all `"ddb-os"` references

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for separate ddb and os storage modes"
```

---

## Summary

| What | Status |
|------|--------|
| Zod config: `"ddb"` and `"os"` with separate account shapes | Separate schemas, compile-time safety |
| OS record decompression | Decompress gzipped CMS entries, derive TYPE, return inner record + metadata |
| OS executor | Parallel gzip via `Promise.all`, build OS DDB shape, batch write |
| `v5-to-v6-os` preset | CMS entry pipeline only, same transformers as DDB |
| `process-os-segment.ts` | Scan source OS table, decompress, pipeline transforms, OS executor |
| CLI routing | Routes to correct process-segment, lifecycle hooks for `"os"` only |
| Pipeline changes | **None** — uses standard auto-put, OS executor handles the rest |

### Future: `createIndex` command

The `executeOsCommands` function can be extended with a `CREATE_INDEX` command type. When a record targets an index that doesn't exist, the OS executor would create it (with `refresh_interval: "-1"`) before writing. Index existence can be cached in the runner's shared `cache` Map to avoid repeated checks.
