# Audit Log Processor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transfer v5 audit log CMS entries (`modelId: "acoSearchRecord-auditlogs"`) into a separate v6 audit log DynamoDB table with a fully rebuilt storage shape including PK/SK, 9 GSI pairs, and a data envelope.

**Architecture:** A new `AuditLogProcessor` provides the `putAuditLog` slice method and drains its own `AuditLogPutRecord` command (distinct key from `PutRecord`). Three transformers run sequentially: core fields (id, createdBy, createdOn, expiresAt), data fields (app, action, message, entity, entityId, tags, content), then storage shape (full `IStorageItem` replace). The preset always registers the audit log pipeline before CMS pipelines; if `target.auditLog.dynamodb.tableName` is null, `builder.blackhole()` is called so records are consumed but not written.

**Tech Stack:** TypeScript, Zod (config validation), `@webiny/utils/mdbid.js` (id generation), `@webiny/di` (DI), vitest (tests)

---

## File Map

**Create:**
- `src/domain/transform/commands/AuditLogPutRecord.ts` — distinct command (key `"AUDIT_LOG_PUT_RECORD"`) so draining never collides with `DdbProcessor`'s `PutRecord`
- `src/features/AuditLogProcessor/AuditLogProcessor.ts` — implementation; slice `putAuditLog`; `onEnd` auto-puts; `execute` converts to `PutRecord[]` for `DdbExecutor`
- `src/features/AuditLogProcessor/feature.ts` — registers in container
- `src/features/AuditLogProcessor/index.ts` — barrel
- `src/transformers/auditLogs/coreFieldsTransformer.ts` — sets `id` (mdbid), `createdBy`, `createdOn`, `expiresAt` on record
- `src/transformers/auditLogs/dataFieldsTransformer.ts` — extracts `app`, `action`, `message`, `entity`, `entityId`, `tags`, `content` from `values`
- `src/transformers/auditLogs/storageShapeTransformer.ts` — replaces record with complete `IStorageItem` (PK/SK/GSIs/data/expiresAt TTL)
- `src/transformers/auditLogs/index.ts` — composes and exports `auditLogTransformers` stack
- `__tests__/transformers/auditLogs/coreFieldsTransformer.test.ts`
- `__tests__/transformers/auditLogs/dataFieldsTransformer.test.ts`
- `__tests__/transformers/auditLogs/storageShapeTransformer.test.ts`

**Modify:**
- `src/features/MigrationConfig/schemas/ddb.schema.ts` — split into source/target schemas; add `auditLog` to target; add collision validation
- `src/domain/transform/filters.ts` — add `isAuditLogEntry`
- `__tests__/domain/transform/filters.test.ts` — add `isAuditLogEntry` cases
- `src/transformers/index.ts` — `export * from "./auditLogs/index.ts"`
- `src/bootstrap.ts` — register `AuditLogProcessorFeature` in DDB branch
- `src/presets/v5-to-v6-ddb.ts` — add audit log pipeline (first, before CMS)
- `src/index.ts` — export `AuditLogProcessor`

---

## Source Record Reference

All transformers operate on this shape (real DB example):

```json
{
  "PK": "T#root#L#en-US#CMS#CME#wby-aco-686f7147c0aada0002aa5d0e",
  "SK": "L",
  "tenant": "root",
  "entryId": "wby-aco-686f7147c0aada0002aa5d0e",
  "modelId": "acoSearchRecord-auditlogs",
  "revisionCreatedBy": { "id": "58a2...", "displayName": "Danny Goersdorf", "type": "admin" },
  "revisionCreatedOn": "2025-07-10T07:52:39.413Z",
  "values": {
    "object@data": {
      "text@app": "SECURITY",
      "text@action": "UPDATE",
      "text@message": "User updated",
      "text@entity": "USER",
      "text@entityId": "58a2841f-9831-4b37-92e6-e04e40132db6",
      "text@data": "{\"compression\":\"gzip\",\"value\":\"H4sI...\"}"
    },
    "text@tags": [],
    "text@content": "User updated"
  }
}
```

---

## Task 1: Config schema — split source/target, add `auditLog`

**Files:**
- Modify: `src/features/MigrationConfig/schemas/ddb.schema.ts`

- [ ] **Step 1: Update the schema**

Replace the single `ddbAccountConfigSchema` with separate source and target schemas, add `auditLog` to target, add collision check:

