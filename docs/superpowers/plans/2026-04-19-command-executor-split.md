# Command Executor Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the god-executors (`DdbCommandExecutor`, `OsCommandExecutor`) into per-command executors. Introduce a dedicated `TouchedIndexes` abstraction for OS shard-scoped state.

**Architecture:** Each AWS write operation gets its own executor. `PutOsDynamoDbRecordExecutor` composes `PutDynamoDbRecordExecutor` (gzip + ensureIndex layered on top). Processors dispatch by command key with direct named calls (no registry yet). `TouchedIndexes` is a per-container singleton, read by `OsProcessor.getShardState()`, serialized across worker→orchestrator boundary as a `TouchedIndexes.Item[]` array.

**Tech Stack:** TypeScript, `@webiny/di`, `@webiny/aws-sdk`, `@opensearch-project/opensearch`, Zod schemas, Vitest, oxfmt.

**Spec:** `docs/superpowers/specs/2026-04-19-command-executor-split-design.md`.

---

## File Structure

**Create:**

```
src/features/TouchedIndexes/
├── abstractions/
│   ├── TouchedIndexes.ts         # Interface, token, namespace (Interface, Item)
│   └── index.ts                  # Const re-export
├── TouchedIndexes.ts             # Map-backed impl
├── feature.ts                    # createFeature registration
└── index.ts

src/features/PutDynamoDbRecordExecutor/
├── abstractions/
│   ├── PutDynamoDbRecordExecutor.ts
│   └── index.ts
├── PutDynamoDbRecordExecutor.ts  # Groups PutRecord[] by table, delegates to TargetDynamoDbClient
├── feature.ts
└── index.ts

src/features/S3CopyExecutor/
├── abstractions/{S3CopyExecutor.ts, index.ts}
├── S3CopyExecutor.ts             # Delegates to TargetS3Client.batchCopy
├── feature.ts
└── index.ts

src/features/PutOsDynamoDbRecordExecutor/
├── abstractions/{PutOsDynamoDbRecordExecutor.ts, index.ts}
├── PutOsDynamoDbRecordExecutor.ts # gzip -> ensureIndex (sequential) -> PutDynamoDbRecordExecutor
├── feature.ts
└── index.ts

__tests__/features/TouchedIndexes/TouchedIndexes.test.ts
__tests__/features/PutDynamoDbRecordExecutor/PutDynamoDbRecordExecutor.test.ts
__tests__/features/S3CopyExecutor/S3CopyExecutor.test.ts
__tests__/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.test.ts
__tests__/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.classifier.test.ts
```

**Modify:**

- `src/bootstrap.ts` — swap registrations (DDB/OS containers).
- `src/features/DdbProcessor/DdbProcessor.ts` — new deps, direct dispatch, warn-on-unknown.
- `src/features/OsProcessor/OsProcessor.ts` — new deps, delegate to `TouchedIndexes`, updated `getShardState` shape.
- `src/features/OsProcessor/abstractions/OsProcessor.ts` — `OsShardState.touchedIndexes: TouchedIndexes.Item[]`.
- `src/commands/processOsSegment/handler.ts` — merge arrays (first-wins by `indexName`), JSON file payload = array.
- `src/services/OpenSearchClient/hooks/EnableRefreshHook.ts` — parse array form from JSON, iterate items.
- `__tests__/features/DdbProcessor/DdbProcessor.test.ts` — rewire for new deps + dispatch + warn.
- `__tests__/features/OsProcessor/OsProcessor.test.ts` — rewire for new deps + array shard state.
- `__tests__/commands/processOsSegment.test.ts` — array format in mock `getShardState`.

**Delete:**

- `src/features/DdbCommandExecutor/` (entire dir)
- `src/features/OsCommandExecutor/` (entire dir)
- `__tests__/features/DdbCommandExecutor/` (entire dir)
- `__tests__/features/OsCommandExecutor/` (entire dir)

---

## Task 1: TouchedIndexes abstraction + implementation

**Files:**
- Create: `src/features/TouchedIndexes/abstractions/TouchedIndexes.ts`
- Create: `src/features/TouchedIndexes/abstractions/index.ts`
- Create: `src/features/TouchedIndexes/TouchedIndexes.ts`
- Create: `src/features/TouchedIndexes/feature.ts`
- Create: `src/features/TouchedIndexes/index.ts`
- Create: `__tests__/features/TouchedIndexes/TouchedIndexes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/features/TouchedIndexes/TouchedIndexes.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { Container } from "@webiny/di";
import { TouchedIndexesFeature } from "~/features/TouchedIndexes/feature.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";

function createContainer(): Container {
    const container = new Container();
    TouchedIndexesFeature(container);
    return container;
}

describe("TouchedIndexes", () => {
    it("has() returns false for an unrecorded index", () => {
        const touched = createContainer().resolve(TouchedIndexes);
        expect(touched.has("idx-a")).toBe(false);
    });

    it("has() returns true after record()", () => {
        const touched = createContainer().resolve(TouchedIndexes);
        touched.record("idx-a", "1s");
        expect(touched.has("idx-a")).toBe(true);
    });

    it("all() returns the recorded items as an array", () => {
        const touched = createContainer().resolve(TouchedIndexes);
        touched.record("idx-a", "1s");
        touched.record("idx-b", "5s");
        expect(touched.all()).toEqual([
            { indexName: "idx-a", originalRefresh: "1s" },
            { indexName: "idx-b", originalRefresh: "5s" }
        ]);
    });

    it("record() for an existing index overwrites the originalRefresh", () => {
        const touched = createContainer().resolve(TouchedIndexes);
        touched.record("idx-a", "1s");
        touched.record("idx-a", "5s");
        expect(touched.all()).toEqual([{ indexName: "idx-a", originalRefresh: "5s" }]);
    });

    it("is a singleton — same instance across resolve() calls", () => {
        const container = createContainer();
        const a = container.resolve(TouchedIndexes);
        const b = container.resolve(TouchedIndexes);
        expect(a).toBe(b);
    });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `yarn test __tests__/features/TouchedIndexes`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the abstraction**

Create `src/features/TouchedIndexes/abstractions/TouchedIndexes.ts`:

```typescript
import { createAbstraction } from "~/base/index.ts";

interface ITouchedIndex {
    indexName: string;
    originalRefresh: string;
}

