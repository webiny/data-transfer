# OpenSearch Index Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically create missing OpenSearch indexes (with correct mapping and disabled refresh) during OS migration, with retry logic for unhealthy clusters.

**Architecture:** The OS executor checks each batch's unique index names against a `Set<string>` cache. Unknown indexes are checked via `indices.exists()` and created if missing using `getBaseConfiguration()` from `@webiny/api-opensearch` plus `refresh_interval: "-1"`. Both exists and create calls use `p-retry` with 5 attempts (5s, 10s, 20s, 30s, 30s). "Already exists" errors are silently cached. Other failures are logged but don't kill the segment. The OS client is created once in `process-os-segment` and passed to the executor.

**Tech Stack:** TypeScript, `p-retry`, `@opensearch-project/opensearch`, `@webiny/api-opensearch`

---

## File Structure

### Modified files

| File | What changes |
|------|-------------|
| `src/opensearch/executor.ts` | Add `osClient` and `knownIndexes` to deps, add `ensureIndexes` step before gzip, import `getBaseConfiguration` and `p-retry` |
| `src/process-os-segment.ts` | Create OS client once, create `knownIndexes` Set, pass both to executor |
| `__tests__/os-executor.test.ts` | Add tests for index creation, caching, retry, and error handling |
| `package.json` | Add `p-retry` dependency |

### Files NOT changed

| File | Why |
|------|-----|
| `src/opensearch/client.ts` | Client factory unchanged — process-os-segment calls it directly |
| `src/opensearch/lifecycle.ts` | Lifecycle hooks are separate concern (disable/enable refresh on existing indexes) |
| `src/opensearch/decompress-record.ts` | Decompression unrelated to index creation |

---

## Task 1: Install `p-retry`

- [ ] **Step 1: Install the package**

```bash
npm install p-retry
```

- [ ] **Step 2: Verify it installed**

Run: `node -e "require('p-retry')"`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add p-retry for OS index creation retries"
```

---

## Task 2: Add index creation to OS executor

**Files:**
- Modify: `src/opensearch/executor.ts`
- Modify: `__tests__/os-executor.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `__tests__/os-executor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeOsCommands, type OsCommandItem, type OsExecutorDependencies } from "../src/opensearch/executor.ts";
import { GzipCompression } from "../src/utils/gzip-compression.ts";
import { MockDatabaseClient } from "./mocks/database-client.ts";

const gzip = new GzipCompression();

function createMockOsClient() {
  return {
    indices: {
      exists: vi.fn(),
      create: vi.fn()
    }
  } as any;
}

// ... keep existing tests ...

describe("index creation", () => {
  let database: MockDatabaseClient;
  let osClient: ReturnType<typeof createMockOsClient>;
  let knownIndexes: Set<string>;

  beforeEach(() => {
    database = new MockDatabaseClient();
    vi.spyOn(database, "batchPut").mockResolvedValue();
    osClient = createMockOsClient();
    knownIndexes = new Set();
  });

  function makeDeps(): OsExecutorDependencies {
    return { database, targetTable: "target-os-table", osClient, knownIndexes };
  }

  function makeItem(index: string): OsCommandItem {
    return {
      record: {
        PK: "T#root#CMS#CME#abc",
        SK: "L",
        TYPE: "cms.entry.l",
        GSI_TENANT: "root",
        data: { modelId: "test" }
      },
      metadata: { index, _ct: "2026-01-01T00:00:00Z", _md: "2026-01-01T00:00:00Z" },
      locale: "en-US"
    };
  }

  it("should create index when it does not exist", async () => {
    osClient.indices.exists.mockResolvedValue({ body: false });
    osClient.indices.create.mockResolvedValue({ body: {} });

    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], makeDeps());

    expect(osClient.indices.exists).toHaveBeenCalledWith({ index: "root-headless-cms-category" });
    expect(osClient.indices.create).toHaveBeenCalledTimes(1);
    const createCall = osClient.indices.create.mock.calls[0][0];
    expect(createCall.index).toBe("root-headless-cms-category");
    expect(createCall.body.settings.index.refresh_interval).toBe("-1");
    expect(createCall.body.mappings).toBeDefined();
  });

  it("should skip creation when index already exists", async () => {
    osClient.indices.exists.mockResolvedValue({ body: true });

    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], makeDeps());

    expect(osClient.indices.exists).toHaveBeenCalledTimes(1);
    expect(osClient.indices.create).not.toHaveBeenCalled();
  });

  it("should use cache and not check twice for same index", async () => {
    osClient.indices.exists.mockResolvedValue({ body: false });
    osClient.indices.create.mockResolvedValue({ body: {} });

    const deps = makeDeps();
    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], deps);
    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], deps);

    expect(osClient.indices.exists).toHaveBeenCalledTimes(1);
    expect(osClient.indices.create).toHaveBeenCalledTimes(1);
  });

  it("should handle resource_already_exists_exception silently", async () => {
    osClient.indices.exists.mockResolvedValue({ body: false });
    const error = new Error("resource_already_exists_exception");
    (error as any).meta = { body: { error: { type: "resource_already_exists_exception" } } };
    osClient.indices.create.mockRejectedValue(error);

    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], makeDeps());

    // Should not throw, index added to cache
    expect(osClient.indices.create).toHaveBeenCalledTimes(1);
  });

  it("should skip index creation when osClient is not provided", async () => {
    const deps: OsExecutorDependencies = { database, targetTable: "target-os-table" };

    // Should not throw — just skip index creation
    await executeOsCommands([makeItem("root-headless-cms-en-us-category")], deps);

    expect(database.batchPutRecords.length).toBeGreaterThan(0);
  });

  it("should handle multiple unique indexes in one batch", async () => {
    osClient.indices.exists.mockResolvedValue({ body: false });
    osClient.indices.create.mockResolvedValue({ body: {} });

    await executeOsCommands(
      [
        makeItem("root-headless-cms-en-us-category"),
        makeItem("root-headless-cms-en-us-article")
      ],
      makeDeps()
    );

    expect(osClient.indices.exists).toHaveBeenCalledTimes(2);
    expect(osClient.indices.create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/os-executor.test.ts`