```typescript
import { z } from "zod";
import {
    credentialsOrProviderSchema,
    debugSettingsSchema,
    pipelineSettingsSchema,
    trimmedString,
    tuningSchema
} from "./shared.schema.ts";

const ddbSourceAccountConfigSchema = z.object({
    region: trimmedString(),
    credentials: credentialsOrProviderSchema,
    dynamodb: z.object({ tableName: trimmedString() }),
    s3: z.object({ bucket: trimmedString() })
});

const ddbTargetAccountConfigSchema = ddbSourceAccountConfigSchema.extend({
    // Set to null to skip audit log transfer — those records will be
    // intercepted and discarded (blackholed) instead of falling through
    // to the CMS pipeline.
    auditLog: z
        .object({
            dynamodb: z.object({ tableName: trimmedString().nullable() })
        })
        .nullable()
});

export const ddbTransferInputSchema = z
    .object({
        source: ddbSourceAccountConfigSchema,
        target: ddbTargetAccountConfigSchema,
        pipeline: pipelineSettingsSchema,
        tuning: tuningSchema,
        debug: debugSettingsSchema
    })
    .superRefine((data, ctx) => {
        if (data.source.s3.bucket === data.target.s3.bucket) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "s3", "bucket"],
                message: `Target S3 bucket "${data.target.s3.bucket}" is the same as source — would overwrite source files. Use a different bucket.`
            });
        }
        if (
            data.source.region === data.target.region &&
            data.source.dynamodb.tableName === data.target.dynamodb.tableName
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "dynamodb", "tableName"],
                message: `Target DynamoDB table "${data.target.dynamodb.tableName}" in region "${data.target.region}" matches source. If these are different AWS accounts, rename one or change the target region to make the intent explicit.`
            });
        }
        if (
            data.target.auditLog?.dynamodb?.tableName != null &&
            data.target.auditLog.dynamodb.tableName === data.target.dynamodb.tableName
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "auditLog", "dynamodb", "tableName"],
                message: `Audit log DynamoDB table "${data.target.auditLog.dynamodb.tableName}" must differ from the main target table.`
            });
        }
    });

export type DdbTransferInput = z.infer<typeof ddbTransferInputSchema>;
```

- [ ] **Step 2: Type-check**

```bash
yarn ts-check
```
Expected: 0 errors (the inferred `DdbMigrationConfiguration` type in `validation.ts` picks up `target.auditLog` automatically).

- [ ] **Step 3: Run tests**

```bash
yarn test
```
Expected: all green (no existing tests reference `target.auditLog`).

- [ ] **Step 4: Commit**

```bash
git add src/features/MigrationConfig/schemas/ddb.schema.ts
git commit -m "feat(config): split ddb source/target schemas; add auditLog target field"
```

---

## Task 2: Filter — `isAuditLogEntry`

**Files:**
- Modify: `src/domain/transform/filters.ts`
- Modify: `__tests__/domain/transform/filters.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `__tests__/domain/transform/filters.test.ts`:

```typescript
import {
    // existing imports ...
    isAuditLogEntry
} from "../../../src/domain/transform/filters.ts";