interface ITouchedIndexes {
    has(indexName: string): boolean;
    record(indexName: string, originalRefresh: string): void;
    all(): ITouchedIndex[];
}

export const TouchedIndexes = createAbstraction<ITouchedIndexes>("Core/TouchedIndexes");

export namespace TouchedIndexes {
    export type Interface = ITouchedIndexes;
    export type Item = ITouchedIndex;
}
```

Create `src/features/TouchedIndexes/abstractions/index.ts`:

```typescript
export { TouchedIndexes } from "./TouchedIndexes.ts";
```

- [ ] **Step 4: Create the implementation**

Create `src/features/TouchedIndexes/TouchedIndexes.ts`:

```typescript
import { TouchedIndexes as TouchedIndexesAbstraction } from "./abstractions/TouchedIndexes.ts";

class TouchedIndexesImpl implements TouchedIndexesAbstraction.Interface {
    private readonly items: Map<string, string> = new Map();

    public has(indexName: string): boolean {
        return this.items.has(indexName);
    }

    public record(indexName: string, originalRefresh: string): void {
        this.items.set(indexName, originalRefresh);
    }

    public all(): TouchedIndexesAbstraction.Item[] {
        return Array.from(this.items, ([indexName, originalRefresh]) => ({
            indexName,
            originalRefresh
        }));
    }
}

export const TouchedIndexes = TouchedIndexesAbstraction.createImplementation({
    implementation: TouchedIndexesImpl,
    dependencies: []
});
```

- [ ] **Step 5: Create feature + index**

Create `src/features/TouchedIndexes/feature.ts`:

```typescript
import { createFeature } from "~/base/index.ts";
import { TouchedIndexes } from "./TouchedIndexes.ts";

export const TouchedIndexesFeature = createFeature(container => {
    container.register(TouchedIndexes);
});
```

Create `src/features/TouchedIndexes/index.ts`:

```typescript
export { TouchedIndexes } from "./abstractions/TouchedIndexes.ts";
export { TouchedIndexesFeature } from "./feature.ts";
```

- [ ] **Step 6: Run tests to verify pass**

Run: `yarn test __tests__/features/TouchedIndexes`
Expected: PASS — 5 tests.

- [ ] **Step 7: Run format + ts-check**

Run: `yarn format:fix && yarn ts-check 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 8: Commit**

```bash
git add src/features/TouchedIndexes __tests__/features/TouchedIndexes
git commit -m "feat(touched-indexes): per-container singleton tracking OS index refresh overrides"
```

---

## Task 2: PutDynamoDbRecordExecutor abstraction + implementation

**Files:**
- Create: `src/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts`
- Create: `src/features/PutDynamoDbRecordExecutor/abstractions/index.ts`
- Create: `src/features/PutDynamoDbRecordExecutor/PutDynamoDbRecordExecutor.ts`
- Create: `src/features/PutDynamoDbRecordExecutor/feature.ts`
- Create: `src/features/PutDynamoDbRecordExecutor/index.ts`
- Create: `__tests__/features/PutDynamoDbRecordExecutor/PutDynamoDbRecordExecutor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/features/PutDynamoDbRecordExecutor/PutDynamoDbRecordExecutor.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "@webiny/di";
import { loggerFeature } from "~/tools/Logger/index.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { PutDynamoDbRecordExecutorFeature } from "~/features/PutDynamoDbRecordExecutor/feature.ts";
import { PutDynamoDbRecordExecutor } from "~/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts";

describe("PutDynamoDbRecordExecutor", () => {
    let container: Container;
    let client: MockDynamoDbClient;

    beforeEach(() => {
        container = new Container();
        loggerFeature(container);
        client = new MockDynamoDbClient();
        container.registerInstance(TargetDynamoDbClient, client);
        PutDynamoDbRecordExecutorFeature(container);
    });

    it("is a no-op when given an empty array", async () => {
        const executor = container.resolve(PutDynamoDbRecordExecutor);
        const spy = vi.spyOn(client, "batchPut");
        await executor.execute([]);
        expect(spy).not.toHaveBeenCalled();
    });

    it("groups puts by table and calls batchPut once per table", async () => {
        const executor = container.resolve(PutDynamoDbRecordExecutor);
        const spy = vi.spyOn(client, "batchPut").mockResolvedValue();

        await executor.execute([
            PutRecord.create({ table: "t1", record: { PK: "a", SK: "1" } }),
            PutRecord.create({ table: "t2", record: { PK: "b", SK: "2" } }),
            PutRecord.create({ table: "t1", record: { PK: "c", SK: "3" } })
        ]);

        expect(spy).toHaveBeenCalledTimes(2);
        const callArgs = spy.mock.calls.map(([table, records]) => [table, records.length]);
        expect(callArgs).toEqual(
            expect.arrayContaining([
                ["t1", 2],
                ["t2", 1]
            ])
        );
    });

    it("passes record data verbatim to batchPut", async () => {
        const executor = container.resolve(PutDynamoDbRecordExecutor);
        const spy = vi.spyOn(client, "batchPut").mockResolvedValue();
        const record = { PK: "pk", SK: "sk", custom: 42 };

        await executor.execute([PutRecord.create({ table: "t", record })]);

        expect(spy).toHaveBeenCalledWith("t", [record]);
    });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `yarn test __tests__/features/PutDynamoDbRecordExecutor`
Expected: FAIL — module not found.

- [ ] **Step 3: Create abstraction**

Create `src/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts`:

```typescript
import { createAbstraction } from "~/base/index.ts";
import type { PutRecord } from "~/domain/transform/commands/PutRecord.ts";

interface IPutDynamoDbRecordExecutor {
    /** Write PutRecord commands to the target DDB table. Groups by table; no-op on empty input. */
    execute(puts: PutRecord[]): Promise<void>;
}

export const PutDynamoDbRecordExecutor = createAbstraction<IPutDynamoDbRecordExecutor>(
    "Core/PutDynamoDbRecordExecutor"
);

