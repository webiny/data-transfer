# Access Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a per-processor preflight access check before any transfer segment starts, collecting structured results (ok / denied / unknown) per resource and aborting the transfer on any `denied` entry.

**Architecture:** Add a required `checkAccess(): Promise<AccessCheck.Entry[]>` method to `Processor.Interface`. Each processor probes its own resources (DynamoDB `DescribeTable`, S3 `HeadBucket`, OpenSearch `listIndexes`) and returns labelled entries. A new `AccessChecker` DI service fans out to all registered processors via `runner.getProcessors()`, flattens the results, and the run handler prints the table and exits on any denial.

**Tech Stack:** AWS SDK v3 (`@webiny/aws-sdk/client-dynamodb`, `@webiny/aws-sdk/client-s3`), vitest `vi.mock`, `@webiny/di` container, existing `isAccessDeniedError` helper (added to `src/base/isRetryableAwsError.ts`).

---

### Task 1: AccessCheck types + required checkAccess() + stubs

**Files:**
- Modify: `src/domain/pipeline/abstractions/Processor.ts`
- Modify: `src/features/DdbProcessor/DdbProcessor.ts`
- Modify: `src/features/AuditLogProcessor/AuditLogProcessor.ts`
- Modify: `src/features/S3Processor/S3Processor.ts`
- Modify: `src/features/OsProcessor/OsProcessor.ts`
- Modify: `__tests__/domain/pipeline/Processor.test.ts`

- [ ] **Step 1: Add `AccessCheck` namespace and required `checkAccess()` to `Processor.ts`**

In `src/domain/pipeline/abstractions/Processor.ts`, add the `AccessCheck` namespace before the `IProcessor` interface and add `checkAccess()` as a required method:

```ts
export namespace AccessCheck {
    export type Status = "ok" | "denied" | "unknown";

    export interface Entry {
        label: string;
        status: Status;
    }

    export type Report = Entry[];
}

interface IProcessor<
    TBaseContext extends BaseTransformContext.Interface<unknown> =
        BaseTransformContext.Interface<unknown>,
    TSlice = Record<string, never>
> {
    extendContext?(base: TBaseContext): TSlice;
    onEnd?(ctx: TBaseContext & TSlice): void | Promise<void>;

    /**
     * Pre-transfer access check. Called before any segment worker is spawned.
     * Returns one entry per probed resource (table, bucket, cluster endpoint).
     * "denied" entries abort the transfer; "unknown" entries warn and proceed.
     */
    checkAccess(): Promise<AccessCheck.Entry[]>;

    getGuardWarning?(): Promise<string | null>;
    execute(commands: Commands): Promise<void>;
    afterShard?(ctx: IAfterShardContext): void | Promise<void>;
}
```

- [ ] **Step 2: Add stub `checkAccess()` to `DdbProcessor.ts`**

Inside `DdbProcessorImpl`, add after `onEnd`:

```ts
public async checkAccess(): Promise<AccessCheck.Entry[]> {
    return [];
}
```

Also add to the import in `DdbProcessor.ts`:
```ts
import { Processor, AccessCheck } from "~/domain/pipeline/abstractions/Processor.ts";
```

Wait — `AccessCheck` is exported from `Processor.ts`, so update the import line in `DdbProcessor.ts` from:
```ts
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
```
to:
```ts
import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.ts";
```

- [ ] **Step 3: Add stub `checkAccess()` to `AuditLogProcessor.ts`**

Inside `AuditLogProcessorImpl`, add after `onEnd`:

```ts
public async checkAccess(): Promise<AccessCheck.Entry[]> {
    return [];
}
```

Update the import at the top of `AuditLogProcessor.ts`:
```ts
import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.ts";
```

- [ ] **Step 4: Add stub `checkAccess()` to `S3Processor.ts`**

Inside `S3ProcessorImpl`, add after `getGuardWarning`:

```ts
public async checkAccess(): Promise<AccessCheck.Entry[]> {
    return [];
}
```

Update the import at the top of `S3Processor.ts`:
```ts
import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.ts";
```