describe("isAuditLogEntry", () => {
    it("matches audit log records with SK === 'L'", () => {
        expect(
            isAuditLogEntry(
                makeRecord({
                    SK: "L",
                    modelId: "acoSearchRecord-auditlogs"
                })
            )
        ).toBe(true);
    });

    it("rejects when SK is not L", () => {
        expect(
            isAuditLogEntry(
                makeRecord({
                    SK: "REV#0001",
                    modelId: "acoSearchRecord-auditlogs"
                })
            )
        ).toBe(false);
    });

    it("rejects when modelId is a different acoSearchRecord variant", () => {
        expect(
            isAuditLogEntry(
                makeRecord({
                    SK: "L",
                    modelId: "acoSearchRecord-page"
                })
            )
        ).toBe(false);
    });

    it("rejects when modelId is missing", () => {
        expect(isAuditLogEntry(makeRecord({ SK: "L" }))).toBe(false);
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
yarn test __tests__/domain/transform/filters.test.ts
```
Expected: FAIL — `isAuditLogEntry` not exported.

- [ ] **Step 3: Implement**

Add to `src/domain/transform/filters.ts`:

```typescript
export const isAuditLogEntry = (record: BaseRecord): boolean => {
    return record.modelId === "acoSearchRecord-auditlogs" && record.SK === "L";
};
```

- [ ] **Step 4: Run tests**

```bash
yarn test __tests__/domain/transform/filters.test.ts
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/transform/filters.ts __tests__/domain/transform/filters.test.ts
git commit -m "feat(filters): add isAuditLogEntry predicate"
```

---

## Task 3: Command — `AuditLogPutRecord`

**Files:**
- Create: `src/domain/transform/commands/AuditLogPutRecord.ts`

- [ ] **Step 1: Create the command**

```typescript
import type { Command } from "./Command.ts";

interface CreateParams {
    table: string;
    record: Record<string, unknown>;
}

export class AuditLogPutRecord implements Command {
    public static readonly key = "AUDIT_LOG_PUT_RECORD";

    public readonly key = AuditLogPutRecord.key;
    public readonly dedupKey: undefined = undefined;

    private constructor(
        public readonly table: string,
        public readonly record: Record<string, unknown>
    ) {}

    public static create(params: CreateParams): AuditLogPutRecord {
        return new AuditLogPutRecord(params.table, params.record);
    }
}
```

- [ ] **Step 2: Type-check**

```bash
yarn ts-check
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/domain/transform/commands/AuditLogPutRecord.ts
git commit -m "feat(commands): add AuditLogPutRecord command"
```

---

## Task 4: Processor — `AuditLogProcessor`

**Files:**
- Create: `src/features/AuditLogProcessor/AuditLogProcessor.ts`
- Create: `src/features/AuditLogProcessor/feature.ts`
- Create: `src/features/AuditLogProcessor/index.ts`

- [ ] **Step 1: Create the processor**

`src/features/AuditLogProcessor/AuditLogProcessor.ts`:

```typescript
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { AuditLogPutRecord } from "~/domain/transform/commands/AuditLogPutRecord.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface AuditLogProcessorSlice {
    putAuditLog(record: Record<string, unknown>): void;
}

class AuditLogProcessorImpl
    implements Processor.Interface<BaseTransformContext.Interface<unknown>, AuditLogProcessorSlice>
{
    public constructor(
        private readonly executor: DdbExecutor.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): AuditLogProcessorSlice {
        const tableName =
            this.config.storage === "ddb"
                ? (this.config.target.auditLog?.dynamodb?.tableName ?? null)
                : null;
        return {
            putAuditLog(record: Record<string, unknown>): void {
                if (!tableName) {
                    return;
                }
                base.addCommand(AuditLogPutRecord.create({ table: tableName, record }));
            }
        };
    }

    public onEnd(ctx: BaseTransformContext.Interface<unknown> & AuditLogProcessorSlice): void {
        ctx.putAuditLog(ctx.record as Record<string, unknown>);
    }

    public async execute(commands: Commands): Promise<void> {
        const tableName =
            this.config.storage === "ddb"
                ? (this.config.target.auditLog?.dynamodb?.tableName ?? null)
                : null;
        if (!tableName) {
            return;
        }
        const auditPuts = commands.get<AuditLogPutRecord>(AuditLogPutRecord.key);
        const puts = auditPuts.map(cmd =>
            PutRecord.create({ table: cmd.table, record: cmd.record })
        );
        await this.executor.execute(puts);
    }
}

export const AuditLogProcessor = Processor.createImplementation({
    implementation: AuditLogProcessorImpl,
    dependencies: [DdbExecutor, MigrationConfig]
});
```

- [ ] **Step 2: Create the feature**

`src/features/AuditLogProcessor/feature.ts`:

```typescript
import { createFeature } from "~/base/index.ts";
import { AuditLogProcessor } from "./AuditLogProcessor.ts";

export const AuditLogProcessorFeature = createFeature({
    name: "Core/AuditLogProcessorFeature",
    register(container) {
        container.register(AuditLogProcessor).inSingletonScope();
    }
});
```

- [ ] **Step 3: Create the barrel**

`src/features/AuditLogProcessor/index.ts`:

```typescript
export { AuditLogProcessor } from "./AuditLogProcessor.ts";
export { AuditLogProcessorFeature } from "./feature.ts";
```

- [ ] **Step 4: Type-check**

```bash
yarn ts-check
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/AuditLogProcessor/
git commit -m "feat(processor): add AuditLogProcessor"
```

---

## Task 5: Transformer — `coreFieldsTransformer`

Extracts system-level fields: generates a new `id`, copies `createdBy` from `revisionCreatedBy`, sets `createdOn` from `revisionCreatedOn`, computes 60-day `expiresAt`.

**Files:**
- Create: `src/transformers/auditLogs/coreFieldsTransformer.ts`
- Create: `__tests__/transformers/auditLogs/coreFieldsTransformer.test.ts`

- [ ] **Step 1: Write the failing test**

`__tests__/transformers/auditLogs/coreFieldsTransformer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { coreFieldsTransformer } from "~/transformers/auditLogs/coreFieldsTransformer.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const FROZEN_NOW = new Date("2025-07-10T12:00:00.000Z").getTime();

const SOURCE_RECORD = {
    PK: "T#root#L#en-US#CMS#CME#wby-aco-686f7147c0aada0002aa5d0e",
    SK: "L",
    tenant: "root",
    entryId: "wby-aco-686f7147c0aada0002aa5d0e",
    modelId: "acoSearchRecord-auditlogs",
    revisionCreatedBy: {
        id: "58a2841f-9831-4b37-92e6-e04e40132db6",
        displayName: "Danny Goersdorf",
        type: "admin"
    },
    revisionCreatedOn: "2025-07-10T07:52:39.413Z"
};

describe("coreFieldsTransformer", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(FROZEN_NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("sets a fresh mdbid as id", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        coreFieldsTransformer(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(typeof record.id).toBe("string");
        expect((record.id as string).length).toBeGreaterThan(0);
        // Must differ from source id
        expect(record.id).not.toBe("wby-aco-686f7147c0aada0002aa5d0e#0001");
    });

    it("copies revisionCreatedBy to createdBy", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        coreFieldsTransformer(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.createdBy).toEqual({
            id: "58a2841f-9831-4b37-92e6-e04e40132db6",
            displayName: "Danny Goersdorf",
            type: "admin"
        });
    });

    it("copies revisionCreatedOn to createdOn", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        coreFieldsTransformer(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.createdOn).toBe("2025-07-10T07:52:39.413Z");
    });

    it("sets expiresAt to 60 days from now as ISO string", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        coreFieldsTransformer(ctx);
        const record = ctx.record as Record<string, unknown>;
        const expected = new Date(FROZEN_NOW + SIXTY_DAYS_MS).toISOString();
        expect(record.expiresAt).toBe(expected);
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
yarn test __tests__/transformers/auditLogs/coreFieldsTransformer.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/transformers/auditLogs/coreFieldsTransformer.ts`:

```typescript
import { mdbid } from "@webiny/utils/mdbid.js";
import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export const coreFieldsTransformer = createTransformer<
    BaseTransformContext.Interface<BaseRecord>
>("auditLogs/coreFields", ctx => {
    const { record } = ctx;
    record.id = mdbid();
    record.createdBy = record.revisionCreatedBy;
    record.createdOn = record.revisionCreatedOn;
    record.expiresAt = new Date(Date.now() + SIXTY_DAYS_MS).toISOString();
});
```

- [ ] **Step 4: Run tests**

```bash
yarn test __tests__/transformers/auditLogs/coreFieldsTransformer.test.ts
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/transformers/auditLogs/coreFieldsTransformer.ts __tests__/transformers/auditLogs/coreFieldsTransformer.test.ts
git commit -m "feat(transformers): add auditLogs/coreFieldsTransformer"
```

---

## Task 6: Transformer — `dataFieldsTransformer`

Extracts domain fields from the `values` object: `app`, `action`, `message`, `entity`, `entityId` (from root `entryId`), `tags`, `content` (already-compressed JSON string).

**Files:**
- Create: `src/transformers/auditLogs/dataFieldsTransformer.ts`
- Create: `__tests__/transformers/auditLogs/dataFieldsTransformer.test.ts`

- [ ] **Step 1: Write the failing test**

`__tests__/transformers/auditLogs/dataFieldsTransformer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { dataFieldsTransformer } from "~/transformers/auditLogs/dataFieldsTransformer.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

const COMPRESSED_CONTENT = '{"compression":"gzip","value":"H4sI..."}';

const SOURCE_RECORD = {
    PK: "T#root#L#en-US#CMS#CME#wby-aco-686f7147c0aada0002aa5d0e",
    SK: "L",
    tenant: "root",
    entryId: "wby-aco-686f7147c0aada0002aa5d0e",
    modelId: "acoSearchRecord-auditlogs",
    values: {
        "object@data": {
            "text@app": "SECURITY",
            "text@action": "UPDATE",
            "text@message": "User updated",
            "text@entity": "USER",
            "text@entityId": "58a2841f-9831-4b37-92e6-e04e40132db6",
            "text@data": COMPRESSED_CONTENT
        },
        "text@tags": ["tag-a", "tag-b"],
        "text@content": "User updated"
    }
};

describe("dataFieldsTransformer", () => {
    it("extracts app from values[object@data][text@app]", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).app).toBe("SECURITY");
    });

    it("extracts action", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).action).toBe("UPDATE");
    });

    it("extracts message", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).message).toBe("User updated");
    });

    it("extracts entity", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).entity).toBe("USER");
    });

    it("uses root entryId as entityId", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).entityId).toBe(
            "wby-aco-686f7147c0aada0002aa5d0e"
        );
    });

    it("extracts tags array", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).tags).toEqual(["tag-a", "tag-b"]);
    });

    it("defaults tags to empty array when missing", () => {
        const rec = {
            ...SOURCE_RECORD,
            values: { ...SOURCE_RECORD.values, "text@tags": undefined }
        };
        const ctx = makeFakeBaseContext(rec);
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).tags).toEqual([]);
    });

    it("extracts content as the already-compressed text@data string", () => {
        const ctx = makeFakeBaseContext({ ...SOURCE_RECORD });
        dataFieldsTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).content).toBe(COMPRESSED_CONTENT);
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
yarn test __tests__/transformers/auditLogs/dataFieldsTransformer.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/transformers/auditLogs/dataFieldsTransformer.ts`:

```typescript
import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