export namespace PutDynamoDbRecordExecutor {
    export type Interface = IPutDynamoDbRecordExecutor;
}
```

Create `src/features/PutDynamoDbRecordExecutor/abstractions/index.ts`:

```typescript
export { PutDynamoDbRecordExecutor } from "./PutDynamoDbRecordExecutor.ts";
```

- [ ] **Step 4: Create the implementation**

Create `src/features/PutDynamoDbRecordExecutor/PutDynamoDbRecordExecutor.ts`:

```typescript
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { PutDynamoDbRecordExecutor as PutDynamoDbRecordExecutorAbstraction } from "./abstractions/PutDynamoDbRecordExecutor.ts";

class PutDynamoDbRecordExecutorImpl implements PutDynamoDbRecordExecutorAbstraction.Interface {
    public constructor(private readonly targetDb: TargetDynamoDbClient.Interface) {}

    public async execute(puts: PutRecord[]): Promise<void> {
        if (puts.length === 0) {
            return;
        }

        const byTable = new Map<string, Record<string, unknown>[]>();
        for (const put of puts) {
            let bucket = byTable.get(put.table);
            if (!bucket) {
                bucket = [];
                byTable.set(put.table, bucket);
            }
            bucket.push(put.record);
        }

        await Promise.all(
            Array.from(byTable.entries()).map(([table, records]) =>
                this.targetDb.batchPut(table, records as any)
            )
        );
    }
}

export const PutDynamoDbRecordExecutor = PutDynamoDbRecordExecutorAbstraction.createImplementation({
    implementation: PutDynamoDbRecordExecutorImpl,
    dependencies: [TargetDynamoDbClient]
});
```

- [ ] **Step 5: Create feature + index**

Create `src/features/PutDynamoDbRecordExecutor/feature.ts`:

```typescript
import { createFeature } from "~/base/index.ts";
import { PutDynamoDbRecordExecutor } from "./PutDynamoDbRecordExecutor.ts";

export const PutDynamoDbRecordExecutorFeature = createFeature(container => {
    container.register(PutDynamoDbRecordExecutor);
});
```

Create `src/features/PutDynamoDbRecordExecutor/index.ts`:

```typescript
export { PutDynamoDbRecordExecutor } from "./abstractions/PutDynamoDbRecordExecutor.ts";
export { PutDynamoDbRecordExecutorFeature } from "./feature.ts";
```

- [ ] **Step 6: Run tests to verify pass**

Run: `yarn test __tests__/features/PutDynamoDbRecordExecutor`
Expected: PASS — 3 tests.

- [ ] **Step 7: Format + ts-check**

Run: `yarn format:fix && yarn ts-check 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 8: Commit**

```bash
git add src/features/PutDynamoDbRecordExecutor __tests__/features/PutDynamoDbRecordExecutor
git commit -m "feat(executor): PutDynamoDbRecordExecutor — PutRecord[] to target DDB, grouped by table"
```

---

## Task 3: S3CopyExecutor abstraction + implementation

**Files:**
- Create: `src/features/S3CopyExecutor/abstractions/S3CopyExecutor.ts`
- Create: `src/features/S3CopyExecutor/abstractions/index.ts`
- Create: `src/features/S3CopyExecutor/S3CopyExecutor.ts`
- Create: `src/features/S3CopyExecutor/feature.ts`
- Create: `src/features/S3CopyExecutor/index.ts`
- Create: `__tests__/features/S3CopyExecutor/S3CopyExecutor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/features/S3CopyExecutor/S3CopyExecutor.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "@webiny/di";
import { MockS3Client } from "../../services/S3Client/MockS3Client.ts";
import { TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { S3CopyExecutorFeature } from "~/features/S3CopyExecutor/feature.ts";
import { S3CopyExecutor } from "~/features/S3CopyExecutor/abstractions/S3CopyExecutor.ts";

describe("S3CopyExecutor", () => {
    let container: Container;
    let client: MockS3Client;

    beforeEach(() => {
        container = new Container();
        client = new MockS3Client();
        container.registerInstance(TargetS3Client, client);
        S3CopyExecutorFeature(container);
    });

    it("is a no-op when given an empty array", async () => {
        const executor = container.resolve(S3CopyExecutor);
        const spy = vi.spyOn(client, "batchCopy");
        await executor.execute([]);
        expect(spy).not.toHaveBeenCalled();
    });

    it("maps S3Copy commands to batchCopy operations and delegates", async () => {
        const executor = container.resolve(S3CopyExecutor);
        const spy = vi.spyOn(client, "batchCopy").mockResolvedValue();

        await executor.execute([
            S3Copy.create({
                sourceBucket: "sb",
                sourceKey: "sk",
                targetBucket: "tb",
                targetKey: "tk"
            })
        ]);

        expect(spy).toHaveBeenCalledWith([
            { sourceBucket: "sb", sourceKey: "sk", targetBucket: "tb", targetKey: "tk" }
        ]);
    });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `yarn test __tests__/features/S3CopyExecutor`
Expected: FAIL — module not found.

- [ ] **Step 3: Create abstraction**

Create `src/features/S3CopyExecutor/abstractions/S3CopyExecutor.ts`:

```typescript
import { createAbstraction } from "~/base/index.ts";
import type { S3Copy } from "~/domain/transform/commands/S3Copy.ts";

interface IS3CopyExecutor {
    /** Copy objects on S3 via TargetS3Client.batchCopy. No-op on empty input. */
    execute(copies: S3Copy[]): Promise<void>;
}

export const S3CopyExecutor = createAbstraction<IS3CopyExecutor>("Core/S3CopyExecutor");