- [ ] **Step 5: Add stub `checkAccess()` to `OsProcessor.ts`**

Inside `OsProcessorImpl`, add after `onEnd`:

```ts
public async checkAccess(): Promise<AccessCheck.Entry[]> {
    return [];
}
```

Update the import at the top of `OsProcessor.ts`:
```ts
import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.ts";
```

- [ ] **Step 6: Add `checkAccess()` to `FakeProcessor` in `__tests__/domain/pipeline/Processor.test.ts`**

Inside `FakeProcessor`, add after `afterShard`:

```ts
public async checkAccess(): Promise<AccessCheck.Entry[]> {
    return [];
}
```

Add `AccessCheck` to the import at the top:
```ts
import { Processor, AccessCheck } from "~/domain/pipeline/index.ts";
```

(Verify `AccessCheck` is re-exported from `~/domain/pipeline/index.ts`. If not, import directly from `~/domain/pipeline/abstractions/Processor.ts`.)

- [ ] **Step 7: Run the full test suite**

```bash
yarn test
```

Expected: all tests pass. If any test fails, it is because a processor instance somewhere implements `Processor.Interface` without `checkAccess()` — find it with `grep -rn "implements Processor.Interface" src __tests__` and add the stub.

- [ ] **Step 8: Commit**

```bash
git add src/domain/pipeline/abstractions/Processor.ts \
  src/features/DdbProcessor/DdbProcessor.ts \
  src/features/AuditLogProcessor/AuditLogProcessor.ts \
  src/features/S3Processor/S3Processor.ts \
  src/features/OsProcessor/OsProcessor.ts \
  __tests__/domain/pipeline/Processor.test.ts
git commit -m "feat: add required checkAccess() to Processor.Interface with stub implementations"
```

---

### Task 2: isAccessDeniedError helper + DdbProcessor.checkAccess()

**Files:**
- Modify: `src/base/isRetryableAwsError.ts`
- Modify: `src/base/index.ts`
- Modify: `src/features/DdbProcessor/DdbProcessor.ts`
- Modify: `__tests__/features/DdbProcessor/DdbProcessor.test.ts`

- [ ] **Step 1: Add `isAccessDeniedError` to `src/base/isRetryableAwsError.ts`**

Add after the `isTokenBucketExhausted` function:

```ts
/**
 * Returns true when the error indicates an IAM / credentials access denial.
 * Covers DynamoDB AccessDeniedException, S3 AccessDenied, and HTTP 403.
 */
export function isAccessDeniedError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const candidate = error as AwsErrorLike;
    const name = candidate.name ?? candidate.code;
    if (typeof name === "string" && TERMINAL_ERROR_NAMES.has(name)) {
        return true;
    }
    return candidate.$metadata?.httpStatusCode === 403;
}
```

- [ ] **Step 2: Export `isAccessDeniedError` from `src/base/index.ts`**

Update the existing export block:

```ts
export {
    isRetryableAwsError,
    isThrottlingError,
    isAccessDeniedError,
} from "./isRetryableAwsError.ts";
```

- [ ] **Step 3: Write failing tests for `DdbProcessor.checkAccess()`**

Add to `__tests__/features/DdbProcessor/DdbProcessor.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DynamoDB } from "@webiny/aws-sdk/client-dynamodb/index.js";

vi.mock("@webiny/aws-sdk/client-dynamodb/index.js", () => ({
    DynamoDB: vi.fn()
}));
```

Then add a new `describe("checkAccess", ...)` block at the end of the existing `describe("DdbProcessor", ...)`:

```ts
describe("checkAccess", () => {
    let mockDescribeTable: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockDescribeTable = vi.fn();
        vi.mocked(DynamoDB).mockImplementation(
            () => ({ describeTable: mockDescribeTable }) as unknown as DynamoDB
        );
    });

    it("returns ok entries for source and target tables when DescribeTable succeeds", async () => {
        mockDescribeTable.mockResolvedValue({});
        const container = createDdbContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "DdbProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries).toHaveLength(2);
        expect(entries[0]).toEqual({ label: "DynamoDB source table: source-table", status: "ok" });
        expect(entries[1]).toEqual({ label: "DynamoDB target table: target-table", status: "ok" });
    });

    it("returns denied when DescribeTable throws AccessDeniedException on source", async () => {
        mockDescribeTable
            .mockRejectedValueOnce(
                Object.assign(new Error("Access denied"), { name: "AccessDeniedException" })
            )
            .mockResolvedValue({});
        const container = createDdbContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "DdbProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "DynamoDB source table: source-table",
            status: "denied"
        });
        expect(entries[1]).toEqual({
            label: "DynamoDB target table: target-table",
            status: "ok"
        });
    });

    it("returns unknown when DescribeTable throws a non-access error", async () => {
        mockDescribeTable.mockRejectedValue(
            Object.assign(new Error("connection timeout"), { name: "ETIMEDOUT" })
        );
        const container = createDdbContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "DdbProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "DynamoDB source table: source-table",
            status: "unknown"
        });
        expect(entries[1]).toEqual({
            label: "DynamoDB target table: target-table",
            status: "unknown"
        });
    });
});
```

- [ ] **Step 4: Run the new tests to verify they fail**

```bash
yarn test __tests__/features/DdbProcessor/DdbProcessor.test.ts
```

Expected: the three new `checkAccess` tests FAIL (the stub returns `[]`, so `entries` has length 0).

- [ ] **Step 5: Implement `DdbProcessor.checkAccess()`**

Replace the stub in `DdbProcessorImpl` with:

```ts
import { DynamoDB } from "@webiny/aws-sdk/client-dynamodb/index.js";
import { AccessCheck, Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { isAccessDeniedError } from "~/base/index.ts";
```

(Add these to the imports at the top of `DdbProcessor.ts`.)

Replace the stub method body:

```ts
public async checkAccess(): Promise<AccessCheck.Entry[]> {
    const [sourceEntry, targetEntry] = await Promise.all([
        this.describeTable(
            this.config.source.credentials,
            this.config.source.region,
            this.config.source.dynamodb.tableName,
            "source"
        ),
        this.describeTable(
            this.config.target.credentials,
            this.config.target.region,
            this.config.target.dynamodb.tableName,
            "target"
        )
    ]);
    return [sourceEntry, targetEntry];
}

private async describeTable(
    credentials: MigrationConfig.Interface["source"]["credentials"],
    region: string,
    tableName: string,
    side: string
): Promise<AccessCheck.Entry> {
    const label = `DynamoDB ${side} table: ${tableName}`;
    try {
        const client = new DynamoDB({ region, credentials: credentials as never });
        await client.describeTable({ TableName: tableName });
        return { label, status: "ok" };
    } catch (error) {
        if (isAccessDeniedError(error)) {
            return { label, status: "denied" };
        }
        return { label, status: "unknown" };
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
yarn test __tests__/features/DdbProcessor/DdbProcessor.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Run full suite to check for regressions**

```bash
yarn test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/base/isRetryableAwsError.ts src/base/index.ts src/features/DdbProcessor/DdbProcessor.ts __tests__/features/DdbProcessor/DdbProcessor.test.ts
git commit -m "feat: implement DdbProcessor.checkAccess() via DescribeTable"
```

---

### Task 3: AuditLogProcessor.checkAccess()

**Files:**
- Modify: `src/features/AuditLogProcessor/AuditLogProcessor.ts`
- Modify: `__tests__/features/AuditLogProcessor/AuditLogProcessor.test.ts`

- [ ] **Step 1: Write failing tests for `AuditLogProcessor.checkAccess()`**

Add to `__tests__/features/AuditLogProcessor/AuditLogProcessor.test.ts`:

```ts
import { vi, beforeEach } from "vitest";
import { DynamoDB } from "@webiny/aws-sdk/client-dynamodb/index.js";