export const dataFieldsTransformer = createTransformer<
    BaseTransformContext.Interface<BaseRecord>
>("auditLogs/dataFields", ctx => {
    const { record } = ctx;
    const values = record.values as Record<string, unknown> | undefined;
    const data = values?.["object@data"] as Record<string, unknown> | undefined;

    record.app = data?.["text@app"];
    record.action = data?.["text@action"];
    record.message = data?.["text@message"];
    record.entity = data?.["text@entity"];
    record.entityId = record.entryId;
    record.tags = (values?.["text@tags"] as string[] | undefined) ?? [];
    record.content = data?.["text@data"];
});
```

- [ ] **Step 4: Run tests**

```bash
yarn test __tests__/transformers/auditLogs/dataFieldsTransformer.test.ts
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/transformers/auditLogs/dataFieldsTransformer.ts __tests__/transformers/auditLogs/dataFieldsTransformer.test.ts
git commit -m "feat(transformers): add auditLogs/dataFieldsTransformer"
```

---

## Task 7: Transformer — `storageShapeTransformer`

Reads all intermediate fields (set by previous transformers) and calls `ctx.replace()` with the complete `IStorageItem` shape: PK/SK, TYPE, GSI_TENANT, 9 GSI PK/SK pairs, `data` envelope, and Unix `expiresAt` TTL.

**Files:**
- Create: `src/transformers/auditLogs/storageShapeTransformer.ts`
- Create: `__tests__/transformers/auditLogs/storageShapeTransformer.test.ts`

- [ ] **Step 1: Write the failing test**

`__tests__/transformers/auditLogs/storageShapeTransformer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { storageShapeTransformer } from "~/transformers/auditLogs/storageShapeTransformer.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