export namespace S3CopyExecutor {
    export type Interface = IS3CopyExecutor;
}
```

Create `src/features/S3CopyExecutor/abstractions/index.ts`:

```typescript
export { S3CopyExecutor } from "./S3CopyExecutor.ts";
```

- [ ] **Step 4: Create the implementation**

Create `src/features/S3CopyExecutor/S3CopyExecutor.ts`:

```typescript
import { TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import type { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { S3CopyExecutor as S3CopyExecutorAbstraction } from "./abstractions/S3CopyExecutor.ts";

class S3CopyExecutorImpl implements S3CopyExecutorAbstraction.Interface {
    public constructor(private readonly targetS3: TargetS3Client.Interface) {}

    public async execute(copies: S3Copy[]): Promise<void> {
        if (copies.length === 0) {
            return;
        }

        await this.targetS3.batchCopy(
            copies.map(cmd => ({
                sourceBucket: cmd.sourceBucket,
                sourceKey: cmd.sourceKey,
                targetBucket: cmd.targetBucket,
                targetKey: cmd.targetKey
            }))
        );
    }
}

export const S3CopyExecutor = S3CopyExecutorAbstraction.createImplementation({
    implementation: S3CopyExecutorImpl,
    dependencies: [TargetS3Client]
});
```

- [ ] **Step 5: Create feature + index**

Create `src/features/S3CopyExecutor/feature.ts`:

```typescript
import { createFeature } from "~/base/index.ts";
import { S3CopyExecutor } from "./S3CopyExecutor.ts";

export const S3CopyExecutorFeature = createFeature(container => {
    container.register(S3CopyExecutor);
});
```

Create `src/features/S3CopyExecutor/index.ts`:

```typescript
export { S3CopyExecutor } from "./abstractions/S3CopyExecutor.ts";
export { S3CopyExecutorFeature } from "./feature.ts";
```

- [ ] **Step 6: Run tests to verify pass**

Run: `yarn test __tests__/features/S3CopyExecutor`
Expected: PASS — 2 tests.

- [ ] **Step 7: Format + ts-check**

Run: `yarn format:fix && yarn ts-check 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 8: Commit**

```bash
git add src/features/S3CopyExecutor __tests__/features/S3CopyExecutor
git commit -m "feat(executor): S3CopyExecutor — delegates S3Copy[] to TargetS3Client.batchCopy"
```

---

## Task 4: PutOsDynamoDbRecordExecutor abstraction + implementation

**Files:**
- Create: `src/features/PutOsDynamoDbRecordExecutor/abstractions/PutOsDynamoDbRecordExecutor.ts`
- Create: `src/features/PutOsDynamoDbRecordExecutor/abstractions/index.ts`
- Create: `src/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.ts`
- Create: `src/features/PutOsDynamoDbRecordExecutor/feature.ts`
- Create: `src/features/PutOsDynamoDbRecordExecutor/index.ts`
- Create: `__tests__/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.test.ts`
- Create: `__tests__/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.classifier.test.ts`

- [ ] **Step 1: Write the behavior tests**

Create `__tests__/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.test.ts`:

Use the existing `createOsContainer` helper (same pattern as deleted `OsCommandExecutor.test.ts`). Cover:

- empty array → no-op; neither OS client nor PutDynamoDbRecordExecutor invoked.
- single record → `indexExists` called; `getIndexSettings` + `putIndexSettings` called for existing index; `TouchedIndexes.all()` contains the index with the original refresh.
- single record for a missing index → `createIndex` called with `refresh_interval: "-1"`; `TouchedIndexes.all()` contains the index with `"1s"` (default).
- records for multiple distinct indexes → ensureIndex called once per unique index (sequential order preserved).
- record.data gzipped → delegate call receives `PutRecord` whose `record.data` is the compressed shape `{ compression: "gzip", value: <base64> }`.
- second call for an index already in `TouchedIndexes` → no `indexExists`/`createIndex` calls for that index (short-circuited).
- delegate target — spy on `PutDynamoDbRecordExecutor.execute` and assert it was called with the gzipped puts.

Scaffold:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOsContainer } from "../../containers/os.ts";
import { PutOsDynamoDbRecordExecutor } from "~/features/PutOsDynamoDbRecordExecutor/abstractions/PutOsDynamoDbRecordExecutor.ts";
import { PutDynamoDbRecordExecutor } from "~/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";

function makeOsPut(overrides: Partial<{ index: string; PK: string; SK: string; data: unknown }> = {}) {
    return PutRecord.create({
        table: "os-target-table",
        record: {
            PK: overrides.PK ?? "root#TENANT#root#L#en-US",
            SK: overrides.SK ?? "CmsEntry:123",
            _et: "CmsEntry",
            _ct: "now",
            _md: "now",
            TYPE: "cms.entry",
            index: overrides.index ?? "root-headless-cms-article",
            data: overrides.data ?? { foo: "bar" }
        }
    });
}

describe("PutOsDynamoDbRecordExecutor", () => {
    let container: ReturnType<typeof createOsContainer>;

    beforeEach(() => {
        container = createOsContainer();
    });

    it("no-op on empty array", async () => {
        const executor = container.resolve(PutOsDynamoDbRecordExecutor);
        const putDdb = container.resolve(PutDynamoDbRecordExecutor);
        const delegateSpy = vi.spyOn(putDdb, "execute");

        await executor.execute([]);

        expect(delegateSpy).not.toHaveBeenCalled();
    });

    // ... additional tests per the bullets above ...
});
```

(When filling in the body: resolve the `OpenSearchClient` from the container — it's already a mock when `createOsContainer` is called with test defaults. Spy on its methods. For the gzipped-delegate test, spy on `PutDynamoDbRecordExecutor.execute` after resolving it.)

- [ ] **Step 2: Write the classifier test**

Create `__tests__/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.classifier.test.ts`:

Port the retained behavior from the deleted `OsCommandExecutor.classifier.test.ts`:
- Non-retryable error (e.g., `name: "ValidationException"`) → `indexExists` called once, `execute` rejects; schedule untouched.
- Retryable error (e.g., `name: "ThrottlingException"`) exhausted → calls match schedule length + 1 then throws.

Use `tuning.os.retryScheduleMs: [5]` in the test config to keep delays negligible, and `vi.useFakeTimers()` if needed.

- [ ] **Step 3: Run the new tests, confirm failure**

Run: `yarn test __tests__/features/PutOsDynamoDbRecordExecutor`
Expected: FAIL — module not found.

- [ ] **Step 4: Create the abstraction**

Create `src/features/PutOsDynamoDbRecordExecutor/abstractions/PutOsDynamoDbRecordExecutor.ts`:

```typescript
import { createAbstraction } from "~/base/index.ts";
import type { PutRecord } from "~/domain/transform/commands/PutRecord.ts";

interface IPutOsDynamoDbRecordExecutor {
    /**
     * Execute OS-target PutRecord commands: gzip each record's `data`, ensure
     * every referenced OS index exists (creating missing ones with refresh
     * disabled; recording originals for the after-transfer hook), then
     * delegate the final batch put to PutDynamoDbRecordExecutor.
     *
     * Every field on record is trusted — PK/SK, index, _et/_ct/_md — and
     * lands on the target verbatim apart from `data`, which is gzipped.
     */
    execute(puts: PutRecord[]): Promise<void>;
}

export const PutOsDynamoDbRecordExecutor = createAbstraction<IPutOsDynamoDbRecordExecutor>(
    "Core/PutOsDynamoDbRecordExecutor"
);

export namespace PutOsDynamoDbRecordExecutor {
    export type Interface = IPutOsDynamoDbRecordExecutor;
}
```

Create `src/features/PutOsDynamoDbRecordExecutor/abstractions/index.ts`:

```typescript
export { PutOsDynamoDbRecordExecutor } from "./PutOsDynamoDbRecordExecutor.ts";
```

- [ ] **Step 5: Create the implementation**

Create `src/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.ts` (port the retained logic from the soon-to-be-deleted `OsCommandExecutor.ts`, adapted to the new shape):

```typescript
import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/abstractions/GzipCompression.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { PutDynamoDbRecordExecutor } from "~/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import { isRetryableAwsError } from "~/base/index.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { PutOsDynamoDbRecordExecutor as PutOsDynamoDbRecordExecutorAbstraction } from "./abstractions/PutOsDynamoDbRecordExecutor.ts";

const DEFAULT_RETRY_SCHEDULE = [5000, 10000, 20000, 30000, 30000];
const DEFAULT_REFRESH_INTERVAL = "1s";
const DISABLED_REFRESH_INTERVAL = "-1";

class PutOsDynamoDbRecordExecutorImpl implements PutOsDynamoDbRecordExecutorAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly osClient: OpenSearchClient.Interface,
        private readonly gzip: GzipCompression.Interface,
        private readonly putDdb: PutDynamoDbRecordExecutor.Interface,
        private readonly touchedIndexes: TouchedIndexes.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public async execute(puts: PutRecord[]): Promise<void> {
        if (puts.length === 0) {
            return;
        }

        const gzippedPuts = await this.buildGzippedPuts(puts);

        const uniqueIndexes = new Set(puts.map(p => p.record.index as string));
        for (const indexName of uniqueIndexes) {
            await this.ensureIndex(indexName);
        }

        await this.putDdb.execute(gzippedPuts);
    }

    private async buildGzippedPuts(puts: PutRecord[]): Promise<PutRecord[]> {
        return Promise.all(
            puts.map(async put => {
                const record = put.record as Record<string, unknown>;
                const compressed = await this.gzip.compress(record.data as Record<string, unknown>);
                return PutRecord.create({
                    table: put.table,
                    record: { ...record, data: compressed }
                });
            })
        );
    }

    private async ensureIndex(indexName: string): Promise<void> {
        if (this.touchedIndexes.has(indexName)) {
            return;
        }

        await this.withRetry(async () => {
            const exists = await this.osClient.indexExists(indexName);
            if (exists) {
                await this.disableRefreshOnExisting(indexName);
                return;
            }
            await this.createNewIndex(indexName);
        }, `ensureIndex("${indexName}")`);
    }

    private async disableRefreshOnExisting(indexName: string): Promise<void> {
        const current = await this.osClient.getIndexSettings(indexName);
        const originalRefresh = current.refreshInterval ?? DEFAULT_REFRESH_INTERVAL;

        try {
            await this.osClient.putIndexSettings(indexName, {
                index: { refresh_interval: DISABLED_REFRESH_INTERVAL }
            });
            this.logger.info(
                `Disabled refresh on existing index: ${indexName} (was: ${originalRefresh})`
            );
        } catch (settingsError) {
            this.logger.warn(
                `Failed to disable refresh on index: ${indexName}. Continuing. Error: ${settingsError}`
            );
        }

        this.touchedIndexes.record(indexName, originalRefresh);
    }

    private async createNewIndex(indexName: string): Promise<void> {
        try {
            const baseConfig = getBaseConfiguration();
            await this.osClient.createIndex(indexName, {
                mappings: baseConfig.mappings,
                settings: {
                    index: {
                        refresh_interval: DISABLED_REFRESH_INTERVAL
                    }
                }
            });
            this.logger.info(`Created index: ${indexName}`);
        } catch (createError) {
            if (this.isAlreadyExistsError(createError)) {
                this.logger.info(`Index already exists (race condition): ${indexName}`);
            } else {
                throw createError;
            }
        }

        this.touchedIndexes.record(indexName, DEFAULT_REFRESH_INTERVAL);
    }

    private get retrySchedule(): number[] {
        return this.config.tuning?.os?.retryScheduleMs ?? DEFAULT_RETRY_SCHEDULE;
    }

    private async withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
        let lastError: Error | undefined;
        const schedule = this.retrySchedule;

        for (let attempt = 0; attempt <= schedule.length; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;
                if (!isRetryableAwsError(error)) {
                    throw error;
                }
                if (attempt < schedule.length) {
                    const wait = schedule[attempt];
                    this.logger.warn(
                        `${label} failed (attempt ${attempt + 1}/${schedule.length + 1}). Retrying in ${wait / 1000}s...`
                    );
                    await new Promise(resolve => setTimeout(resolve, wait));
                }
            }
        }

        throw lastError;
    }

    private isAlreadyExistsError(error: unknown): boolean {
        if (!error || typeof error !== "object") {
            return false;
        }
        const maybeMeta = (error as { meta?: { body?: { error?: { type?: string } } } }).meta;
        if (maybeMeta?.body?.error?.type === "resource_already_exists_exception") {
            return true;
        }
        const message = (error as { message?: string }).message ?? "";
        return message.includes("resource_already_exists_exception");
    }
}