vi.mock("@webiny/aws-sdk/client-dynamodb/index.js", () => ({
    DynamoDB: vi.fn()
}));
```

Add a `describe("checkAccess", ...)` block:

```ts
describe("checkAccess", () => {
    let mockDescribeTable: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockDescribeTable = vi.fn();
        vi.mocked(DynamoDB).mockImplementation(
            () => ({ describeTable: mockDescribeTable }) as unknown as DynamoDB
        );
    });

    it("returns empty array when audit log is not configured", async () => {
        const container = createDdbContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "AuditLogProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries).toHaveLength(0);
    });

    it("returns ok when DescribeTable succeeds for the audit log table", async () => {
        mockDescribeTable.mockResolvedValue({});
        const container = createDdbContainer({
            auditLogTable: "audit-log-table"
        });
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "AuditLogProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries).toHaveLength(1);
        expect(entries[0]).toEqual({
            label: "DynamoDB audit log table: audit-log-table",
            status: "ok"
        });
    });

    it("returns denied when DescribeTable throws AccessDeniedException", async () => {
        mockDescribeTable.mockRejectedValue(
            Object.assign(new Error("Access denied"), { name: "AccessDeniedException" })
        );
        const container = createDdbContainer({
            auditLogTable: "audit-log-table"
        });
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "AuditLogProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "DynamoDB audit log table: audit-log-table",
            status: "denied"
        });
    });

    it("returns unknown for non-access errors", async () => {
        mockDescribeTable.mockRejectedValue(new Error("ResourceNotFoundException"));
        const container = createDdbContainer({
            auditLogTable: "audit-log-table"
        });
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "AuditLogProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "DynamoDB audit log table: audit-log-table",
            status: "unknown"
        });
    });
});
```

Note: `createDdbContainer` in `__tests__/containers/ddb.ts` needs to accept an `auditLogTable` option. Check `DdbContainerOptions` — if it doesn't have `auditLogTable`, add it:

In `__tests__/containers/ddb.ts`, add to `DdbContainerOptions`:
```ts
auditLogTable?: string;
```

And in the config object inside `createDdbContainer`:
```ts
target: {
    // ... existing fields ...
    auditLog: options.auditLogTable
        ? { dynamodb: { tableName: options.auditLogTable } }
        : null
}
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
yarn test __tests__/features/AuditLogProcessor/AuditLogProcessor.test.ts
```

Expected: the new `checkAccess` tests FAIL.

- [ ] **Step 3: Implement `AuditLogProcessor.checkAccess()`**

Add imports to the top of `AuditLogProcessor.ts`:

```ts
import { DynamoDB } from "@webiny/aws-sdk/client-dynamodb/index.js";
import { isAccessDeniedError } from "~/base/index.ts";
```

Replace the stub method body in `AuditLogProcessorImpl`:

```ts
public async checkAccess(): Promise<AccessCheck.Entry[]> {
    const tableName = this.config.target.auditLog?.dynamodb?.tableName ?? null;
    if (!tableName) {
        return [];
    }
    const label = `DynamoDB audit log table: ${tableName}`;
    try {
        const client = new DynamoDB({
            region: this.config.target.region,
            credentials: this.config.target.credentials as never
        });
        await client.describeTable({ TableName: tableName });
        return [{ label, status: "ok" }];
    } catch (error) {
        if (isAccessDeniedError(error)) {
            return [{ label, status: "denied" }];
        }
        return [{ label, status: "unknown" }];
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
yarn test __tests__/features/AuditLogProcessor/AuditLogProcessor.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/AuditLogProcessor/AuditLogProcessor.ts __tests__/features/AuditLogProcessor/AuditLogProcessor.test.ts __tests__/containers/ddb.ts
git commit -m "feat: implement AuditLogProcessor.checkAccess() via DescribeTable"
```

---

### Task 4: S3Processor.checkAccess()

**Files:**
- Modify: `src/features/S3Processor/S3Processor.ts`
- Modify: `__tests__/features/S3Processor/S3Processor.test.ts`

- [ ] **Step 1: Write failing tests for `S3Processor.checkAccess()`**

The test file already imports `vi` and `beforeEach`. Add the mock at the top of the file (it is hoisted by vitest, but write it near other imports):

```ts
import { S3 } from "@webiny/aws-sdk/client-s3/index.js";

vi.mock("@webiny/aws-sdk/client-s3/index.js", () => ({
    S3: vi.fn()
}));
```

Add a `describe("checkAccess", ...)` block inside the outer `describe("S3Processor", ...)`:

```ts
describe("checkAccess", () => {
    let mockHeadBucket: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockHeadBucket = vi.fn();
        vi.mocked(S3).mockImplementation(
            () => ({ headBucket: mockHeadBucket }) as unknown as S3
        );
    });

    it("returns ok entries for source and target buckets when HeadBucket succeeds", async () => {
        mockHeadBucket.mockResolvedValue({});
        const container = createDdbContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<any, any>;

        const entries = await processor.checkAccess();

        expect(entries).toHaveLength(2);
        expect(entries[0]).toEqual({ label: "S3 source bucket: source-bucket", status: "ok" });
        expect(entries[1]).toEqual({ label: "S3 target bucket: target-bucket", status: "ok" });
    });

    it("returns denied when HeadBucket throws AccessDenied on source", async () => {
        mockHeadBucket
            .mockRejectedValueOnce(
                Object.assign(new Error("Access denied"), { name: "AccessDenied" })
            )
            .mockResolvedValue({});
        const container = createDdbContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<any, any>;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({ label: "S3 source bucket: source-bucket", status: "denied" });
        expect(entries[1]).toEqual({ label: "S3 target bucket: target-bucket", status: "ok" });
    });

    it("returns denied when HeadBucket returns HTTP 403", async () => {
        mockHeadBucket.mockRejectedValue(
            Object.assign(new Error("Forbidden"), {
                $metadata: { httpStatusCode: 403 }
            })
        );
        const container = createDdbContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<any, any>;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({ label: "S3 source bucket: source-bucket", status: "denied" });
        expect(entries[1]).toEqual({ label: "S3 target bucket: target-bucket", status: "denied" });
    });

    it("returns unknown for non-access errors", async () => {
        mockHeadBucket.mockRejectedValue(new Error("NoSuchBucket"));
        const container = createDdbContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor === S3Processor) as unknown as Processor.Interface<any, any>;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "S3 source bucket: source-bucket",
            status: "unknown"
        });
    });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