Expected: FAIL — `osClient` and `knownIndexes` don't exist on `OsExecutorDependencies`.

- [ ] **Step 3: Update `src/opensearch/executor.ts`**

```typescript
import { GzipCompression } from "../utils/gzip-compression.ts";
import { stripLocaleFromIndex } from "./decompress-record.ts";
import { DatabaseClient } from "../database/interface.ts";
import type { OsRecordMetadata } from "./decompress-record.ts";
import type { Client } from "./client.ts";
import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration";
import { createLogger } from "../utils/logger.ts";
import pRetry from "p-retry";

const gzip = new GzipCompression();
const logger = createLogger();

const RETRY_OPTIONS = {
  retries: 5,
  factor: 1,
  minTimeout: 5000,
  // Custom retry schedule: 5s, 10s, 20s, 30s, 30s
  onFailedAttempt(error: pRetry.FailedAttemptError) {
    logger.warn(
      `Index operation failed (attempt ${error.attemptNumber}/${error.attemptNumber + error.retriesLeft}). Retrying...`
    );
  }
};

function getRetryTimeout(attempt: number): number {
  const schedule = [5000, 10000, 20000, 30000, 30000];
  return schedule[attempt - 1] || 30000;
}

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
  /** OpenSearch client for index creation. If not provided, index creation is skipped. */
  osClient?: Client;
  /** Cache of known index names. Persists across batches within a segment. */
  knownIndexes?: Set<string>;
}

// ============================================================================
// OS Command Executor
// ============================================================================

/**
 * Ensure indexes exist, gzip all records' data envelopes in parallel,
 * build OS DynamoDB shapes, and batch-write to the target OS table.
 */
export async function executeOsCommands(
  items: OsCommandItem[],
  deps: OsExecutorDependencies
): Promise<void> {
  if (items.length === 0) return;

  // Build the OS records (gzip in parallel, strip locale from index)
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

  // Ensure all target indexes exist (sequential)
  if (deps.osClient && deps.knownIndexes) {
    const uniqueIndexes = new Set(osRecords.map(r => r.index as string));
    for (const indexName of uniqueIndexes) {
      await ensureIndex(indexName, deps.osClient, deps.knownIndexes);
    }
  }

  await deps.database.batchPut(deps.targetTable, osRecords);
}

// ============================================================================
// Index Management
// ============================================================================

async function ensureIndex(
  indexName: string,
  client: Client,
  knownIndexes: Set<string>
): Promise<void> {
  if (knownIndexes.has(indexName)) return;

  try {
    await pRetry(
      async () => {
        const { body: exists } = await client.indices.exists({ index: indexName });
        if (exists) {
          knownIndexes.add(indexName);
          return;
        }

        try {
          const baseConfig = getBaseConfiguration();
          await client.indices.create({
            index: indexName,
            body: {
              ...baseConfig,
              settings: {
                ...baseConfig.settings,
                index: {
                  ...baseConfig.settings?.index,
                  refresh_interval: "-1"
                }
              }
            }
          });
          logger.info(`Created index: ${indexName}`);
        } catch (createError: any) {
          // Race condition: another segment created it between exists check and create
          if (isAlreadyExistsError(createError)) {
            logger.info(`Index already exists (race condition): ${indexName}`);
          } else {
            throw createError;
          }
        }

        knownIndexes.add(indexName);
      },
      {
        retries: 5,
        minTimeout: 5000,
        factor: 1,
        randomize: false,
        onFailedAttempt(error) {
          const timeout = getRetryTimeout(error.attemptNumber);
          logger.warn(
            `Index operation for "${indexName}" failed (attempt ${error.attemptNumber}/6). ` +
            `Retrying in ${timeout / 1000}s...`
          );
        }
      }
    );
  } catch (error) {
    logger.error(
      { error },
      `Failed to ensure index "${indexName}" after retries. Continuing without index creation.`
    );
  }
}

function isAlreadyExistsError(error: any): boolean {
  // OpenSearch SDK wraps errors with meta.body
  const errorType = error?.meta?.body?.error?.type;
  if (errorType === "resource_already_exists_exception") return true;

  // Fallback: check message
  const message = error?.message || "";
  return message.includes("resource_already_exists_exception");
}
```