// Record as it looks AFTER coreFieldsTransformer + dataFieldsTransformer have run
const INTERMEDIATE_RECORD = {
    PK: "T#root#L#en-US#CMS#CME#wby-aco-686f7147c0aada0002aa5d0e",
    SK: "L",
    tenant: "root",
    entryId: "wby-aco-686f7147c0aada0002aa5d0e",
    modelId: "acoSearchRecord-auditlogs",
    // set by coreFieldsTransformer
    id: "507f1f77bcf86cd799439011",
    createdBy: { id: "user-1", displayName: "Alice", type: "admin" },
    createdOn: "2025-07-10T07:52:39.413Z",
    expiresAt: "2025-09-08T07:52:39.413Z",
    // set by dataFieldsTransformer
    app: "SECURITY",
    action: "UPDATE",
    message: "User updated",
    entity: "USER",
    entityId: "wby-aco-686f7147c0aada0002aa5d0e",
    tags: [],
    content: '{"compression":"gzip","value":"H4sI..."}'
};

describe("storageShapeTransformer", () => {
    it("sets correct PK", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).PK).toBe("T#root#AUDIT_LOG");
    });

    it("sets SK to the mdbid", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).SK).toBe("507f1f77bcf86cd799439011");
    });

    it("sets TYPE to auditLog.log", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).TYPE).toBe("auditLog.log");
    });

    it("sets GSI_TENANT", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI_TENANT).toBe("root");
    });

    it("sets GSI1 (app)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect(r.GSI1_PK).toBe("T#root#AUDIT_LOG#APP#SECURITY");
        expect(r.GSI1_SK).toBe(new Date("2025-07-10T07:52:39.413Z").getTime());
    });

    it("sets GSI2 (app + createdBy)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect(r.GSI2_PK).toBe("T#root#AUDIT_LOG#APP#SECURITY#CREATEDBY#user-1");
    });

    it("sets GSI3 (app + entity)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI3_PK).toBe(
            "T#root#AUDIT_LOG#APP#SECURITY#ENTITY#USER"
        );
    });

    it("sets GSI4 (entityId)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI4_PK).toBe(
            "T#root#AUDIT_LOG#ENTITY_ID#wby-aco-686f7147c0aada0002aa5d0e"
        );
    });

    it("sets GSI5 (app + entity + action + createdBy)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI5_PK).toBe(
            "T#root#AUDIT_LOG#APP#SECURITY#ENTITY#USER#ACTION#UPDATE#CREATEDBY#user-1"
        );
    });

    it("sets GSI6 (app + entity + action)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI6_PK).toBe(
            "T#root#AUDIT_LOG#APP#SECURITY#ENTITY#USER#ACTION#UPDATE"
        );
    });

    it("sets GSI7 (app + entity + createdBy)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI7_PK).toBe(
            "T#root#AUDIT_LOG#APP#SECURITY#ENTITY#USER#CREATEDBY#user-1"
        );
    });

    it("sets GSI8 (createdBy)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        expect((ctx.record as Record<string, unknown>).GSI8_PK).toBe(
            "T#root#AUDIT_LOG#CREATEDBY#user-1"
        );
    });

    it("sets GSI9 (createdOn)", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect(r.GSI9_PK).toBe("T#root#AUDIT_LOG#CREATED_ON");
        expect(r.GSI9_SK).toBe(new Date("2025-07-10T07:52:39.413Z").getTime());
    });

    it("sets data envelope with all domain fields", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect(r.data).toEqual({
            id: "507f1f77bcf86cd799439011",
            tenant: "root",
            createdBy: { id: "user-1", displayName: "Alice", type: "admin" },
            createdOn: "2025-07-10T07:52:39.413Z",
            app: "SECURITY",
            action: "UPDATE",
            message: "User updated",
            entity: "USER",
            entityId: "wby-aco-686f7147c0aada0002aa5d0e",
            tags: [],
            expiresAt: "2025-09-08T07:52:39.413Z",
            content: '{"compression":"gzip","value":"H4sI..."}'
        });
    });

    it("sets top-level expiresAt as Unix seconds TTL", () => {
        const ctx = makeFakeBaseContext({ ...INTERMEDIATE_RECORD });
        storageShapeTransformer(ctx);
        const r = ctx.record as Record<string, unknown>;
        expect(r.expiresAt).toBe(
            Math.floor(new Date("2025-09-08T07:52:39.413Z").getTime() / 1000)
        );
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
yarn test __tests__/transformers/auditLogs/storageShapeTransformer.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/transformers/auditLogs/storageShapeTransformer.ts`:

```typescript
import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

interface CreatedBy {
    id: string;
    displayName: string;
    type: string;
}

export const storageShapeTransformer = createTransformer<
    BaseTransformContext.Interface<BaseRecord>
>("auditLogs/storageShape", ctx => {
    const { record } = ctx;

    const tenant = record.tenant as string;
    const id = record.id as string;
    const createdBy = record.createdBy as CreatedBy;
    const createdOnISO = record.createdOn as string;
    const createdOnMs = new Date(createdOnISO).getTime();
    const expiresAtISO = record.expiresAt as string;
    const expiresAtTTL = Math.floor(new Date(expiresAtISO).getTime() / 1000);
    const app = record.app as string;
    const action = record.action as string;
    const message = record.message as string;
    const entity = record.entity as string;
    const entityId = record.entityId as string;
    const tags = record.tags as string[];
    const content = record.content as string;

    ctx.replace({
        PK: `T#${tenant}#AUDIT_LOG`,
        SK: id,
        TYPE: "auditLog.log",
        GSI_TENANT: tenant,
        GSI1_PK: `T#${tenant}#AUDIT_LOG#APP#${app}`,
        GSI1_SK: createdOnMs,
        GSI2_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#CREATEDBY#${createdBy.id}`,
        GSI2_SK: createdOnMs,
        GSI3_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#ENTITY#${entity}`,
        GSI3_SK: createdOnMs,
        GSI4_PK: `T#${tenant}#AUDIT_LOG#ENTITY_ID#${entityId}`,
        GSI4_SK: createdOnMs,
        GSI5_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#ENTITY#${entity}#ACTION#${action}#CREATEDBY#${createdBy.id}`,
        GSI5_SK: createdOnMs,
        GSI6_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#ENTITY#${entity}#ACTION#${action}`,
        GSI6_SK: createdOnMs,
        GSI7_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#ENTITY#${entity}#CREATEDBY#${createdBy.id}`,
        GSI7_SK: createdOnMs,
        GSI8_PK: `T#${tenant}#AUDIT_LOG#CREATEDBY#${createdBy.id}`,
        GSI8_SK: createdOnMs,
        GSI9_PK: `T#${tenant}#AUDIT_LOG#CREATED_ON`,
        GSI9_SK: createdOnMs,
        data: {
            id,
            tenant,
            createdBy,
            createdOn: createdOnISO,
            app,
            action,
            message,
            entity,
            entityId,
            tags,
            expiresAt: expiresAtISO,
            content
        },
        expiresAt: expiresAtTTL
    } as unknown as BaseRecord);
});
```

- [ ] **Step 4: Run tests**

```bash
yarn test __tests__/transformers/auditLogs/storageShapeTransformer.test.ts
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/transformers/auditLogs/storageShapeTransformer.ts __tests__/transformers/auditLogs/storageShapeTransformer.test.ts
git commit -m "feat(transformers): add auditLogs/storageShapeTransformer"
```

---

## Task 8: Transformer barrel + main index export

**Files:**
- Create: `src/transformers/auditLogs/index.ts`
- Modify: `src/transformers/index.ts`

- [ ] **Step 1: Create the barrel**

`src/transformers/auditLogs/index.ts`:

```typescript
import { coreFieldsTransformer } from "./coreFieldsTransformer.ts";
import { dataFieldsTransformer } from "./dataFieldsTransformer.ts";
import { storageShapeTransformer } from "./storageShapeTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";

export const auditLogTransformers: Transformer.Interface<
    BaseTransformContext.Interface<BaseRecord>
>[] = [coreFieldsTransformer, dataFieldsTransformer, storageShapeTransformer];
```

- [ ] **Step 2: Add to main transformer barrel**

In `src/transformers/index.ts`, add at the end:

```typescript
export * from "./auditLogs/index.ts";
```

- [ ] **Step 3: Type-check + test**

```bash
yarn ts-check && yarn test
```
Expected: 0 errors, all green.

- [ ] **Step 4: Commit**

```bash
git add src/transformers/auditLogs/index.ts src/transformers/index.ts
git commit -m "feat(transformers): export auditLogTransformers stack"
```

---

## Task 9: Bootstrap — register `AuditLogProcessorFeature`

**Files:**
- Modify: `src/bootstrap.ts`

- [ ] **Step 1: Add import and registration**

In `src/bootstrap.ts`, add the import alongside the other processor imports:

```typescript
import { AuditLogProcessorFeature } from "~/features/AuditLogProcessor/index.ts";
```

In the `if (config.storage === "ddb")` block, register it alongside the other DDB processors:

```typescript
if (config.storage === "ddb") {
    DdbExecutorFeature.register(container);
    S3ProcessorFeature.register(container);
    DdbScannerFeature.register(container);
    DdbProcessorFeature.register(container);
    AuditLogProcessorFeature.register(container);  // add this line
}
```

- [ ] **Step 2: Type-check + test**

```bash
yarn ts-check && yarn test
```
Expected: 0 errors, all green.

- [ ] **Step 3: Commit**

```bash
git add src/bootstrap.ts
git commit -m "feat(bootstrap): register AuditLogProcessorFeature in DDB branch"
```

---

## Task 10: Preset — add audit log pipeline

**Files:**
- Modify: `src/presets/v5-to-v6-ddb.ts`

- [ ] **Step 1: Add imports**

In `src/presets/v5-to-v6-ddb.ts`, add to existing imports:

```typescript
import { AuditLogProcessor } from "~/features/AuditLogProcessor/index.ts";
import { isAuditLogEntry } from "~/domain/transform/filters.ts";
import { auditLogTransformers } from "~/transformers/index.ts";
```

- [ ] **Step 2: Register pipeline**

Inside `configure({ runner, pipelineBuilderFactory: factory, container })`, add the audit log pipeline **before** `acoSearchRecordsPage` (which must remain before CMS pipelines):

```typescript
// ========================================================================
// Audit Logs
// IMPORTANT: Must be registered before AcoSearchRecordsPage and CmsEntries
// because audit log records share the acoSearchRecord modelId prefix.
// When auditLog.dynamodb.tableName is null the pipeline is blackholed —
// records are consumed but not written.
// ========================================================================
const config = container.resolve(MigrationConfig);
const auditLogBuilder = factory
    .create({
        name: "AuditLogs",
        scanner: DdbScanner,
        processors: [AuditLogProcessor]
    })
    .filter(createFilter(isAuditLogEntry))
    .use(auditLogTransformers);

if (!("auditLog" in config.target) || !config.target.auditLog?.dynamodb?.tableName) {
    auditLogBuilder.blackhole();
}

const auditLogs = auditLogBuilder.build();
```

You will also need to import `MigrationConfig`:
```typescript
import { MigrationConfig } from "~/features/MigrationConfig/index.ts";
```

Update `runner.register(...)` to include `auditLogs` first:

```typescript
runner
    .register(auditLogs)        // before acoSearchRecordsPage
    .register(acoSearchRecordsPage)
    .register(contentModelGroups)
    // ... rest unchanged
```

- [ ] **Step 3: Type-check + test**

```bash
yarn ts-check && yarn test
```
Expected: 0 errors, all green.

- [ ] **Step 4: Commit**

```bash
git add src/presets/v5-to-v6-ddb.ts
git commit -m "feat(preset): add AuditLogs pipeline to v5-to-v6-ddb (blackholed when no table)"
```

---

## Task 11: Public API export

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add export**

In `src/index.ts`, add alongside the other processor exports:

```typescript
export { AuditLogProcessor } from "./features/AuditLogProcessor/index.ts";
```

- [ ] **Step 2: Format, type-check, full test run**

```bash
yarn format:fix && yarn ts-check && yarn test
```
Expected: 0 errors, all green.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(api): export AuditLogProcessor"
```

---

## Self-Review

**Spec coverage:**
- ✅ Config schema: `auditLog.dynamodb.tableName` nullable on target, required field, collision check
- ✅ Filter: `isAuditLogEntry` (modelId + SK === "L"), registered before CMS
- ✅ Command: `AuditLogPutRecord` with distinct key `"AUDIT_LOG_PUT_RECORD"`
- ✅ Processor: `AuditLogProcessor`, slice `putAuditLog`, `onEnd` auto-puts, `execute` guards on null table
- ✅ Transformer 1: core fields (mdbid id, createdBy, createdOn, 60-day expiresAt)
- ✅ Transformer 2: data fields from `values["object@data"]` and root `entryId`
- ✅ Transformer 3: full `IStorageItem` replace with PK/SK + 9 GSIs + data + TTL
- ✅ Bootstrap: `AuditLogProcessorFeature` in DDB branch
- ✅ Preset: blackhole when tableName null, registered first
- ✅ Public API: `AuditLogProcessor` exported

**Type consistency:**
- `AuditLogPutRecord.key = "AUDIT_LOG_PUT_RECORD"` used in both processor emit and drain
- `PutRecord.create({ table, record })` used in processor execute to bridge to DdbExecutor
- `auditLogTransformers` spread via `.use(...auditLogTransformers)` in preset

**`.use(array)` confirmed:** `PipelineBuilder.use()` accepts both a single transformer and a `readonly` array — `.use(auditLogTransformers)` works as written.