yarn test __tests__/features/S3Processor/S3Processor.test.ts
```

Expected: the new `checkAccess` tests FAIL (stub returns `[]`).

- [ ] **Step 3: Implement `S3Processor.checkAccess()`**

Add to the imports at the top of `S3Processor.ts`:

```ts
import { S3 } from "@webiny/aws-sdk/client-s3/index.js";
import { isAccessDeniedError } from "~/base/index.ts";
```

Replace the stub method body in `S3ProcessorImpl`:

```ts
public async checkAccess(): Promise<AccessCheck.Entry[]> {
    const [sourceEntry, targetEntry] = await Promise.all([
        this.headBucket(
            this.config.source.credentials,
            this.config.source.region,
            this.config.source.s3.bucket,
            "source"
        ),
        this.headBucket(
            this.config.target.credentials,
            this.config.target.region,
            this.config.target.s3.bucket,
            "target"
        )
    ]);
    return [sourceEntry, targetEntry];
}

private async headBucket(
    credentials: MigrationConfig.Interface["source"]["credentials"],
    region: string,
    bucket: string,
    side: string
): Promise<AccessCheck.Entry> {
    const label = `S3 ${side} bucket: ${bucket}`;
    try {
        const client = new S3({ region, credentials: credentials as never });
        await client.headBucket({ Bucket: bucket });
        return { label, status: "ok" };
    } catch (error) {
        if (isAccessDeniedError(error)) {
            return { label, status: "denied" };
        }
        return { label, status: "unknown" };
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
yarn test __tests__/features/S3Processor/S3Processor.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/S3Processor/S3Processor.ts __tests__/features/S3Processor/S3Processor.test.ts
git commit -m "feat: implement S3Processor.checkAccess() via HeadBucket"
```

---

### Task 5: OsProcessor.checkAccess()

**Files:**
- Modify: `src/features/OsProcessor/OsProcessor.ts`
- Modify: `__tests__/features/OsProcessor/OsProcessor.test.ts`

- [ ] **Step 1: Write failing tests for `OsProcessor.checkAccess()`**

Add to `__tests__/features/OsProcessor/OsProcessor.test.ts` (check if `vi` is already imported — add it if not):

```ts
import { vi } from "vitest";
```

Add a `describe("checkAccess", ...)` block:

```ts
describe("checkAccess", () => {
    it("returns ok when listIndexes succeeds", async () => {
        const container = createOsContainer();
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "OsProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries).toHaveLength(1);
        expect(entries[0]).toEqual({
            label: "OpenSearch cluster: https://es.example.com",
            status: "ok"
        });
    });

    it("returns denied when listIndexes throws a 403 error", async () => {
        const container = createOsContainer();
        const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
        vi.spyOn(osClient, "listIndexes").mockRejectedValue(
            Object.assign(new Error("Forbidden"), { statusCode: 403 })
        );
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "OsProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "OpenSearch cluster: https://es.example.com",
            status: "denied"
        });
    });

    it("returns unknown when listIndexes throws a non-access error", async () => {
        const container = createOsContainer();
        const osClient = container.resolve(OpenSearchClient) as MockOpenSearchClient;
        vi.spyOn(osClient, "listIndexes").mockRejectedValue(new Error("connection refused"));
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "OsProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries[0]).toEqual({
            label: "OpenSearch cluster: https://es.example.com",
            status: "unknown"
        });
    });

    it("returns empty array when OpenSearch is not configured", async () => {
        const container = createOsContainer({ noOpenSearch: true });
        const processor = container
            .resolveAll(Processor)
            .find(p => p.constructor.name === "OsProcessorImpl")!;

        const entries = await processor.checkAccess();

        expect(entries).toHaveLength(0);
    });
});
```

Note: The `noOpenSearch: true` option needs to be added to `createOsContainer` and `OsContainerOptions`. Add it to `__tests__/containers/os.ts`:

```ts
export interface OsContainerOptions {
    // ... existing fields ...
    noOpenSearch?: boolean;
}
```

And in the config object:
```ts
target: {
    // ... existing fields ...
    opensearch: options.noOpenSearch
        ? undefined
        : {
              endpoint: "https://es.example.com",
              tableName: "target-os",
              service: "opensearch" as const,
              indexPrefix: options.indexPrefix ?? ""
          }
}
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
yarn test __tests__/features/OsProcessor/OsProcessor.test.ts
```

Expected: the new `checkAccess` tests FAIL.

- [ ] **Step 3: Implement `OsProcessor.checkAccess()`**

Replace the stub method body in `OsProcessorImpl`:

```ts
public async checkAccess(): Promise<AccessCheck.Entry[]> {
    if (!this.config.target.opensearch) {
        return [];
    }
    const endpoint = this.config.target.opensearch.endpoint;
    const label = `OpenSearch cluster: ${endpoint}`;
    try {
        await this.osClient.listIndexes();
        return [{ label, status: "ok" }];
    } catch (error) {
        const e = error as { statusCode?: number };
        if (e.statusCode === 401 || e.statusCode === 403) {
            return [{ label, status: "denied" }];
        }
        return [{ label, status: "unknown" }];
    }
}
```

Note: `this.osClient` uses the lazy getter already defined in `OsProcessorImpl`. No new imports needed.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
yarn test __tests__/features/OsProcessor/OsProcessor.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/OsProcessor/OsProcessor.ts __tests__/features/OsProcessor/OsProcessor.test.ts __tests__/containers/os.ts
git commit -m "feat: implement OsProcessor.checkAccess() via listIndexes"
```