export const PutOsDynamoDbRecordExecutor =
    PutOsDynamoDbRecordExecutorAbstraction.createImplementation({
        implementation: PutOsDynamoDbRecordExecutorImpl,
        dependencies: [
            Logger,
            OpenSearchClient,
            GzipCompression,
            PutDynamoDbRecordExecutor,
            TouchedIndexes,
            MigrationConfig
        ]
    });
```

- [ ] **Step 6: Create feature + index**

Create `src/features/PutOsDynamoDbRecordExecutor/feature.ts`:

```typescript
import { createFeature } from "~/base/index.ts";
import { PutOsDynamoDbRecordExecutor } from "./PutOsDynamoDbRecordExecutor.ts";

export const PutOsDynamoDbRecordExecutorFeature = createFeature(container => {
    container.register(PutOsDynamoDbRecordExecutor);
});
```

Create `src/features/PutOsDynamoDbRecordExecutor/index.ts`:

```typescript
export { PutOsDynamoDbRecordExecutor } from "./abstractions/PutOsDynamoDbRecordExecutor.ts";
export { PutOsDynamoDbRecordExecutorFeature } from "./feature.ts";
```

- [ ] **Step 7: Wire the new executor into `createOsContainer` (test helper)**

The OS test container must register `PutDynamoDbRecordExecutor`, `TouchedIndexes`, and `PutOsDynamoDbRecordExecutor`. Open `__tests__/containers/os.ts`, add the new feature registrations so tests in Task 4 can resolve everything.

Add imports + feature calls for `PutDynamoDbRecordExecutorFeature`, `TouchedIndexesFeature`, `PutOsDynamoDbRecordExecutorFeature`. Leave old `osCommandExecutorFeature` import in place for now — it's removed in Task 10.

- [ ] **Step 8: Run tests**

Run: `yarn test __tests__/features/PutOsDynamoDbRecordExecutor`
Expected: PASS — ~8 behavior tests + 2 classifier tests.

- [ ] **Step 9: Format + ts-check**

Run: `yarn format:fix && yarn ts-check 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 10: Commit**