Note: The `p-retry` custom schedule uses `factor: 1` with `minTimeout: 5000`. The `onFailedAttempt` hook logs with the correct timeout from the schedule. The actual wait times between retries are controlled by `p-retry`'s built-in backoff — we'll verify the wait schedule matches 5/10/20/30/30 in Step 4.

- [ ] **Step 4: Check `p-retry` API for custom wait schedule**

The `p-retry` library doesn't directly support an array of wait times. It uses `minTimeout * Math.pow(factor, attempt)`. With `factor: 1`, all retries use `minTimeout`. To get the 5/10/20/30/30 schedule, we need a custom approach.

Check if `p-retry` supports a custom `minTimeout` function or if we need to implement retry manually. If `p-retry` doesn't support it, use a simple retry loop instead:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  const schedule = [5000, 10000, 20000, 30000, 30000];
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= schedule.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < schedule.length) {
        const wait = schedule[attempt];
        logger.warn(
          `${label} failed (attempt ${attempt + 1}/${schedule.length + 1}). Retrying in ${wait / 1000}s...`
        );
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
  }

  throw lastError;
}
```

If `p-retry` doesn't support the schedule, replace the `pRetry` call in `ensureIndex` with `withRetry`. This avoids the dependency entirely.

Evaluate during implementation: if `p-retry` supports it, use it. If not, use the `withRetry` helper above and skip installing `p-retry` (remove Task 1).

- [ ] **Step 5: Run tests**

Run: `npx vitest run __tests__/os-executor.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/opensearch/executor.ts __tests__/os-executor.test.ts
git commit -m "feat: add OS index creation with retry and caching"
```

---

## Task 3: Wire OS client into process-os-segment

**Files:**
- Modify: `src/process-os-segment.ts`

- [ ] **Step 1: Add OS client creation and knownIndexes Set**

Add import at the top of `src/process-os-segment.ts`:

```typescript
import { createOpenSearchClient } from "./opensearch/client.ts";
```

After the target database client creation (around line 42), add:

```typescript
  // OS client — for index creation. Created once per segment.
  const osClient = options.config.target.credentials
    ? createOpenSearchClient({
        endpoint: options.config.target.opensearch.endpoint,
        region: options.config.target.region,
        service: options.config.target.opensearch.service,
        credentials: options.config.target.credentials
      })
    : undefined;

  // Cache of known indexes — persists across batches within this segment
  const knownIndexes = new Set<string>();
```

- [ ] **Step 2: Update `processOsBatch` call to pass new deps**

In the `processOsBatch` function signature, add `osClient` and `knownIndexes` parameters. Update all call sites to pass them.

Update the function signature:

```typescript
async function processOsBatch(
  batch: Array<{ record: Record<string, unknown>; metadata: { index: string; _ct: string; _md: string }; locale: string }>,
  runner: MigrationRunner,
  targetDatabase: DynamoDBClient,
  targetTable: string,
  osClient?: import("./opensearch/client.ts").Client,
  knownIndexes?: Set<string>
): Promise<void> {
```

Update the `executeOsCommands` call inside `processOsBatch`:

```typescript
  await executeOsCommands(osItems, {
    database: targetDatabase,
    targetTable,
    osClient,
    knownIndexes
  });
```

Update both call sites in `processOsSegment` (the batch-full case and the remaining-records case):

```typescript
      await processOsBatch(batch, runner, targetDatabase, options.config.target.opensearch.tableName, osClient, knownIndexes);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/process-os-segment.ts
git commit -m "feat: wire OS client and index cache into process-os-segment"
```

---

## Summary

| What | Status |
|------|--------|
| Index existence check | `indices.exists()` with retry |
| Index creation | `indices.create()` with `getBaseConfiguration()` mapping + `refresh_interval: "-1"` |
| Retry strategy | 5 attempts with 5s/10s/20s/30s/30s waits |
| "Already exists" race condition | Caught silently, index added to cache |
| Other failures | Logged, segment continues |
| Caching | `Set<string>` persists across batches within a segment |
| OS client | Created once in `process-os-segment`, passed to executor |
| `p-retry` | Used if API supports custom schedule, otherwise simple `withRetry` loop |