---

### Task 6: AccessChecker abstraction, implementation, and tests

**Files:**
- Create: `src/features/AccessChecker/abstractions/AccessChecker.ts`
- Create: `src/features/AccessChecker/AccessChecker.ts`
- Create: `src/features/AccessChecker/feature.ts`
- Create: `src/features/AccessChecker/index.ts`
- Create: `__tests__/features/AccessChecker/AccessChecker.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `__tests__/features/AccessChecker/AccessChecker.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { AccessChecker, AccessCheckerFeature } from "~/features/AccessChecker/index.ts";

function makeRunner(
    processors: Array<{ checkAccess(): Promise<{ label: string; status: string }[]>; execute(): Promise<void> }>
): PipelineRunner.Interface {
    return {
        register: vi.fn(),
        run: vi.fn(),
        getProcessors: vi.fn().mockReturnValue(processors),
        getShardStats: vi.fn().mockReturnValue(null)
    } as unknown as PipelineRunner.Interface;
}

describe("AccessChecker", () => {
    it("returns a flat report from all processor checkAccess results", async () => {
        const p1 = {
            checkAccess: vi.fn().mockResolvedValue([{ label: "DynamoDB source", status: "ok" }]),
            execute: vi.fn()
        };
        const p2 = {
            checkAccess: vi.fn().mockResolvedValue([
                { label: "S3 source bucket: sb", status: "ok" },
                { label: "S3 target bucket: tb", status: "denied" }
            ]),
            execute: vi.fn()
        };

        const container = new Container();
        container.registerInstance(ContainerToken, container);
        container.registerInstance(PipelineRunner, makeRunner([p1, p2]));
        AccessCheckerFeature.register(container);

        const checker = container.resolve(AccessChecker);
        const report = await checker.run();

        expect(report).toHaveLength(3);
        expect(report[0]).toEqual({ label: "DynamoDB source", status: "ok" });
        expect(report[1]).toEqual({ label: "S3 source bucket: sb", status: "ok" });
        expect(report[2]).toEqual({ label: "S3 target bucket: tb", status: "denied" });
    });

    it("returns empty report when no processors are registered", async () => {
        const container = new Container();
        container.registerInstance(ContainerToken, container);
        container.registerInstance(PipelineRunner, makeRunner([]));
        AccessCheckerFeature.register(container);

        const checker = container.resolve(AccessChecker);
        const report = await checker.run();

        expect(report).toHaveLength(0);
    });

    it("returns empty report when all processors return empty arrays", async () => {
        const p = {
            checkAccess: vi.fn().mockResolvedValue([]),
            execute: vi.fn()
        };
        const container = new Container();
        container.registerInstance(ContainerToken, container);
        container.registerInstance(PipelineRunner, makeRunner([p]));
        AccessCheckerFeature.register(container);

        const checker = container.resolve(AccessChecker);
        const report = await checker.run();

        expect(report).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
yarn test __tests__/features/AccessChecker/AccessChecker.test.ts
```

Expected: FAIL — `~/features/AccessChecker/index.ts` does not exist.

- [ ] **Step 3: Create the AccessChecker abstraction**

Create `src/features/AccessChecker/abstractions/AccessChecker.ts`:

```ts
import { createAbstraction } from "~/base/index.ts";
import type { AccessCheck } from "~/domain/pipeline/abstractions/Processor.ts";

interface IAccessChecker {
    run(): Promise<AccessCheck.Report>;
}

export const AccessChecker = createAbstraction<IAccessChecker>("Core/AccessChecker");

export namespace AccessChecker {
    export type Interface = IAccessChecker;
    export type Report = AccessCheck.Report;
    export type Entry = AccessCheck.Entry;
}
```

- [ ] **Step 4: Create the AccessChecker implementation**

Create `src/features/AccessChecker/AccessChecker.ts`:

```ts
import { AccessChecker as AccessCheckerAbstraction } from "./abstractions/AccessChecker.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import type { AccessCheck } from "~/domain/pipeline/abstractions/Processor.ts";

class AccessCheckerImpl implements AccessCheckerAbstraction.Interface {
    public constructor(private readonly runner: PipelineRunner.Interface) {}

    public async run(): Promise<AccessCheck.Report> {
        const processors = this.runner.getProcessors();
        const nested = await Promise.all(processors.map(p => p.checkAccess()));
        return nested.flat();
    }
}

export const AccessChecker = AccessCheckerAbstraction.createImplementation({
    implementation: AccessCheckerImpl,
    dependencies: [PipelineRunner]
});
```

- [ ] **Step 5: Create the feature registration**

Create `src/features/AccessChecker/feature.ts`:

```ts
import { createFeature } from "~/base/index.ts";
import { AccessChecker } from "./AccessChecker.ts";

export const AccessCheckerFeature = createFeature({
    name: "Core/AccessCheckerFeature",
    register(container) {
        container.register(AccessChecker).inSingletonScope();
    }
});
```

- [ ] **Step 6: Create the index**

Create `src/features/AccessChecker/index.ts`:

```ts
export { AccessChecker } from "./abstractions/AccessChecker.ts";
export { AccessCheckerFeature } from "./feature.ts";
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
yarn test __tests__/features/AccessChecker/AccessChecker.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Run full suite**

```bash
yarn test
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/AccessChecker/ __tests__/features/AccessChecker/
git commit -m "feat: add AccessChecker aggregator service"
```

---

### Task 7: handler.ts + bootstrap.ts + test container wiring

**Files:**
- Modify: `src/commands/run/handler.ts`
- Modify: `src/bootstrap.ts`
- Modify: `__tests__/containers/ddb.ts`
- Modify: `__tests__/containers/os.ts`

- [ ] **Step 1: Register `AccessCheckerFeature` in `src/bootstrap.ts`**

Add the import after the existing processor feature imports:

```ts
import { AccessCheckerFeature } from "~/features/AccessChecker/index.ts";
```

Add the registration at the end of the feature registrations block (after `OsProcessorFeature.register(container)`):

```ts
AccessCheckerFeature.register(container);
```

- [ ] **Step 2: Register `AccessCheckerFeature` in `__tests__/containers/ddb.ts`**

Add the import:

```ts
import { AccessCheckerFeature } from "../../src/features/AccessChecker/index.ts";
```

Add the registration after `AuditLogProcessorFeature.register(container)`:

```ts
AccessCheckerFeature.register(container);
```

- [ ] **Step 3: Register `AccessCheckerFeature` in `__tests__/containers/os.ts`**

Add the import:

```ts
import { AccessCheckerFeature } from "../../src/features/AccessChecker/index.ts";
```

Add the registration after `OsProcessorFeature.register(container)`:

```ts
AccessCheckerFeature.register(container);
```

- [ ] **Step 4: Integrate `AccessChecker` in `src/commands/run/handler.ts`**

Add the import near the existing feature imports:

```ts
import { AccessChecker } from "~/features/AccessChecker/index.ts";
```

Add the access check block immediately after `preset.configure(...)` (before the existing `guardWarnings` block, around line 95):

```ts
const accessChecker = container.resolve(AccessChecker);
const accessReport = await accessChecker.run();

if (accessReport.length > 0) {
    logger.info("Pre-transfer access check:");
    for (const entry of accessReport) {
        if (entry.status === "ok") {
            logger.info(`  ok  ${entry.label}`);
        } else if (entry.status === "denied") {
            logger.error(`  DENIED  ${entry.label}`);
        } else {
            logger.warn(`  unknown  ${entry.label}`);
        }
    }
}

const denied = accessReport.filter(e => e.status === "denied");
if (denied.length > 0) {
    logger.fatal("Access check failed — aborting transfer.");
    process.exit(1);
}
```

- [ ] **Step 5: Run the full test suite**

```bash
yarn test
```

Expected: all tests PASS.

- [ ] **Step 6: Run type-check**

```bash
yarn ts-check
```

Expected: 0 new errors (the 5 pre-existing ts-check errors on main are unrelated to this feature).

- [ ] **Step 7: Commit**

```bash
git add src/commands/run/handler.ts src/bootstrap.ts __tests__/containers/ddb.ts __tests__/containers/os.ts
git commit -m "feat: wire AccessChecker into run handler; abort on denied access entries"
```