```bash
git add src/features/PutOsDynamoDbRecordExecutor __tests__/features/PutOsDynamoDbRecordExecutor __tests__/containers/os.ts
git commit -m "feat(executor): PutOsDynamoDbRecordExecutor — gzip + ensureIndex + delegate"
```

---

## Task 5: Refactor DdbProcessor to new executors

**Files:**
- Modify: `src/features/DdbProcessor/DdbProcessor.ts`
- Modify: `__tests__/features/DdbProcessor/DdbProcessor.test.ts`

- [ ] **Step 1: Rewrite the DdbProcessor test suite first (TDD)**

The new assertions cover: direct dispatch to `PutDynamoDbRecordExecutor` and `S3CopyExecutor`; empty `Commands` short-circuits (no executor calls); warns once per unknown key per instance; does NOT warn for known keys; `getShardState()` still returns `{}`.

Replace the body of `__tests__/features/DdbProcessor/DdbProcessor.test.ts` with a fixture that:
- Builds a Container with `loggerFeature`, `PutDynamoDbRecordExecutorFeature`, `S3CopyExecutorFeature`, plus mock DDB + S3 clients.
- Registers `DdbTransformContextFactory` stub (see `__tests__/features/DdbProcessor/` existing fixtures for the mock pattern).
- Registers `DdbProcessor`.
- Resolves the processor, spies on each executor's `execute`, asserts dispatch.
- For warn-on-unknown: add a custom command via `commands.add({ key: "weird", dedupKey: undefined })` and assert logger.warn was called once for "weird"; call execute again with the same unknown key and assert logger.warn was NOT called a second time.

(Reference the deleted `DdbCommandExecutor.test.ts` for assertion patterns — port grouping + delegation tests to the executor tests in Task 2.)

- [ ] **Step 2: Run to confirm failure**

Run: `yarn test __tests__/features/DdbProcessor`
Expected: FAIL — new deps/types don't exist on the old impl.

- [ ] **Step 3: Rewrite `src/features/DdbProcessor/DdbProcessor.ts`**

```typescript
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { PutDynamoDbRecordExecutor } from "~/features/PutDynamoDbRecordExecutor/abstractions/PutDynamoDbRecordExecutor.ts";
import { S3CopyExecutor } from "~/features/S3CopyExecutor/abstractions/S3CopyExecutor.ts";
import {
    DdbTransformContext,
    DdbTransformContextFactory
} from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { DdbShardState } from "./abstractions/DdbProcessor.ts";

const KNOWN_KEYS: ReadonlySet<string> = new Set([PutRecord.key, S3Copy.key]);

class DdbProcessorImpl implements Processor.Interface<
    BaseRecord,
    DdbTransformContext.Interface<BaseRecord>
> {
    private readonly warnedKeys: Set<string> = new Set();

    public constructor(
        private readonly logger: Logger.Interface,
        private readonly putExecutor: PutDynamoDbRecordExecutor.Interface,
        private readonly s3CopyExecutor: S3CopyExecutor.Interface,
        private readonly contextFactory: DdbTransformContextFactory.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        this.warnOnUnknownKeys(commands);

        const puts = commands.get<PutRecord>(PutRecord.key);
        const copies = commands.get<S3Copy>(S3Copy.key);

        await Promise.all([
            this.putExecutor.execute(puts),
            this.s3CopyExecutor.execute(copies)
        ]);
    }

    public createContext(record: BaseRecord): DdbTransformContext.Interface<BaseRecord> {
        return this.contextFactory.create({ record });
    }

    public getShardState(): DdbShardState {
        return {};
    }

    private warnOnUnknownKeys(commands: Commands): void {
        for (const key of commands.keys()) {
            if (!KNOWN_KEYS.has(key) && !this.warnedKeys.has(key)) {
                this.warnedKeys.add(key);
                this.logger.warn(
                    `DdbProcessor does not handle command key "${key}" — ignored`
                );
            }
        }
    }
}

export const DdbProcessor = Processor.createImplementation({
    implementation: DdbProcessorImpl,
    dependencies: [Logger, PutDynamoDbRecordExecutor, S3CopyExecutor, DdbTransformContextFactory]
});

export namespace DdbProcessor {
    export type ShardState = DdbShardState;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `yarn test __tests__/features/DdbProcessor`
Expected: PASS.

- [ ] **Step 5: Format + ts-check**

Run: `yarn format:fix && yarn ts-check 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add src/features/DdbProcessor __tests__/features/DdbProcessor
git commit -m "refactor(ddb-processor): dispatch to per-command executors; warn-on-unknown"
```

---

## Task 6: Refactor OsProcessor + OsShardState type

**Files:**
- Modify: `src/features/OsProcessor/OsProcessor.ts`
- Modify: `src/features/OsProcessor/abstractions/OsProcessor.ts`
- Modify: `__tests__/features/OsProcessor/OsProcessor.test.ts`

- [ ] **Step 1: Update `OsShardState` type**

Open `src/features/OsProcessor/abstractions/OsProcessor.ts`:

```typescript
import type { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";

export interface OsShardState {
    touchedIndexes: TouchedIndexes.Item[];
}
```

- [ ] **Step 2: Rewrite `src/features/OsProcessor/OsProcessor.ts`**

```typescript
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { PutOsDynamoDbRecordExecutor } from "~/features/PutOsDynamoDbRecordExecutor/abstractions/PutOsDynamoDbRecordExecutor.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import {
    OsTransformContext,
    OsTransformContextFactory
} from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import type { OsShardState } from "./abstractions/OsProcessor.ts";

type OsRecord = OsScanner.Record;

const KNOWN_KEYS: ReadonlySet<string> = new Set([PutRecord.key]);

class OsProcessorImpl implements Processor.Interface<
    OsRecord,
    OsTransformContext.Interface<OsRecord>
> {
    private readonly warnedKeys: Set<string> = new Set();

    public constructor(
        private readonly logger: Logger.Interface,
        private readonly putOsExecutor: PutOsDynamoDbRecordExecutor.Interface,
        private readonly contextFactory: OsTransformContextFactory.Interface,
        private readonly touchedIndexes: TouchedIndexes.Interface
    ) {}

    public async execute(commands: Commands): Promise<void> {
        this.warnOnUnknownKeys(commands);
        const puts = commands.get<PutRecord>(PutRecord.key);
        await this.putOsExecutor.execute(puts);
    }

    public createContext(record: OsRecord): OsTransformContext.Interface<OsRecord> {
        return this.contextFactory.create({ record });
    }

    public getShardState(): OsShardState {
        return { touchedIndexes: this.touchedIndexes.all() };
    }

    private warnOnUnknownKeys(commands: Commands): void {
        for (const key of commands.keys()) {
            if (!KNOWN_KEYS.has(key) && !this.warnedKeys.has(key)) {
                this.warnedKeys.add(key);
                this.logger.warn(
                    `OsProcessor does not handle command key "${key}" — ignored`
                );
            }
        }
    }
}

export const OsProcessor = Processor.createImplementation({
    implementation: OsProcessorImpl,
    dependencies: [Logger, PutOsDynamoDbRecordExecutor, OsTransformContextFactory, TouchedIndexes]
});

export namespace OsProcessor {
    export type ShardState = OsShardState;
}
```

- [ ] **Step 3: Rewrite `__tests__/features/OsProcessor/OsProcessor.test.ts`**

New assertions:
- `execute(commands)` dispatches `PutRecord[]` to `PutOsDynamoDbRecordExecutor`; empty array short-circuit ok.
- `getShardState()` returns `{ touchedIndexes: [] }` initially.
- After a fake executor `.mockImplementation` that calls `touchedIndexes.record(...)`, `getShardState()` returns the array form.
- Warn-on-unknown once per key.

- [ ] **Step 4: Run tests to verify pass**

Run: `yarn test __tests__/features/OsProcessor`
Expected: PASS.

- [ ] **Step 5: Format + ts-check**

Run: `yarn format:fix && yarn ts-check 2>&1 | grep -c "error TS"`
Expected: `0` (may still report errors from bootstrap / handler / hook until Tasks 7–9 land).

If ts-check has errors outside the files changed in this task, note them and continue — they'll be fixed in the next tasks.

- [ ] **Step 6: Commit**

```bash
git add src/features/OsProcessor __tests__/features/OsProcessor
git commit -m "refactor(os-processor): delegate touchedIndexes to abstraction; shard state is Item[]"
```

---

## Task 7: Update bootstrap.ts + downstream shard-state consumers

**Files:**
- Modify: `src/bootstrap.ts`
- Modify: `src/commands/processOsSegment/handler.ts`
- Modify: `src/services/OpenSearchClient/hooks/EnableRefreshHook.ts`
- Modify: `__tests__/commands/processOsSegment.test.ts`

- [ ] **Step 1: Update `src/bootstrap.ts`**

Replace the DDB and OS container blocks:

- DDB container: remove `ddbCommandExecutorFeature` registration; add `PutDynamoDbRecordExecutorFeature` and `S3CopyExecutorFeature`.
- OS container: remove `osCommandExecutorFeature` registration; add `TouchedIndexesFeature`, `PutDynamoDbRecordExecutorFeature`, `PutOsDynamoDbRecordExecutorFeature`.

Imports land in the existing alphabetized order. No changes to scanner / processor registrations (those already register the updated classes).

- [ ] **Step 2: Update `src/commands/processOsSegment/handler.ts`**

Replace the `OsShardStateShape` local interface and the merge logic:

```typescript
import type { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";

interface OsShardStateShape {
    touchedIndexes: TouchedIndexes.Item[];
}

// ... inside handler, merge loop becomes:
const merged = new Map<string, string>();
for (const processor of processors) {
    const state = (processor as { getShardState(): OsShardStateShape }).getShardState();
    if (state && typeof state === "object" && Array.isArray(state.touchedIndexes)) {
        for (const item of state.touchedIndexes) {
            if (!merged.has(item.indexName)) {
                merged.set(item.indexName, item.originalRefresh);
            }
        }
    }
}

// JSON payload becomes an array too:
const payload: TouchedIndexes.Item[] = Array.from(merged, ([indexName, originalRefresh]) => ({
    indexName,
    originalRefresh
}));
await writeFile(stateFile, JSON.stringify(payload), "utf-8");
```

- [ ] **Step 3: Update `EnableRefreshHook` to parse array form**

In `src/services/OpenSearchClient/hooks/EnableRefreshHook.ts`:

```typescript
private async loadTouchedIndexes(): Promise<Map<string, string>> {
    const merged = new Map<string, string>();
    const transferDir = join(process.cwd(), ".transfer", this.transferContext.runId);

    try {
        const files = await readdir(transferDir);
        const indexFiles = files.filter(f => f.endsWith("-indexes.json"));

        for (const file of indexFiles) {
            try {
                const content = await readFile(join(transferDir, file), "utf-8");
                const data = JSON.parse(content) as TouchedIndexes.Item[];
                for (const item of data) {
                    if (!merged.has(item.indexName)) {
                        merged.set(item.indexName, item.originalRefresh);
                    }
                }
            } catch (error) {
                this.logger.warn(`Failed to read index file ${file}: ${error}`);
            }
        }
    } catch {
        // Directory doesn't exist — no indexes were touched
    }

    return merged;
}
```

Add the type import at the top:

```typescript
import type { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
```

- [ ] **Step 4: Update `__tests__/commands/processOsSegment.test.ts`**

The mock processor's `getShardState()` must return the new array shape. Update the fixtures:

```typescript
getShardState() {
    return {
        touchedIndexes: [...touchedIndexesMap.entries()].map(
            ([indexName, originalRefresh]) => ({ indexName, originalRefresh })
        )
    };
}
```

Also update any assertions that read `<segment>-indexes.json` to expect the array form.

- [ ] **Step 5: Run the full test suite**

Run: `yarn test`
Expected: PASS — 89+ files, all tests green. Only the old `DdbCommandExecutor` / `OsCommandExecutor` dirs may still resolve if they're still on disk; they stop being registered here but will be deleted in Task 10.

- [ ] **Step 6: ts-check clean**

Run: `yarn ts-check 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 7: Commit**

```bash
git add src/bootstrap.ts src/commands/processOsSegment/handler.ts \
        src/services/OpenSearchClient/hooks/EnableRefreshHook.ts \
        __tests__/commands/processOsSegment.test.ts
git commit -m "refactor(bootstrap): wire per-command executors; shard-state payload is Item[]"
```

---

## Task 8: Delete old executors + their tests

**Files:**
- Delete: `src/features/DdbCommandExecutor/` (entire dir)
- Delete: `src/features/OsCommandExecutor/` (entire dir)
- Delete: `__tests__/features/DdbCommandExecutor/` (entire dir)
- Delete: `__tests__/features/OsCommandExecutor/` (entire dir)
- Modify: `__tests__/containers/os.ts` (drop the old feature import)
- Modify: `__tests__/containers/ddb.ts` (drop the old feature import)

- [ ] **Step 1: Verify the old executors are no longer referenced anywhere**

Run (via Grep):
```
DdbCommandExecutor   → expect hits only in the paths scheduled for deletion
OsCommandExecutor    → expect hits only in the paths scheduled for deletion
```

If any production import remains, fix it before deletion (should be none after Tasks 5–7).

- [ ] **Step 2: Remove old feature imports from test containers**

Open `__tests__/containers/ddb.ts` and `__tests__/containers/os.ts`. Delete the `ddbCommandExecutorFeature` / `osCommandExecutorFeature` imports + calls. (They are redundant — the new feature registrations already landed in Tasks 2–4 + 7.)

- [ ] **Step 3: Delete the old directories**

```bash
rm -rf src/features/DdbCommandExecutor
rm -rf src/features/OsCommandExecutor
rm -rf __tests__/features/DdbCommandExecutor
rm -rf __tests__/features/OsCommandExecutor
```

- [ ] **Step 4: Run format + ts-check + tests**

```bash
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # expect 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3  # expect all green
```

- [ ] **Step 5: Commit**

```bash
git add -A src/features __tests__/features __tests__/containers
git commit -m "chore: delete DdbCommandExecutor + OsCommandExecutor (replaced by per-command executors)"
```

---

## Task 9: Update docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-04-19-command-executor-split.md` (this file — mark tasks complete)

- [ ] **Step 1: Update AGENTS.md Section 3 (project structure)**

In the `src/features/` tree, replace `DdbCommandExecutor/` and `OsCommandExecutor/` with:

```
│   ├── PutDynamoDbRecordExecutor/  # PutRecord[] → TargetDynamoDbClient.batchPut
│   ├── S3CopyExecutor/             # S3Copy[]   → TargetS3Client.batchCopy
│   ├── PutOsDynamoDbRecordExecutor/# gzip + ensureIndex + delegate to PutDdb
│   ├── TouchedIndexes/             # per-worker Map of index → original refresh_interval
```

- [ ] **Step 2: Update AGENTS.md Section 4 (Scanner / Processor / Executor)**

Change the "Executor" bullet to:

> - **Executor** = one per command type per target. `PutDynamoDbRecordExecutor` writes `PutRecord[]` to DDB. `S3CopyExecutor` runs `S3Copy[]` against S3. `PutOsDynamoDbRecordExecutor` layers gzip + `ensureIndex` over a delegated `PutDynamoDbRecordExecutor`. `DdbProcessor` / `OsProcessor` pick commands from the `Commands` bag by key and dispatch to the owning executor; unknown keys warn once per key per worker. Retry / classifier / `retryMode:"adaptive"` live on the underlying clients.

- [ ] **Step 3: Add Section 6 hard-won decision**

Add to the list:

> - **One executor per command type** — command-type executors are single-responsibility (`PutDynamoDbRecordExecutor`, `S3CopyExecutor`, `PutOsDynamoDbRecordExecutor`). Processors own dispatch and unknown-key warnings. Adding a new command = adding a new executor without touching existing ones. `PutOsDynamoDbRecordExecutor` composes `PutDynamoDbRecordExecutor` for the final write; it does NOT duplicate DDB put logic. Cross-cutting shard state (e.g., `TouchedIndexes`) lives in dedicated DI singletons, not on the processor.

- [ ] **Step 4: Format + final verify**

```bash
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): reflect per-command executor split + TouchedIndexes abstraction"
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: `yarn format:fix`** — expect no pending changes after prior commits.

- [ ] **Step 2: `yarn ts-check 2>&1 | grep -c "error TS"`** — expect `0`.

- [ ] **Step 3: `yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3`** — expect pass counts +approximately 15 new tests (Tasks 1–4 add tests; Tasks 5–6 rewrite existing ones, net roughly flat apart from new executor/touched-indexes suites).

- [ ] **Step 4: Smoke greps**

```
grep "DdbCommandExecutor" src __tests__     # 0 hits
grep "OsCommandExecutor"  src __tests__     # 0 hits
grep "isRetryableAwsError" src/features/PutOsDynamoDbRecordExecutor   # at least 1 hit (withRetry guard)
grep "PutDynamoDbRecordExecutor" src/features/PutOsDynamoDbRecordExecutor   # dependency reference
```

- [ ] **Step 5: `git log --oneline -12`** — expect 9 new commits from Tasks 1–9, plus the spec + this plan.

No commit in this task.
