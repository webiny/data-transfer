# Fix Live Field Reconciler Implementation Plan (Steps 1–6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the root-cause fix in `addLiveField` for the OS lane, and build the `fix-live` reconciler core — `LiveFieldReconciler` (pure decision logic), `DdbLiveFieldRunner` / `OsLiveFieldRunner` (scan → group → decide → conditional `UpdateItem`), `ChangeReport` (JSONL audit trail), and `FixLiveState` (dry-run gate) — plus the `IDynamoDbClient` / `FileTool` primitives they need. This covers **Implementation order steps 1–6** of `docs/superpowers/specs/2026-09-04-fix-live-field-and-command-menu-design.md`. The CLI menu, `Prompts`/`UI`, `FixLiveCommand`, the v6 guard step, and guide updates are a sibling plan; everything here is consumable by that command through the abstractions defined in Task 4.

**Architecture:** New feature directory `src/features/FixLive/` following the standard feature layout (`abstractions/` with one file per token + an `index.ts` of const tokens only, impl classes, `feature.ts`, `index.ts`). Runners share one `ILiveFieldRunner` interface exposed through **two tokens** — `DdbLiveFieldRunner` and `OsLiveFieldRunner` — mirroring how `SourceDynamoDbClient` / `TargetDynamoDbClient` share `IDynamoDbClient`, so a command can resolve each explicitly. The system-specific client and table name are passed at call time via `LiveFieldRunner.Options.target` (the runner is stateless; bootstrap binds Source/Target clients, the command picks one). Both runners extend an abstract `BaseLiveFieldRunner` that owns the scan/query/decide/write loop; subclasses supply `acceptsRow`, `prepareGroup` (OS: decompress) and `buildWrite` (DDB: `["data","live"]`; OS: recompressed `["data"]`). `ChangeReport` writes under `.transfer/<runId>/fix-live-report.jsonl` via `TransferContext.runId` exactly like `DroppedRecordLog`. `FixLiveState` writes `.transfer/state/fix-live/<project>__<system>.json`. The transformer fix takes the spec's **preferred form**: `OsProcessor.querySourceRecord` / `queryTargetRecord` return the row with `data` decompressed (same shape `OsScanner` yields), using the already-registered `OsRecordDecompressor`; `addLiveField` reads `version` from the root, then `data`, and accepts only a positive integer. The fallback (decompress inside `addLiveField` via `ctx.compressionHandler`) is noted in Task 1 but not taken — the only OS-lane caller of `querySourceRecord` is `addLiveField`, so the processor contract change has minimal blast radius.

**Tech Stack:** TypeScript (ESM, `~/` alias), `@webiny/di`, `@webiny/aws-sdk/client-dynamodb` (`UpdateCommand`, `ScanCommand` re-exported from `@aws-sdk/lib-dynamodb`), `@webiny/utils` `CompressionHandler`, vitest, dynalite, oxfmt, oxlint.

## Global Constraints

Derived from `docs/architecture.md`, `docs/testing.md`, and the observed code style:

- DI via `createAbstraction<T>(name)` + `Abstraction.createImplementation({ implementation, dependencies })`; features register via `createFeature({ name, register(container) })` and `container.register(Impl).inSingletonScope()`.
- Feature layout: `abstractions/<Name>.ts` (interface + token + namespace), `abstractions/index.ts` (**const tokens only**, no type exports), `<Name>.ts` (Impl class + `createImplementation`), `feature.ts`, `index.ts`.
- Types are consumed through namespaces (`LiveFieldReconciler.Interface`, `LiveFieldRunner.Options`), never by importing interfaces directly from abstractions. Every structural shape gets a named `interface`/`type` — no inline `{ ... }` in generic or parameter positions.
- `public`/`private`/`protected` on every class member. Braces always (`curly: error`). No `reflect-metadata` import.
- Imports: cross-module via `~/path/file.js`; intra-feature relative via `./file.ts`. Tests import `src` via `~/…js` and test-only infra via relative `../x.ts`.
- File names: PascalCase for class/abstraction modules, camelCase for function modules (`createEmptyStats.ts`, `runConcurrently.ts`).
- AWS imports through `@webiny/aws-sdk/client-dynamodb/index.js` (exception already documented: `QueryCommand` from `@aws-sdk/lib-dynamodb`). All DDB calls go through `executeWithRetry`; `ConditionalCheckFailedException` is not in `isRetryableAwsError`'s retryable set, so it is never retried — map it to a result, do not swallow anything else.
- Only `data.live` is ever written, via `UpdateItem` path expressions. Never `PutItem` a whole record (the document client has `convertEmptyValues: true`).
- Logging via `Logger.Interface` (`ctx.logger` / injected `Logger`), never `console.*`.
- Files under `.transfer/` are resolved as `join(process.cwd(), ".transfer", runId, …)` (DroppedRecordLog pattern).
- Tests live in `__tests__/` mirroring `src/`. Unit tests use `MockDynamoDbClient` and `NoopLogger` (`__tests__/helpers/NoopLogger.ts`); real-SDK tests use `startDynalite()` + `waitForTableActive()` from `__tests__/integration/dynalite.ts`. Coverage thresholds (lines 79 / functions 84 / branches 71 / statements 79) are enforced — new code ships with tests.
- Public API (`src/index.ts`) does not change.
- Formatting: oxfmt (`printWidth` 100, 4 spaces in `src/` and `__tests__/`, double quotes, no trailing commas, `arrowParens: avoid`). `yarn`, never `npm`.
- Unused parameters are prefixed with `_` (oxlint `no-unused-vars` is a warning and `--deny-warnings` is on).
- Verification before commit: `yarn npm audit && yarn format:fix && yarn ts-check && yarn test:coverage && yarn lint && yarn check:imports`.

---

### Task 1: Transformer fix — decompressed OS lookups, integer guard, cache check

**Files:**
- Modify: `src/features/OsProcessor/OsProcessor.ts`
- Modify: `src/transformers/cms/addLiveField.ts`
- Modify: `docs/hard-won-decisions.md` (cache-sentinel entry)
- Create: `.changeset/fix-live-field-os-lane.md`
- Test: `__tests__/transformers/cms/addLiveField.test.ts` (extend), `__tests__/features/OsProcessor/OsProcessor.test.ts` (extend), `__tests__/features/OsProcessor/OsProcessor.liveField.test.ts` (create)

**Interfaces:**
- Consumes: `OsRecordDecompressor.Interface` (`~/features/OsRecordDecompressor/abstractions/OsRecordDecompressor.js`), `CompressionHandler`, `MockDynamoDbClient.batchPut` for seeding.
- Produces: `OsProcessor` slice `querySourceRecord`/`queryTargetRecord` return `{ ...row, data: <decompressed> }`; `addLiveField` never emits `{ version: undefined }`.

- [ ] **Step 1: Add failing `addLiveField` tests**

Append to `__tests__/transformers/cms/addLiveField.test.ts` (add `import { NoopLogger } from "../../helpers/NoopLogger.ts";` at the top):

```typescript
    it("reads version from data when P comes back in the decompressed OS row shape", async () => {
        const ctx = makeFakeDdbCoreContext({
            ...BASE,
            data: { ...BASE.data, version: 3, status: "draft" }
        });
        ctx.querySourceRecord = vi.fn().mockResolvedValue({
            PK: BASE.PK,
            SK: "P",
            index: "root-headless-cms-en-us-blogpost",
            data: { modelId: "blogPost", version: 2, status: "published" },
            _ct: "2024-01-01T00:00:00.000Z",
            _et: "CmsEntriesElasticsearch",
            _md: "2024-01-01T00:00:00.000Z"
        });

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toEqual({ version: 2 });
    });

    it("never emits { version: undefined } — a raw compressed P row yields live: null and warns", async () => {
        const logger = new NoopLogger();
        const ctx = makeFakeDdbCoreContext(BASE, { logger });
        ctx.querySourceRecord = vi.fn().mockResolvedValue({
            PK: BASE.PK,
            SK: "P",
            index: "root-headless-cms-en-us-blogpost",
            data: { compression: "gzip", value: "H4sIAAAAAAAAA6tWKkpNLKlUslIqLcpRqgUAn7mB6RAAAAA=" }
        });

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toBeNull();
        expect(logger.entries.some(e => e.level === "warn" && e.message.includes(BASE.PK))).toBe(true);
    });

    it("treats a non-integer P version as no published revision", async () => {
        const ctx = makeFakeDdbCoreContext(BASE);
        ctx.querySourceRecord = vi.fn().mockResolvedValue({ version: "2" });

        await addLiveField(ctx);

        expect((ctx.record.data as Record<string, unknown>).live).toBeNull();
    });

    it("queries P for an unpublished L record and sets live: null when none exists", async () => {
        const ctx = makeFakeDdbCoreContext({
            ...BASE,
            data: { ...BASE.data, version: 4, status: "unpublished" }
        });
        ctx.querySourceRecord = vi.fn().mockResolvedValue(null);

        await addLiveField(ctx);

        expect(ctx.querySourceRecord).toHaveBeenCalledWith(BASE.PK, "P");
        expect((ctx.record.data as Record<string, unknown>).live).toBeNull();
    });

    it("live.version is a number whenever live is non-null", async () => {
        const shapes: Array<Record<string, unknown> | null> = [
            { version: 2 },
            { data: { version: 5 } },
            { version: 0 },
            { version: 1.5 },
            { data: {} },
            null
        ];
        for (const shape of shapes) {
            const ctx = makeFakeDdbCoreContext(BASE);
            ctx.querySourceRecord = vi.fn().mockResolvedValue(shape);
            await addLiveField(ctx);
            const live = (ctx.record.data as Record<string, unknown>).live as { version: unknown } | null;
            if (live !== null) {
                expect(typeof live.version).toBe("number");
            }
        }
    });
```

- [ ] **Step 2: Add failing `OsProcessor.querySourceRecord` test**

Append a new `describe` inside `__tests__/features/OsProcessor/OsProcessor.test.ts` (add `import { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";` and `import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";`):

```typescript
    describe("querySourceRecord", () => {
        it("returns the OS row with data decompressed", async () => {
            const container = createOsContainer();
            const compression = container.resolve(CompressionHandler);
            const sourceDb = container.resolve(SourceDynamoDbClient) as MockDynamoDbClient;
            const compressed = await compression.compress({ modelId: "blogPost", version: 2, status: "published" });
            await sourceDb.batchPut("source-os", [
                {
                    PK: "T#root#CMS#CME#q",
                    SK: "P",
                    index: "root-headless-cms-en-us-blogpost",
                    data: compressed,
                    _ct: "2024-01-01T00:00:00.000Z",
                    _et: "CmsEntriesElasticsearch",
                    _md: "2024-01-01T00:00:00.000Z"
                }
            ]);
            const processor = container.resolve(Processor) as OsProcessorInstance & {
                extendContext(base: BaseTransformContext.Interface<unknown>): {
                    querySourceRecord(pk: string, sk?: string): Promise<Record<string, unknown> | null>;
                };
            };
            const { base } = makeBase(makeOsRecord("q", "root-headless-cms-en-us-blogpost"));

            const found = await processor.extendContext(base).querySourceRecord("T#root#CMS#CME#q", "P");

            expect(found).not.toBeNull();
            expect((found!.data as Record<string, unknown>).version).toBe(2);
            expect(found!._md).toBe("2024-01-01T00:00:00.000Z");
        });
    });
```

- [ ] **Step 3: Add failing OS-lane pipeline test (stands in for the OS golden)**

There is no OS-preset golden harness; this mock-container end-to-end test over `OsScanner + OsProcessor + addLiveField` with real gzip is the regression guard. Create `__tests__/features/OsProcessor/OsProcessor.liveField.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { createOsContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.js";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.js";
import { createFilter } from "~/domain/pipeline/index.js";
import { isCmsEntry } from "~/domain/transform/filters.js";
import { OsScanner } from "~/features/OsScanner/index.js";
import { OsProcessor } from "~/features/OsProcessor/index.js";
import { addLiveField } from "~/transformers/cms/addLiveField.js";
import {
    SourceDynamoDbClient,
    TargetDynamoDbClient
} from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";

const PK = "T#root#L#en-US#CMS#CME#draft-over-published";
const INDEX = "root-headless-cms-en-us-blogpost";

describe("v5-to-v6-os lane — addLiveField on a draft-over-published entry", () => {
    it("writes live: { version: 2 } on both L and P documents", async () => {
        const container = createOsContainer();
        const compression = container.resolve(CompressionHandler);
        const sourceDb = container.resolve(SourceDynamoDbClient) as MockDynamoDbClient;
        const now = "2024-01-01T00:00:00.000Z";
        await sourceDb.batchPut("source-os", [
            {
                PK,
                SK: "L",
                index: INDEX,
                data: await compression.compress({ modelId: "blogPost", entryId: "x", version: 3, status: "draft" }),
                _ct: now,
                _et: "CmsEntriesElasticsearch",
                _md: now
            },
            {
                PK,
                SK: "P",
                index: INDEX,
                data: await compression.compress({ modelId: "blogPost", entryId: "x", version: 2, status: "published" }),
                _ct: now,
                _et: "CmsEntriesElasticsearch",
                _md: now
            }
        ]);

        const runner = container.resolve(PipelineRunner);
        const builder = container.resolve(PipelineBuilderFactory).create({
            name: "CmsEntries",
            scanner: OsScanner,
            processors: [OsProcessor]
        });
        builder.filter(createFilter(isCmsEntry)).use(addLiveField);
        runner.register(await builder.build());
        await runner.run();

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        const written = targetDb.batchPutRecords;
        expect(written).toHaveLength(2);
        const bySk = new Map(written.map(r => [r.SK, r]));
        const latest = await compression.decompress<Record<string, unknown>>(bySk.get("L")!.data);
        const published = await compression.decompress<Record<string, unknown>>(bySk.get("P")!.data);
        expect(latest.live).toEqual({ version: 2 });
        expect(published.live).toEqual({ version: 2 });
    });
});
```

Run: `yarn vitest run __tests__/transformers/cms/addLiveField.test.ts __tests__/features/OsProcessor` — expect the new tests to fail.

- [ ] **Step 4: Make `OsProcessor` return decompressed rows**

In `src/features/OsProcessor/OsProcessor.ts`:

Add the import:

```typescript
import { OsRecordDecompressor } from "~/features/OsRecordDecompressor/abstractions/OsRecordDecompressor.js";
```

Append a constructor parameter after `indexConfigurationResolver`:

```typescript
        private readonly indexConfigurationResolver: IndexConfigurationResolver.Interface,
        private readonly decompressor: OsRecordDecompressor.Interface
```

Replace the two query helpers inside `extendContext` (keep `putRecord` as is):

```typescript
        const decompressRow = (row: OsRecordDecompressor.Compressed): Promise<Record<string, unknown>> =>
            this.decompressRow(row);
        return {
            putRecord(record: Record<string, unknown>) {
                base.addCommand(PutRecord.create({ table: targetTable, record }));
            },
            async querySourceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
                pk: string,
                sk?: string
            ): Promise<T | null> {
                const results = await sourceDb.query<OsRecordDecompressor.Compressed>(sourceTable, pk, sk);
                const first = results[0];
                if (!first) {
                    return null;
                }
                return (await decompressRow(first)) as unknown as T;
            },
            async queryTargetRecord<T extends Record<string, unknown> = Record<string, unknown>>(
                pk: string,
                sk?: string
            ): Promise<T | null> {
                const results = await targetDb.query<OsRecordDecompressor.Compressed>(targetTable, pk, sk);
                const first = results[0];
                if (!first) {
                    return null;
                }
                return (await decompressRow(first)) as unknown as T;
            }
        };
```

Add a private method (next to `buildGzippedPuts`):

```typescript
    /**
     * OS companion rows carry `data: { compression, value }`. OsScanner hands
     * transformers the row with `data` decompressed; the query helpers return
     * the same shape so a P lookup reads like a scanned row. Rows the
     * decompressor cannot handle (no `index`, no `compression`, corrupt blob)
     * are returned unchanged — callers guard what they read.
     */
    private async decompressRow(
        row: OsRecordDecompressor.Compressed
    ): Promise<Record<string, unknown>> {
        const decompressed = await this.decompressor.decompress(row);
        if (decompressed === null) {
            return { ...row };
        }
        return { ...row, data: decompressed };
    }
```

Append `OsRecordDecompressor` to the `dependencies` array of `OsProcessor` (after `IndexConfigurationResolver`).

- [ ] **Step 5: Rewrite `addLiveField`**

Replace `src/transformers/cms/addLiveField.ts` with:

```typescript
import { createTransformer } from "~/transformers/createTransformer.js";
import type { DdbCoreTransformContext } from "~/features/TransformContext/abstractions/contextAliases.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";

// Cache sentinel: "queried, no published revision". Versions start at 1, so -1
// can never collide with a real version. The cache check is `!== undefined`,
// so the sentinel does not need to be truthy — only distinct from every version.
const NO_PUBLISHED_REVISION = -1;

const INTERNAL_MODELS = new Set(["fmfile", "wbyfmfile"]);

export const addLiveField = createTransformer<DdbCoreTransformContext.Interface<BaseRecord>>(
    "addLiveField",
    async ctx => {
        const data = ctx.record.data as Record<string, unknown> | undefined;
        if (!data) {
            return;
        }

        const modelId = data.modelId as string | undefined;
        if (!modelId || INTERNAL_MODELS.has(modelId.toLowerCase())) {
            return;
        }

        const publishedVersion = await resolvePublishedVersion(ctx);
        data.live = publishedVersion === null ? null : { version: publishedVersion };
    }
);

/**
 * Reads `version` from either lane shape:
 * - DDB lane (v5 main table): `version` at the record root.
 * - OS lane: `OsProcessor.querySourceRecord` returns the row with `data`
 *   decompressed, so `version` lives under `data`.
 * Anything that is not a positive integer counts as "no version".
 */
function readPositiveIntegerVersion(record: Record<string, unknown>): number | null {
    const nested = record.data as Record<string, unknown> | undefined;
    const raw = record.version !== undefined ? record.version : nested?.version;
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return null;
}

async function resolvePublishedVersion(
    ctx: DdbCoreTransformContext.Interface<BaseRecord>
): Promise<number | null> {
    const cacheKey = `live:${ctx.original.PK}`;

    const cached = ctx.cache.get<number>(cacheKey);
    if (cached !== undefined) {
        return cached === NO_PUBLISHED_REVISION ? null : cached;
    }

    // This record IS the published revision — no query needed.
    // P record: always the published revision by definition.
    // L record with status "published": L and P point to the same revision.
    const data = ctx.record.data as Record<string, unknown>;
    const originalSK = ctx.original.SK;
    const isPublishedRevision =
        originalSK === "P" || (originalSK === "L" && data.status === "published");

    if (isPublishedRevision) {
        const version = readPositiveIntegerVersion(data);
        if (version === null) {
            ctx.logger.warn(
                `addLiveField: ${ctx.original.PK} ${originalSK} is the published revision but has no positive integer version — writing live: null`
            );
            ctx.cache.set(cacheKey, NO_PUBLISHED_REVISION);
            return null;
        }
        ctx.cache.set(cacheKey, version);
        return version;
    }

    ctx.logger.debug(`Querying for published revision of ${ctx.original.PK}...`);
    const published = await ctx.querySourceRecord(ctx.original.PK, "P");
    if (!published) {
        ctx.cache.set(cacheKey, NO_PUBLISHED_REVISION);
        return null;
    }

    const version = readPositiveIntegerVersion(published);
    if (version === null) {
        ctx.logger.warn(
            `addLiveField: P record for ${ctx.original.PK} has no positive integer version — writing live: null`
        );
        ctx.cache.set(cacheKey, NO_PUBLISHED_REVISION);
        return null;
    }

    ctx.cache.set(cacheKey, version);
    return version;
}
```

Fallback (not taken): if the processor contract change is judged too invasive, detect `published.data?.compression` inside `addLiveField` and call `ctx.compressionHandler.decompress(published.data)` before `readPositiveIntegerVersion`. `published.data?.version` alone is **not** a fallback — `data` is `{ compression, value }` on the raw row.

- [ ] **Step 6: Amend the hard-won decision**

In `docs/hard-won-decisions.md`, replace the `addLiveField` cache+sentinel bullet with:

```markdown
- **`addLiveField` cache+sentinel pattern** — the transformer uses `ctx.cache` keyed by `ctx.original.PK`. Sentinel value `-1` means "queried, no published revision found" — avoids re-querying. P records skip the query entirely (they ARE the published revision) and populate the cache for siblings. The cache check is `cached !== undefined` (`Cache.get` returns `T | undefined`), so the sentinel only needs to be distinct from every valid version (versions start at 1) — it no longer needs to be truthy. Never store `undefined` as a cache value; that is indistinguishable from a miss. `version` is read from the record root, then `data` (the OS lane returns decompressed rows from `OsProcessor.querySourceRecord`), and only a positive integer is accepted — the transformer never emits `{ version: undefined }` (2026-09-04).
```

- [ ] **Step 7: Changeset (patch)**

Create `.changeset/fix-live-field-os-lane.md` (equivalent to `yarn changeset` → patch):

```markdown
---
"@webiny/data-transfer": patch
---

Fix `addLiveField` in the OS lane: `OsProcessor.querySourceRecord` / `queryTargetRecord` now return the companion-table row with `data` decompressed, so the published revision's `version` is readable and `live: { version }` is written correctly for draft-over-published entries. `live` is only ever `{ version: <positive integer> }` or `null`; the cache check no longer relies on truthiness.
```

- [ ] **Step 8: Verify**

```bash
yarn vitest run __tests__/transformers/cms/addLiveField.test.ts __tests__/features/OsProcessor __tests__/integration/pipeline.preset.test.ts
```

All green; the DDB golden must be unchanged (no `UPDATE_EXPECTED`).

---

### Task 2: `IDynamoDbClient.updateAttribute` + `ScanOptions.limit` / `sortKeyEquals` + mock support

**Files:**
- Modify: `src/services/DynamoDbClient/abstractions/DynamoDbClient.ts`
- Modify: `src/services/DynamoDbClient/DynamoDbClient.ts`
- Modify: `__tests__/services/DynamoDbClient/MockDynamoDbClient.ts`
- Test: `__tests__/services/DynamoDbClient/scanOptions.test.ts`, `__tests__/services/DynamoDbClient/updateAttribute.test.ts`, `__tests__/services/DynamoDbClient/MockDynamoDbClient.test.ts`

**Interfaces:**
- Consumes: `UpdateCommand`, `ScanCommand` from `@webiny/aws-sdk/client-dynamodb/index.js`; `executeWithRetry`.
- Produces: `SourceDynamoDbClient.UpdateRequest`, `SourceDynamoDbClient.UpdateResult`, extended `ScanOptions`.

- [ ] **Step 1: Failing tests for the real client (spy on `client.send`)**

`__tests__/services/DynamoDbClient/scanOptions.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { DynamoDbClientImpl } from "../../../src/services/DynamoDbClient/DynamoDbClient.ts";
import { NoopLogger } from "../../helpers/NoopLogger.ts";

interface SendInput {
    input: Record<string, unknown>;
}

function makeClient(): { client: DynamoDbClientImpl; send: ReturnType<typeof vi.fn> } {
    const client = new DynamoDbClientImpl({ region: "us-east-1" }, new NoopLogger(), {
        maxRetries: 0,
        initialBackoffMs: 1
    });
    const send = vi.fn();
    vi.spyOn((client as unknown as { client: { send: () => unknown } }).client, "send").mockImplementation(send);
    return { client, send };
}

describe("DynamoDbClientImpl.scan options", () => {
    it("adds FilterExpression SK = :sk when sortKeyEquals is set", async () => {
        const { client, send } = makeClient();
        send.mockResolvedValue({ Items: [{ PK: "a", SK: "L" }] });

        const rows = [];
        for await (const row of client.scan("t", { sortKeyEquals: "L" })) {
            rows.push(row);
        }

        const input = (send.mock.calls[0]![0] as SendInput).input;
        expect(input.FilterExpression).toBe("SK = :sk");
        expect(input.ExpressionAttributeValues).toEqual({ ":sk": "L" });
        expect(rows).toHaveLength(1);
    });

    it("stops after `limit` yielded items even when more pages exist", async () => {
        const { client, send } = makeClient();
        send.mockResolvedValue({
            Items: [
                { PK: "a", SK: "L" },
                { PK: "b", SK: "L" },
                { PK: "c", SK: "L" }
            ],
            LastEvaluatedKey: { PK: "c", SK: "L" }
        });

        const rows = [];
        for await (const row of client.scan("t", { limit: 2 })) {
            rows.push(row);
        }

        expect(rows).toHaveLength(2);
        expect(send).toHaveBeenCalledTimes(1);
        expect((send.mock.calls[0]![0] as SendInput).input.Limit).toBe(2);
    });
});
```

`__tests__/services/DynamoDbClient/updateAttribute.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { DynamoDbClientImpl } from "../../../src/services/DynamoDbClient/DynamoDbClient.ts";
import { NoopLogger } from "../../helpers/NoopLogger.ts";

interface SendInput {
    input: Record<string, unknown>;
}

function makeClient(): { client: DynamoDbClientImpl; send: ReturnType<typeof vi.fn> } {
    const client = new DynamoDbClientImpl({ region: "us-east-1" }, new NoopLogger(), {
        maxRetries: 0,
        initialBackoffMs: 1
    });
    const send = vi.fn();
    vi.spyOn((client as unknown as { client: { send: () => unknown } }).client, "send").mockImplementation(send);
    return { client, send };
}

function conditionalCheckFailed(): Error {
    const error = new Error("The conditional request failed");
    error.name = "ConditionalCheckFailedException";
    return error;
}

describe("DynamoDbClientImpl.updateAttribute", () => {
    it("builds a SET path expression with a condition and returns written", async () => {
        const { client, send } = makeClient();
        send.mockResolvedValue({});

        const result = await client.updateAttribute("t", {
            key: { PK: "p", SK: "L" },
            path: ["data", "live"],
            value: { version: 2 },
            condition: { attribute: "_md", equals: "md-1" }
        });

        expect(result).toBe("written");
        const input = (send.mock.calls[0]![0] as SendInput).input;
        expect(input.TableName).toBe("t");
        expect(input.Key).toEqual({ PK: "p", SK: "L" });
        expect(input.UpdateExpression).toBe("SET #p0.#p1 = :v");
        expect(input.ConditionExpression).toBe("#c = :c");
        expect(input.ExpressionAttributeNames).toEqual({ "#p0": "data", "#p1": "live", "#c": "_md" });
        expect(input.ExpressionAttributeValues).toEqual({ ":v": { version: 2 }, ":c": "md-1" });
    });

    it("returns condition-failed on ConditionalCheckFailedException without retrying", async () => {
        const { client, send } = makeClient();
        send.mockRejectedValue(conditionalCheckFailed());

        const result = await client.updateAttribute("t", {
            key: { PK: "p", SK: "L" },
            path: ["data", "live"],
            value: null,
            condition: { attribute: "_md", equals: "md-1" }
        });

        expect(result).toBe("condition-failed");
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("propagates every other error", async () => {
        const { client, send } = makeClient();
        const error = new Error("boom");
        error.name = "ValidationException";
        send.mockRejectedValue(error);

        await expect(
            client.updateAttribute("t", {
                key: { PK: "p", SK: "L" },
                path: ["data"],
                value: {},
                condition: { attribute: "_md", equals: "x" }
            })
        ).rejects.toMatchObject({ name: "ValidationException" });
    });
});
```

- [ ] **Step 2: Extend the abstraction**

In `src/services/DynamoDbClient/abstractions/DynamoDbClient.ts` replace `ScanOptions` and add the update types:

```typescript
export interface ScanOptions {
    segment?: number;
    totalSegments?: number;
    /** Maximum number of items yielded by the generator (also sent as page `Limit`). */
    limit?: number;
    /** Server-side `FilterExpression SK = :sk`. Does not reduce consumed capacity. */
    sortKeyEquals?: string;
}

export interface UpdateAttributeKey {
    PK: string;
    SK: string;
}

export interface UpdateAttributeCondition {
    attribute: string;
    equals: unknown;
}

export interface UpdateAttributeRequest {
    key: UpdateAttributeKey;
    /** Attribute path, e.g. ["data", "live"]. */
    path: string[];
    /** Marshalled as-is; `null` allowed. */
    value: unknown;
    condition: UpdateAttributeCondition;
}

export type UpdateAttributeResult = "written" | "condition-failed";
```

Add to `IDynamoDbClient` after `batchPut`:

```typescript
    /**
     * Conditional `UpdateItem` that sets exactly one attribute path. Returns
     * "condition-failed" when the condition does not hold; every other error
     * propagates through the retry wrapper.
     */
    updateAttribute(tableName: string, request: UpdateAttributeRequest): Promise<UpdateAttributeResult>;
```

Add to **both** namespaces (`SourceDynamoDbClient`, `TargetDynamoDbClient`):

```typescript
    export type UpdateRequest = UpdateAttributeRequest;
    export type UpdateResult = UpdateAttributeResult;
```

- [ ] **Step 3: Implement in `DynamoDbClientImpl`**

Add `UpdateCommand` to the `@webiny/aws-sdk/client-dynamodb/index.js` import list. Replace the `scan` body:

```typescript
    public async *scan<T extends SourceDynamoDbClient.Record = BaseRecord>(
        tableName: string,
        options?: SourceDynamoDbClient.Scan
    ): AsyncIterable<T> {
        let lastEvaluatedKey: Record<string, unknown> | undefined;
        let yielded = 0;
        const limit = options ? options.limit : undefined;
        const sortKeyEquals = options ? options.sortKeyEquals : undefined;

        do {
            const command = new ScanCommand({
                TableName: tableName,
                Segment: options ? options.segment : undefined,
                TotalSegments: options ? options.totalSegments : undefined,
                ExclusiveStartKey: lastEvaluatedKey,
                Limit: limit,
                FilterExpression: sortKeyEquals !== undefined ? "SK = :sk" : undefined,
                ExpressionAttributeValues:
                    sortKeyEquals !== undefined ? { ":sk": sortKeyEquals } : undefined
            });

            const response = await this.executeWithRetry(async () => {
                return await this.client.send(command);
            });

            if (response.Items) {
                for (const item of response.Items) {
                    yield item as T;
                    yielded++;
                    if (limit !== undefined && yielded >= limit) {
                        return;
                    }
                }
            }

            lastEvaluatedKey = response.LastEvaluatedKey;
        } while (lastEvaluatedKey);
    }
```

Add after `batchPut`:

```typescript
    public async updateAttribute(
        tableName: string,
        request: SourceDynamoDbClient.UpdateRequest
    ): Promise<SourceDynamoDbClient.UpdateResult> {
        const names: Record<string, string> = {};
        const pathExpression = request.path
            .map((segment, index) => {
                const placeholder = `#p${index}`;
                names[placeholder] = segment;
                return placeholder;
            })
            .join(".");
        names["#c"] = request.condition.attribute;

        const command = new UpdateCommand({
            TableName: tableName,
            Key: request.key,
            UpdateExpression: `SET ${pathExpression} = :v`,
            ConditionExpression: "#c = :c",
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: { ":v": request.value, ":c": request.condition.equals }
        });

        try {
            await this.executeWithRetry(async () => {
                return await this.client.send(command);
            });
            return "written";
        } catch (error) {
            if (isConditionalCheckFailed(error)) {
                return "condition-failed";
            }
            throw error;
        }
    }
```

Add a module-level helper (below the constants):

```typescript
function isConditionalCheckFailed(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const { name } = error as { name?: unknown };
    return name === "ConditionalCheckFailedException";
}
```

- [ ] **Step 4: Mock client support + tests**

Replace `__tests__/services/DynamoDbClient/MockDynamoDbClient.ts` with:

```typescript
import { SourceDynamoDbClient } from "../../../src/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import type { BaseRecord } from "../../../src/domain/transform/types/records.ts";

export interface MockUpdateCall {
    tableName: string;
    request: SourceDynamoDbClient.UpdateRequest;
    result: SourceDynamoDbClient.UpdateResult;
}

/**
 * Mock implementation of IDynamoDbClient for testing. `scan` shards
 * round-robin by index (not by hash range) — group records via `queryAll`.
 */
export class MockDynamoDbClient implements SourceDynamoDbClient.Interface {
    private records: Map<string, SourceDynamoDbClient.Record[]> = new Map();
    public batchPutRecords: SourceDynamoDbClient.Record[] = [];
    public updateCalls: MockUpdateCall[] = [];

    constructor(initialRecords: Record<string, SourceDynamoDbClient.Record[]> = {}) {
        for (const [table, records] of Object.entries(initialRecords)) {
            this.records.set(table, records);
        }
    }

    async *scan<T extends SourceDynamoDbClient.Record = BaseRecord>(
        tableName: string,
        options?: SourceDynamoDbClient.Scan
    ): AsyncIterable<T> {
        const records = this.records.get(tableName) || [];
        let yielded = 0;

        for (let i = 0; i < records.length; i++) {
            const record = records[i]!;
            if (options && options.segment !== undefined && options.totalSegments) {
                if (i % options.totalSegments !== options.segment) {
                    continue;
                }
            }
            if (options && options.sortKeyEquals !== undefined && record.SK !== options.sortKeyEquals) {
                continue;
            }
            yield record as T;
            yielded++;
            if (options && options.limit !== undefined && yielded >= options.limit) {
                return;
            }
        }
    }

    async query<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        pk: string,
        sk?: string,
        _options?: SourceDynamoDbClient.Query
    ): Promise<T[]> {
        const records = this.records.get(tableName) || [];

        return records.filter(record => {
            if (record.PK !== pk) {
                return false;
            }
            if (sk && record.SK !== sk) {
                return false;
            }
            return true;
        }) as T[];
    }

    async get<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        pk: string,
        sk: string
    ): Promise<T | null> {
        const records = this.records.get(tableName) || [];
        const found = records.find(r => r.PK === pk && r.SK === sk);
        return (found as T) ?? null;
    }

    async queryAll<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        pk: string,
        sk?: string,
        options?: SourceDynamoDbClient.Query
    ): Promise<T[]> {
        return this.query<T>(tableName, pk, sk, options);
    }

    async batchPut<T extends SourceDynamoDbClient.Record>(
        tableName: string,
        records: T[]
    ): Promise<void> {
        this.batchPutRecords.push(...records);

        const tableRecords = this.records.get(tableName) || [];
        tableRecords.push(...records);
        this.records.set(tableName, tableRecords);
    }

    async updateAttribute(
        tableName: string,
        request: SourceDynamoDbClient.UpdateRequest
    ): Promise<SourceDynamoDbClient.UpdateResult> {
        const records = this.records.get(tableName) || [];
        const record = records.find(r => r.PK === request.key.PK && r.SK === request.key.SK);
        const current = record ? record[request.condition.attribute] : undefined;
        const holds = JSON.stringify(current) === JSON.stringify(request.condition.equals);
        const result: SourceDynamoDbClient.UpdateResult = record && holds ? "written" : "condition-failed";

        if (record && holds) {
            let cursor = record as Record<string, unknown>;
            for (let i = 0; i < request.path.length - 1; i++) {
                const segment = request.path[i]!;
                const next = cursor[segment];
                if (typeof next !== "object" || next === null) {
                    cursor[segment] = {};
                }
                cursor = cursor[segment] as Record<string, unknown>;
            }
            cursor[request.path[request.path.length - 1]!] = request.value;
        }

        this.updateCalls.push({ tableName, request, result });
        return result;
    }

    // Test helpers
    getRecordsForTable(tableName: string): SourceDynamoDbClient.Record[] {
        return this.records.get(tableName) || [];
    }

    clearRecords(): void {
        this.batchPutRecords = [];
        this.updateCalls = [];
    }
}
```

Create `__tests__/services/DynamoDbClient/MockDynamoDbClient.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { MockDynamoDbClient } from "./MockDynamoDbClient.ts";

describe("MockDynamoDbClient", () => {
    const rows = [
        { PK: "a", SK: "L", _md: "1", data: { live: null } },
        { PK: "a", SK: "P", _md: "1", data: {} },
        { PK: "b", SK: "L", _md: "2", data: {} }
    ];

    it("scan honours sortKeyEquals and limit", async () => {
        const client = new MockDynamoDbClient({ t: rows });
        const seen = [];
        for await (const row of client.scan("t", { sortKeyEquals: "L", limit: 1 })) {
            seen.push(row);
        }
        expect(seen).toEqual([rows[0]]);
    });

    it("updateAttribute writes a nested path when the condition holds", async () => {
        const client = new MockDynamoDbClient({ t: structuredClone(rows) });
        const result = await client.updateAttribute("t", {
            key: { PK: "a", SK: "L" },
            path: ["data", "live"],
            value: { version: 2 },
            condition: { attribute: "_md", equals: "1" }
        });
        expect(result).toBe("written");
        expect((client.getRecordsForTable("t")[0]!.data as Record<string, unknown>).live).toEqual({ version: 2 });
    });

    it("updateAttribute returns condition-failed and leaves the record untouched", async () => {
        const client = new MockDynamoDbClient({ t: structuredClone(rows) });
        const result = await client.updateAttribute("t", {
            key: { PK: "a", SK: "L" },
            path: ["data", "live"],
            value: { version: 2 },
            condition: { attribute: "_md", equals: "stale" }
        });
        expect(result).toBe("condition-failed");
        expect((client.getRecordsForTable("t")[0]!.data as Record<string, unknown>).live).toBeNull();
        expect(client.updateCalls).toHaveLength(1);
    });
});
```

- [ ] **Step 5: Verify**

```bash
yarn vitest run __tests__/services/DynamoDbClient && yarn ts-check
```

---

### Task 3: `FileTool.appendLineOrThrow`

**Files:**
- Modify: `src/tools/FileTool/abstractions/FileTool.ts`, `src/tools/FileTool/FileTool.ts`
- Test: `__tests__/tools/FileTool/FileTool.test.ts` (extend)

**Interfaces:**
- Produces: `FileTool.Interface.appendLineOrThrow(path, line)` — creates parent dir, appends `line + "\n"`.

- [ ] **Step 1: Failing test**

Append a `describe` in `__tests__/tools/FileTool/FileTool.test.ts`:

```typescript
    describe("appendLineOrThrow", () => {
        it("creates the file and parent directory, then appends one line per call", () => {
            const filePath = join(tmpDir, "nested", "report.jsonl");
            const tool = resolve();

            tool.appendLineOrThrow(filePath, '{"a":1}');
            tool.appendLineOrThrow(filePath, '{"b":2}');

            expect(readFileSync(filePath, "utf-8")).toBe('{"a":1}\n{"b":2}\n');
        });
    });
```

- [ ] **Step 2: Implement**

Add to `IFileTool` (after `writeFileOrThrow`):

```typescript
    /** Appends `line` plus a trailing newline, creating the parent directory. */
    appendLineOrThrow(path: string, line: string): void;
```

In `src/tools/FileTool/FileTool.ts` add `appendFileSync` to the `node:fs` import and the method:

```typescript
    public appendLineOrThrow(path: string, line: string): void {
        this.directoryTool.create(dirname(path));
        appendFileSync(path, `${line}\n`, "utf-8");
    }
```

- [ ] **Step 3: Verify**

```bash
yarn vitest run __tests__/tools/FileTool && yarn ts-check
```

---

### Task 4: FixLive abstractions + `LiveFieldReconciler`

**Files:**
- Create: `src/features/FixLive/abstractions/LiveFieldReconciler.ts`, `LiveFieldRunner.ts`, `ChangeReport.ts`, `FixLiveState.ts`, `index.ts`
- Create: `src/features/FixLive/LiveFieldReconciler.ts`, `src/features/FixLive/feature.ts`, `src/features/FixLive/index.ts`
- Test: `__tests__/features/FixLive/LiveFieldReconciler.test.ts`

**Interfaces:**
- Consumes: `DatabaseRecord`, `SourceDynamoDbClient.Interface`.
- Produces: tokens `LiveFieldReconciler`, `DdbLiveFieldRunner`, `OsLiveFieldRunner`, `ChangeReport`, `FixLiveState`; namespaces per spec §2.2 / §2.3 / §2.5 (the contract the sibling command plan consumes).

- [ ] **Step 1: Write the abstractions (the contract)**

`src/features/FixLive/abstractions/LiveFieldReconciler.ts`:

```typescript
import { createAbstraction } from "~/base/index.js";
import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";

export type LiveFieldTable = "ddb" | "os";

/**
 * What decide() reads: PK/SK for addressing, `_md` for the write condition,
 * `data.live` / `data.status` / `data.version` for the decision. OS rows have
 * no root TYPE, so this is deliberately narrower than BaseRecord. OS records
 * are already decompressed when they reach the reconciler.
 */
export interface ReconcilableRecord extends DatabaseRecord {
    _md: string;
    data: Record<string, unknown>;
}

export interface LiveFieldGroup {
    pk: string;
    table: LiveFieldTable;
    /** Keyed by SK. */
    records: Map<string, ReconcilableRecord>;
}

export interface LiveFieldValue {
    version: number;
}

export type LiveFieldChangeReason = "missing-live" | "empty-live" | "wrong-version" | "stale-live";

export type LiveFieldSkipReason =
    | "no-latest-record"
    | "invalid-version"
    | "revision-record-missing"
    | "revision-version-mismatch"
    | "latest-status-contradicts-published"
    | "latest-status-contradicts-unpublished"
    | "decompress-failed"
    | "changed-during-run"; // emitted by the writer, not by decide()

export interface LiveFieldChange {
    pk: string;
    sk: string;
    /** Current data.live, verbatim. */
    before: unknown;
    after: LiveFieldValue | null;
    reason: LiveFieldChangeReason;
    /** _md at read time, for the write condition. */
    expectedMd: string;
}

export interface LiveFieldSkip {
    pk: string;
    sk?: string;
    reason: LiveFieldSkipReason;
    detail?: string;
}

export interface LiveFieldDecision {
    changes: LiveFieldChange[];
    skips: LiveFieldSkip[];
}

export interface ILiveFieldReconciler {
    /** Deterministic, synchronous, no I/O. The runner guarantees a complete group. */
    decide(group: LiveFieldGroup): LiveFieldDecision;
}

export const LiveFieldReconciler = createAbstraction<ILiveFieldReconciler>("FixLive/Reconciler");

export namespace LiveFieldReconciler {
    export type Interface = ILiveFieldReconciler;
    export type Table = LiveFieldTable;
    export type Record = ReconcilableRecord;
    export type Group = LiveFieldGroup;
    export type LiveValue = LiveFieldValue;
    export type Change = LiveFieldChange;
    export type Skip = LiveFieldSkip;
    export type Decision = LiveFieldDecision;
    export type ChangeReason = LiveFieldChangeReason;
    export type SkipReason = LiveFieldSkipReason;
}
```

`src/features/FixLive/abstractions/ChangeReport.ts`:

```typescript
import { createAbstraction } from "~/base/index.js";
import type { LiveFieldReconciler } from "./LiveFieldReconciler.ts";

export type ChangeReportResult = "dry-run" | "written" | "condition-failed";

export interface ChangeReportChange {
    table: LiveFieldReconciler.Table;
    pk: string;
    sk: string;
    reason: LiveFieldReconciler.ChangeReason;
    before: unknown;
    after: LiveFieldReconciler.LiveValue | null;
    result: ChangeReportResult;
}

export interface ChangeReportSkip {
    table: LiveFieldReconciler.Table;
    pk: string;
    sk?: string;
    reason: LiveFieldReconciler.SkipReason;
    detail?: string;
}

export interface IChangeReport {
    /** Absolute path of the JSONL file. */
    readonly path: string;
    change(entry: ChangeReportChange): void;
    skip(entry: ChangeReportSkip): void;
}

export const ChangeReport = createAbstraction<IChangeReport>("FixLive/ChangeReport");

export namespace ChangeReport {
    export type Interface = IChangeReport;
    export type Result = ChangeReportResult;
    export type Change = ChangeReportChange;
    export type Skip = ChangeReportSkip;
}
```

`src/features/FixLive/abstractions/LiveFieldRunner.ts`:

```typescript
import { createAbstraction } from "~/base/index.js";
import type { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import type { LiveFieldReconciler } from "./LiveFieldReconciler.ts";
import type { ChangeReport } from "./ChangeReport.ts";

export type LiveFieldRunMode = "dry-run" | "live";

/** The system being reconciled. The command resolves Source/Target client by `--system`. */
export interface LiveFieldRunTarget {
    client: SourceDynamoDbClient.Interface;
    tableName: string;
    /** `pipeline.segments` from the project config. */
    segments: number;
    /** Segments in flight. Default 4. */
    concurrency?: number;
    /** Writes in flight per segment. Default 8. */
    writeConcurrency?: number;
}

export interface LiveFieldRunStats {
    scanned: number;
    entries: number;
    changes: Record<LiveFieldReconciler.ChangeReason, number>;
    skips: Record<LiveFieldReconciler.SkipReason, number>;
    written: number;
    conditionFailed: number;
}

export interface LiveFieldRunOptions {
    mode: LiveFieldRunMode;
    target: LiveFieldRunTarget;
    report: ChangeReport.Interface;
    onProgress(stats: LiveFieldRunStats): void;
}

export interface ILiveFieldRunner {
    run(options: LiveFieldRunOptions): Promise<LiveFieldRunStats>;
}

export const DdbLiveFieldRunner = createAbstraction<ILiveFieldRunner>("FixLive/DdbRunner");
export const OsLiveFieldRunner = createAbstraction<ILiveFieldRunner>("FixLive/OsRunner");

export namespace LiveFieldRunner {
    export type Interface = ILiveFieldRunner;
    export type Mode = LiveFieldRunMode;
    export type Target = LiveFieldRunTarget;
    export type Options = LiveFieldRunOptions;
    export type Stats = LiveFieldRunStats;
}
```

`src/features/FixLive/abstractions/FixLiveState.ts`:

```typescript
import { createAbstraction } from "~/base/index.js";

export interface FixLiveRunSummary {
    runId: string;
    /** ISO timestamp. */
    at: string;
    changes: number;
    skips: number;
}

export interface FixLiveLiveRunSummary extends FixLiveRunSummary {
    written: number;
    conditionFailed: number;
}

export interface FixLiveStateFile {
    lastDryRun?: FixLiveRunSummary;
    lastLiveRun?: FixLiveLiveRunSummary;
}

export interface FixLiveStateKey {
    project: string;
    system: "source" | "target";
}

export interface IFixLiveState {
    pathFor(key: FixLiveStateKey): string;
    read(key: FixLiveStateKey): FixLiveStateFile | null;
    recordDryRun(key: FixLiveStateKey, summary: FixLiveRunSummary): void;
    recordLiveRun(key: FixLiveStateKey, summary: FixLiveLiveRunSummary): void;
}

export const FixLiveState = createAbstraction<IFixLiveState>("FixLive/State");

export namespace FixLiveState {
    export type Interface = IFixLiveState;
    export type Key = FixLiveStateKey;
    export type RunSummary = FixLiveRunSummary;
    export type LiveRunSummary = FixLiveLiveRunSummary;
    export type File = FixLiveStateFile;
}
```

`src/features/FixLive/abstractions/index.ts`:

```typescript
export { LiveFieldReconciler } from "./LiveFieldReconciler.ts";
export { DdbLiveFieldRunner, OsLiveFieldRunner } from "./LiveFieldRunner.ts";
export { ChangeReport } from "./ChangeReport.ts";
export { FixLiveState } from "./FixLiveState.ts";
```

- [ ] **Step 2: Exhaustive failing tests for `decide`**

`__tests__/features/FixLive/LiveFieldReconciler.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { LiveFieldReconciler } from "~/features/FixLive/LiveFieldReconciler.js";
import type { LiveFieldReconciler as Reconciler } from "~/features/FixLive/abstractions/LiveFieldReconciler.js";

const PK = "T#root#CMS#CME#abc";

function rec(sk: string, data: Record<string, unknown>, md = `md-${sk}`): Reconciler.Record {
    return { PK, SK: sk, _md: md, data };
}

function group(table: Reconciler.Table, ...records: Reconciler.Record[]): Reconciler.Group {
    return { pk: PK, table, records: new Map(records.map(r => [r.SK, r])) };
}

function decide(table: Reconciler.Table, ...records: Reconciler.Record[]): Reconciler.Decision {
    return new LiveFieldReconciler().decide(group(table, ...records));
}

const skipReasons = (d: Reconciler.Decision) => d.skips.map(s => s.reason);
const changeSummary = (d: Reconciler.Decision) => d.changes.map(c => `${c.sk}:${c.reason}`).sort();

describe("LiveFieldReconciler.decide — skips", () => {
    it("no-latest-record when L is absent", () => {
        const d = decide("ddb", rec("P", { version: 1, status: "published" }));
        expect(skipReasons(d)).toEqual(["no-latest-record"]);
        expect(d.changes).toEqual([]);
    });

    it("latest-status-contradicts-unpublished when P is absent but L says published", () => {
        const d = decide("ddb", rec("L", { version: 1, status: "published" }));
        expect(skipReasons(d)).toEqual(["latest-status-contradicts-unpublished"]);
    });

    it.each([["2"], [0], [-1], [1.5], [null], [undefined]])(
        "invalid-version when P.version is %s",
        version => {
            const d = decide(
                "ddb",
                rec("L", { version: 3, status: "draft" }),
                rec("P", { version, status: "published" })
            );
            expect(skipReasons(d)).toEqual(["invalid-version"]);
        }
    );

    it("latest-status-contradicts-published when L is published but on a different version", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "published" }),
            rec("P", { version: 2, status: "published" }),
            rec("REV#0002", { version: 2 })
        );
        expect(skipReasons(d)).toEqual(["latest-status-contradicts-published"]);
    });

    it("latest-status-contradicts-published when L has P's version but is not published", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 2, status: "draft" }),
            rec("P", { version: 2, status: "published" }),
            rec("REV#0002", { version: 2 })
        );
        expect(skipReasons(d)).toEqual(["latest-status-contradicts-published"]);
    });

    it("revision-record-missing on ddb when REV#<padded> is absent", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft" }),
            rec("P", { version: 2, status: "published" })
        );
        expect(d.skips).toEqual([
            { pk: PK, sk: "REV#0002", reason: "revision-record-missing", detail: "P.version=2" }
        ]);
    });

    it("revision-version-mismatch on ddb when REV# carries another version", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 7, status: "draft" }),
            rec("P", { version: 7, status: "published" }),
            rec("REV#0007", { version: 6 })
        );
        expect(skipReasons(d)).toEqual(["revision-version-mismatch"]);
        expect(d.skips[0]!.detail).toBe("P.version=7 REV#0007.version=6");
    });

    it("a skip aborts the whole group — no changes alongside a skip", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft", live: null }),
            rec("P", { version: 2, status: "published", live: {} })
        );
        expect(d.skips).toHaveLength(1);
        expect(d.changes).toEqual([]);
    });
});

describe("LiveFieldReconciler.decide — changes", () => {
    it("missing-live on L, P and the published REV# when live is absent or null", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft" }),
            rec("P", { version: 2, status: "published", live: null }),
            rec("REV#0002", { version: 2, status: "published" }),
            rec("REV#0003", { version: 3, status: "draft" })
        );
        expect(changeSummary(d)).toEqual(["L:missing-live", "P:missing-live", "REV#0002:missing-live"]);
        for (const change of d.changes) {
            expect(change.after).toEqual({ version: 2 });
            expect(change.expectedMd).toBe(`md-${change.sk}`);
        }
    });

    it("empty-live when live is {} or has a non-integer version", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft", live: {} }),
            rec("P", { version: 2, status: "published", live: { version: "2" } }),
            rec("REV#0002", { version: 2, live: { version: 2 } })
        );
        expect(changeSummary(d)).toEqual(["L:empty-live", "P:empty-live"]);
        expect(d.changes.find(c => c.sk === "L")!.before).toEqual({});
    });

    it("wrong-version when live.version differs from P.version", () => {
        const d = decide(
            "os",
            rec("L", { version: 3, status: "draft", live: { version: 1 } }),
            rec("P", { version: 2, status: "published", live: { version: 2 } })
        );
        expect(changeSummary(d)).toEqual(["L:wrong-version"]);
    });

    it("stale-live on L only when P is absent and L carries any live value", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 2, status: "unpublished", live: { version: 1 } }),
            rec("REV#0001", { version: 1, live: { version: 1 } }),
            rec("REV#0002", { version: 2, live: { version: 1 } })
        );
        expect(changeSummary(d)).toEqual(["L:stale-live"]);
        expect(d.changes[0]!.after).toBeNull();
    });

    it("stale-live also normalises {} to null when unpublished", () => {
        const d = decide("ddb", rec("L", { version: 1, status: "draft", live: {} }));
        expect(changeSummary(d)).toEqual(["L:stale-live"]);
    });

    it("no change when unpublished and live is null or absent", () => {
        expect(decide("ddb", rec("L", { version: 1, status: "draft", live: null })).changes).toEqual([]);
        expect(decide("ddb", rec("L", { version: 1, status: "draft" })).changes).toEqual([]);
    });

    it("clean group produces neither changes nor skips", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 2, status: "published", live: { version: 2 } }),
            rec("P", { version: 2, status: "published", live: { version: 2 } }),
            rec("REV#0002", { version: 2, live: { version: 2 } }),
            rec("REV#0001", { version: 1, live: { version: 1 } })
        );
        expect(d).toEqual({ changes: [], skips: [] });
    });

    it("os table skips the REV# checks and never touches REV# records", () => {
        const d = decide(
            "os",
            rec("L", { version: 3, status: "draft" }),
            rec("P", { version: 2, status: "published" })
        );
        expect(changeSummary(d)).toEqual(["L:missing-live", "P:missing-live"]);
        expect(d.skips).toEqual([]);
    });

    it("other REV# records never appear in changes", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 3, status: "draft", live: { version: 2 } }),
            rec("P", { version: 2, status: "published", live: { version: 2 } }),
            rec("REV#0002", { version: 2, live: { version: 2 } }),
            rec("REV#0001", { version: 1, live: {} }),
            rec("REV#0003", { version: 3 })
        );
        expect(d.changes).toEqual([]);
    });

    it("single-revision published entry reconciles L, P and REV#0001", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 1, status: "published" }),
            rec("P", { version: 1, status: "published" }),
            rec("REV#0001", { version: 1, status: "published" })
        );
        expect(changeSummary(d)).toEqual(["L:missing-live", "P:missing-live", "REV#0001:missing-live"]);
    });

    it("pads version >= 10000 as REV#10000 (no truncation)", () => {
        const d = decide(
            "ddb",
            rec("L", { version: 10000, status: "published" }),
            rec("P", { version: 10000, status: "published" }),
            rec("REV#10000", { version: 10000 })
        );
        expect(d.skips).toEqual([]);
        expect(d.changes.map(c => c.sk).sort()).toEqual(["L", "P", "REV#10000"]);
    });
});
```

- [ ] **Step 3: Implement the reconciler**

`src/features/FixLive/LiveFieldReconciler.ts`:

```typescript
import { LiveFieldReconciler as LiveFieldReconcilerAbstraction } from "./abstractions/LiveFieldReconciler.ts";

export type { ILiveFieldReconciler } from "./abstractions/LiveFieldReconciler.js";

const LATEST_SK = "L";
const PUBLISHED_SK = "P";
const PUBLISHED_STATUS = "published";

type SkipWithoutPk = Omit<LiveFieldReconcilerAbstraction.Skip, "pk">;

class LiveFieldReconcilerImpl implements LiveFieldReconcilerAbstraction.Interface {
    public decide(group: LiveFieldReconcilerAbstraction.Group): LiveFieldReconcilerAbstraction.Decision {
        const latest = group.records.get(LATEST_SK);
        if (!latest) {
            return this.skip(group, { reason: "no-latest-record" });
        }
        const published = group.records.get(PUBLISHED_SK);
        if (!published) {
            return this.decideUnpublished(group, latest);
        }
        return this.decidePublished(group, latest, published);
    }

    private decideUnpublished(
        group: LiveFieldReconcilerAbstraction.Group,
        latest: LiveFieldReconcilerAbstraction.Record
    ): LiveFieldReconcilerAbstraction.Decision {
        if (latest.data.status === PUBLISHED_STATUS) {
            return this.skip(group, {
                sk: LATEST_SK,
                reason: "latest-status-contradicts-unpublished",
                detail: "P missing while L.status=published"
            });
        }
        return { changes: this.reconcile(group.pk, latest, null), skips: [] };
    }

    private decidePublished(
        group: LiveFieldReconcilerAbstraction.Group,
        latest: LiveFieldReconcilerAbstraction.Record,
        published: LiveFieldReconcilerAbstraction.Record
    ): LiveFieldReconcilerAbstraction.Decision {
        const version = published.data.version;
        if (!isPositiveInteger(version)) {
            return this.skip(group, {
                sk: PUBLISHED_SK,
                reason: "invalid-version",
                detail: `P.version=${String(version)}`
            });
        }

        const latestVersion = latest.data.version;
        const latestStatus = latest.data.status;
        if (latestStatus === PUBLISHED_STATUS && latestVersion !== version) {
            return this.skip(group, {
                sk: LATEST_SK,
                reason: "latest-status-contradicts-published",
                detail: `L.status=published L.version=${String(latestVersion)} P.version=${version}`
            });
        }
        if (latestVersion === version && latestStatus !== PUBLISHED_STATUS) {
            return this.skip(group, {
                sk: LATEST_SK,
                reason: "latest-status-contradicts-published",
                detail: `L.version=P.version=${version} but L.status=${String(latestStatus)}`
            });
        }

        const targets: LiveFieldReconcilerAbstraction.Record[] = [latest, published];
        if (group.table === "ddb") {
            const revisionSk = `REV#${padVersion(version)}`;
            const revision = group.records.get(revisionSk);
            if (!revision) {
                return this.skip(group, {
                    sk: revisionSk,
                    reason: "revision-record-missing",
                    detail: `P.version=${version}`
                });
            }
            if (revision.data.version !== version) {
                return this.skip(group, {
                    sk: revisionSk,
                    reason: "revision-version-mismatch",
                    detail: `P.version=${version} ${revisionSk}.version=${String(revision.data.version)}`
                });
            }
            targets.push(revision);
        }

        const expected: LiveFieldReconcilerAbstraction.LiveValue = { version };
        const changes = targets.flatMap(record => this.reconcile(group.pk, record, expected));
        return { changes, skips: [] };
    }

    private reconcile(
        pk: string,
        record: LiveFieldReconcilerAbstraction.Record,
        expected: LiveFieldReconcilerAbstraction.LiveValue | null
    ): LiveFieldReconcilerAbstraction.Change[] {
        const live = record.data.live;
        const base = { pk, sk: record.SK, before: live, expectedMd: record._md };

        if (expected === null) {
            if (live === undefined || live === null) {
                return [];
            }
            return [{ ...base, after: null, reason: "stale-live" }];
        }
        if (live === undefined || live === null) {
            return [{ ...base, after: expected, reason: "missing-live" }];
        }
        const current = readLiveVersion(live);
        if (current === null) {
            return [{ ...base, after: expected, reason: "empty-live" }];
        }
        if (current !== expected.version) {
            return [{ ...base, after: expected, reason: "wrong-version" }];
        }
        return [];
    }

    private skip(
        group: LiveFieldReconcilerAbstraction.Group,
        skip: SkipWithoutPk
    ): LiveFieldReconcilerAbstraction.Decision {
        return { changes: [], skips: [{ pk: group.pk, ...skip }] };
    }
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** v6 `zeroPad`: 4 digits minimum, never truncated (10000 → "10000"). */
function padVersion(version: number): string {
    return String(version).padStart(4, "0");
}

function readLiveVersion(live: unknown): number | null {
    if (typeof live !== "object" || live === null) {
        return null;
    }
    const { version } = live as Record<string, unknown>;
    return isPositiveInteger(version) ? version : null;
}

export const LiveFieldReconciler = LiveFieldReconcilerAbstraction.createImplementation({
    implementation: LiveFieldReconcilerImpl,
    dependencies: []
});
```

- [ ] **Step 4: Feature + index (grown in later tasks)**

`src/features/FixLive/feature.ts`:

```typescript
import { createFeature } from "~/base/index.js";
import { LiveFieldReconciler } from "./LiveFieldReconciler.ts";

export const FixLiveFeature = createFeature({
    name: "FixLive/FixLiveFeature",
    register(container) {
        container.register(LiveFieldReconciler).inSingletonScope();
    }
});
```

`src/features/FixLive/index.ts`:

```typescript
export {
    LiveFieldReconciler,
    DdbLiveFieldRunner,
    OsLiveFieldRunner,
    ChangeReport,
    FixLiveState
} from "./abstractions/index.ts";
export { FixLiveFeature } from "./feature.ts";
```

- [ ] **Step 5: Verify**

```bash
yarn vitest run __tests__/features/FixLive/LiveFieldReconciler.test.ts && yarn ts-check
```

---

### Task 5: `ChangeReport` (JSONL) + test container

**Files:**
- Create: `src/features/FixLive/ChangeReport.ts`
- Modify: `src/features/FixLive/feature.ts`
- Create: `__tests__/features/FixLive/fixLiveContainer.ts`, `__tests__/features/FixLive/MockChangeReport.ts`
- Test: `__tests__/features/FixLive/ChangeReport.test.ts`

**Interfaces:**
- Consumes: `TransferContext.runId`, `FileTool.appendLineOrThrow`.
- Produces: `ChangeReport` implementation writing `.transfer/<runId>/fix-live-report.jsonl`; `MockChangeReport` for runner tests.

- [ ] **Step 1: Test container + mock report**

`__tests__/features/FixLive/fixLiveContainer.ts`:

```typescript
import { Container } from "@webiny/di";
import { CompressionFeature } from "@webiny/utils/features/compression/feature.js";
import { ContainerToken } from "~/base/index.js";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.js";
import { LoggerFeature } from "~/tools/Logger/index.js";
import { DirectoryToolFeature } from "~/tools/DirectoryTool/index.js";
import { FileToolFeature } from "~/tools/FileTool/index.js";
import { OsRecordDecompressorFeature } from "~/features/OsRecordDecompressor/index.js";
import { FixLiveFeature } from "~/features/FixLive/index.js";

export interface FixLiveContainerOptions {
    runId?: string;
}

/** Minimal container for FixLive tests — no pipeline, no source/target clients. */
export function createFixLiveContainer(options: FixLiveContainerOptions = {}): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(TransferContext, { runId: options.runId ?? "fix-live-test-run" });
    LoggerFeature.register(container, { logLevel: "error", json: false });
    CompressionFeature.register(container);
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);
    OsRecordDecompressorFeature.register(container);
    FixLiveFeature.register(container);
    return container;
}
```

`__tests__/features/FixLive/MockChangeReport.ts`:

```typescript
import type { ChangeReport } from "~/features/FixLive/abstractions/ChangeReport.js";

export class MockChangeReport implements ChangeReport.Interface {
    public readonly path = "/dev/null/fix-live-report.jsonl";
    public readonly changes: ChangeReport.Change[] = [];
    public readonly skips: ChangeReport.Skip[] = [];

    public change(entry: ChangeReport.Change): void {
        this.changes.push(entry);
    }

    public skip(entry: ChangeReport.Skip): void {
        this.skips.push(entry);
    }
}
```

- [ ] **Step 2: Failing test**

`__tests__/features/FixLive/ChangeReport.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChangeReport } from "~/features/FixLive/index.js";
import { createFixLiveContainer } from "./fixLiveContainer.ts";

describe("ChangeReport", () => {
    let originalCwd: string;
    let workDir: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "fix-live-report-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("appends one JSON line per event under .transfer/<runId>/fix-live-report.jsonl", async () => {
        const report = createFixLiveContainer({ runId: "run-1" }).resolve(ChangeReport);

        report.change({
            table: "ddb",
            pk: "T#root#CMS#CME#abc",
            sk: "L",
            reason: "missing-live",
            before: undefined,
            after: { version: 2 },
            result: "dry-run"
        });
        report.skip({
            table: "ddb",
            pk: "T#root#CMS#CME#def",
            sk: "REV#0007",
            reason: "revision-version-mismatch",
            detail: "P.version=7 REV#0007.version=6"
        });

        expect(report.path).toBe(join(workDir, ".transfer", "run-1", "fix-live-report.jsonl"));
        const lines = (await readFile(report.path, "utf-8")).trim().split("\n");
        expect(JSON.parse(lines[0]!)).toEqual({
            kind: "change",
            table: "ddb",
            pk: "T#root#CMS#CME#abc",
            sk: "L",
            reason: "missing-live",
            before: null,
            after: { version: 2 },
            result: "dry-run"
        });
        expect(JSON.parse(lines[1]!)).toEqual({
            kind: "skip",
            table: "ddb",
            pk: "T#root#CMS#CME#def",
            sk: "REV#0007",
            reason: "revision-version-mismatch",
            detail: "P.version=7 REV#0007.version=6"
        });
    });
});
```

- [ ] **Step 3: Implement**

`src/features/FixLive/ChangeReport.ts`:

```typescript
import { join } from "node:path";
import { ChangeReport as ChangeReportAbstraction } from "./abstractions/ChangeReport.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.js";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.js";

export type { IChangeReport } from "./abstractions/ChangeReport.js";

const REPORT_FILE_NAME = "fix-live-report.jsonl";

interface ChangeLine extends ChangeReportAbstraction.Change {
    kind: "change";
}

interface SkipLine extends ChangeReportAbstraction.Skip {
    kind: "skip";
}

type ReportLine = ChangeLine | SkipLine;

/**
 * Appends one JSON line per event as it happens, so the file is a valid
 * audit trail even when the run is interrupted.
 */
class JsonlChangeReportImpl implements ChangeReportAbstraction.Interface {
    public readonly path: string;

    public constructor(
        transferContext: TransferContext.Interface,
        private readonly fileTool: FileTool.Interface
    ) {
        this.path = join(process.cwd(), ".transfer", transferContext.runId, REPORT_FILE_NAME);
    }

    public change(entry: ChangeReportAbstraction.Change): void {
        this.append({
            kind: "change",
            table: entry.table,
            pk: entry.pk,
            sk: entry.sk,
            reason: entry.reason,
            before: entry.before === undefined ? null : entry.before,
            after: entry.after,
            result: entry.result
        });
    }

    public skip(entry: ChangeReportAbstraction.Skip): void {
        this.append({
            kind: "skip",
            table: entry.table,
            pk: entry.pk,
            sk: entry.sk,
            reason: entry.reason,
            detail: entry.detail
        });
    }

    private append(line: ReportLine): void {
        this.fileTool.appendLineOrThrow(this.path, JSON.stringify(line));
    }
}

export const ChangeReport = ChangeReportAbstraction.createImplementation({
    implementation: JsonlChangeReportImpl,
    dependencies: [TransferContext, FileTool]
});
```

Add to `feature.ts`: `import { ChangeReport } from "./ChangeReport.ts";` and `container.register(ChangeReport).inSingletonScope();`.

- [ ] **Step 4: Verify**

```bash
yarn vitest run __tests__/features/FixLive/ChangeReport.test.ts && yarn ts-check
```

---

### Task 6: `FixLiveState` store

**Files:**
- Create: `src/features/FixLive/FixLiveState.ts`
- Modify: `src/features/FixLive/feature.ts`
- Test: `__tests__/features/FixLive/FixLiveState.test.ts`

**Interfaces:**
- Consumes: `FileTool` (`exists`, `readFileOrThrow`, `writeFileOrThrow`).
- Produces: `FixLiveState` implementation over `.transfer/state/fix-live/<project>__<system>.json`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixLiveState } from "~/features/FixLive/index.js";
import { createFixLiveContainer } from "./fixLiveContainer.ts";

const KEY = { project: "acme", system: "target" as const };

describe("FixLiveState", () => {
    let originalCwd: string;
    let workDir: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "fix-live-state-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("resolves the path under .transfer/state/fix-live", () => {
        const state = createFixLiveContainer().resolve(FixLiveState);
        expect(state.pathFor(KEY)).toBe(join(workDir, ".transfer", "state", "fix-live", "acme__target.json"));
    });

    it("read returns null when no state exists", () => {
        expect(createFixLiveContainer().resolve(FixLiveState).read(KEY)).toBeNull();
    });

    it("recordDryRun writes lastDryRun; recordLiveRun adds lastLiveRun and keeps lastDryRun", async () => {
        const state = createFixLiveContainer().resolve(FixLiveState);
        const dry = { runId: "1", at: "2026-09-04T09:12:33.000Z", changes: 2118, skips: 4 };
        const live = { ...dry, runId: "2", written: 2110, conditionFailed: 8 };

        state.recordDryRun(KEY, dry);
        expect(state.read(KEY)).toEqual({ lastDryRun: dry });

        state.recordLiveRun(KEY, live);
        expect(state.read(KEY)).toEqual({ lastDryRun: dry, lastLiveRun: live });
        expect(JSON.parse(await readFile(state.pathFor(KEY), "utf-8"))).toEqual({
            lastDryRun: dry,
            lastLiveRun: live
        });
    });
});
```

- [ ] **Step 2: Implement**

`src/features/FixLive/FixLiveState.ts`:

```typescript
import { join } from "node:path";
import { FixLiveState as FixLiveStateAbstraction } from "./abstractions/FixLiveState.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.js";

export type { IFixLiveState } from "./abstractions/FixLiveState.js";

class FixLiveStateImpl implements FixLiveStateAbstraction.Interface {
    public constructor(private readonly fileTool: FileTool.Interface) {}

    public pathFor(key: FixLiveStateAbstraction.Key): string {
        return join(process.cwd(), ".transfer", "state", "fix-live", `${key.project}__${key.system}.json`);
    }

    public read(key: FixLiveStateAbstraction.Key): FixLiveStateAbstraction.File | null {
        const path = this.pathFor(key);
        if (!this.fileTool.exists(path)) {
            return null;
        }
        return JSON.parse(this.fileTool.readFileOrThrow(path)) as FixLiveStateAbstraction.File;
    }

    public recordDryRun(
        key: FixLiveStateAbstraction.Key,
        summary: FixLiveStateAbstraction.RunSummary
    ): void {
        this.write(key, { ...(this.read(key) ?? {}), lastDryRun: summary });
    }

    public recordLiveRun(
        key: FixLiveStateAbstraction.Key,
        summary: FixLiveStateAbstraction.LiveRunSummary
    ): void {
        this.write(key, { ...(this.read(key) ?? {}), lastLiveRun: summary });
    }

    private write(key: FixLiveStateAbstraction.Key, file: FixLiveStateAbstraction.File): void {
        this.fileTool.writeFileOrThrow(this.pathFor(key), `${JSON.stringify(file, null, 2)}\n`);
    }
}

export const FixLiveState = FixLiveStateAbstraction.createImplementation({
    implementation: FixLiveStateImpl,
    dependencies: [FileTool]
});
```

Add to `feature.ts`: `import { FixLiveState } from "./FixLiveState.ts";` and `container.register(FixLiveState).inSingletonScope();`.

- [ ] **Step 3: Verify**

```bash
yarn vitest run __tests__/features/FixLive && yarn ts-check
```

---

### Task 7: `BaseLiveFieldRunner` + `DdbLiveFieldRunner` + bootstrap wiring

**Files:**
- Create: `src/features/FixLive/createEmptyStats.ts`, `src/features/FixLive/runConcurrently.ts`, `src/features/FixLive/cmsEntryGuards.ts`, `src/features/FixLive/BaseLiveFieldRunner.ts`, `src/features/FixLive/DdbLiveFieldRunner.ts`
- Modify: `src/features/FixLive/feature.ts`, `src/bootstrap.ts`
- Test: `__tests__/features/FixLive/DdbLiveFieldRunner.test.ts`

**Interfaces:**
- Consumes: `LiveFieldReconciler`, `Logger`, `SourceDynamoDbClient.Interface` (`scan` with `sortKeyEquals`, `queryAll`, `updateAttribute`), `isCmsEntry`.
- Produces: `DdbLiveFieldRunner` token bound; `createEmptyStats()`; `runConcurrently()`.

- [ ] **Step 1: Failing unit test against `MockDynamoDbClient`**

`__tests__/features/FixLive/DdbLiveFieldRunner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { DdbLiveFieldRunner } from "~/features/FixLive/index.js";
import type { LiveFieldRunner } from "~/features/FixLive/abstractions/LiveFieldRunner.js";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { createFixLiveContainer } from "./fixLiveContainer.ts";
import { MockChangeReport } from "./MockChangeReport.ts";

const TABLE = "v6-main";

function entry(id: string, sk: string, data: Record<string, unknown>, md = "md-1") {
    return {
        PK: `T#root#CMS#CME#${id}`,
        SK: sk,
        TYPE: sk === "P" ? "cms.entry.p" : sk === "L" ? "cms.entry.l" : "cms.entry",
        _et: "CmsEntries",
        _ct: "2026-01-01T00:00:00.000Z",
        _md: md,
        data: { modelId: "blogPost", entryId: id, ...data }
    };
}

function seed() {
    return [
        // draft over published, live missing everywhere → 3 changes
        entry("a", "L", { version: 3, status: "draft" }),
        entry("a", "P", { version: 2, status: "published" }),
        entry("a", "REV#0002", { version: 2, status: "published" }),
        entry("a", "REV#0003", { version: 3, status: "draft" }),
        // unpublished with stale live → 1 change
        entry("b", "L", { version: 1, status: "unpublished", live: { version: 1 } }),
        entry("b", "REV#0001", { version: 1, live: { version: 1 } }),
        // published, REV# missing → skip
        entry("c", "L", { version: 1, status: "published" }),
        entry("c", "P", { version: 1, status: "published" }),
        // file manager row → ignored
        entry("f", "L", { modelId: "fmFile", version: 1, status: "draft" }),
        // not a CMS entry → scanned only
        { PK: "T#root#PB#P#p1", SK: "L", TYPE: "pb.page.l", _et: "Pb", _ct: "x", _md: "x", data: {} }
    ];
}

function run(client: MockDynamoDbClient, mode: LiveFieldRunner.Mode, segments = 2) {
    const runner = createFixLiveContainer().resolve(DdbLiveFieldRunner);
    const report = new MockChangeReport();
    const progress: number[] = [];
    return runner
        .run({
            mode,
            target: { client, tableName: TABLE, segments, concurrency: 2, writeConcurrency: 2 },
            report,
            onProgress: stats => progress.push(stats.scanned)
        })
        .then(stats => ({ stats, report, progress }));
}

describe("DdbLiveFieldRunner", () => {
    it("dry run: counts, reports, writes nothing", async () => {
        const client = new MockDynamoDbClient({ [TABLE]: seed() });
        const { stats, report, progress } = await run(client, "dry-run");

        expect(stats.scanned).toBe(5);
        expect(stats.entries).toBe(3);
        expect(stats.changes).toMatchObject({ "missing-live": 3, "stale-live": 1 });
        expect(stats.skips).toMatchObject({ "revision-record-missing": 1 });
        expect(stats.written).toBe(0);
        expect(client.updateCalls).toEqual([]);
        expect(report.changes).toHaveLength(4);
        expect(report.changes.every(c => c.result === "dry-run" && c.table === "ddb")).toBe(true);
        expect(report.skips).toEqual([
            {
                table: "ddb",
                pk: "T#root#CMS#CME#c",
                sk: "REV#0001",
                reason: "revision-record-missing",
                detail: "P.version=1"
            }
        ]);
        expect(progress.length).toBeGreaterThan(0);
    });

    it("live run: conditional updates on data.live only", async () => {
        const client = new MockDynamoDbClient({ [TABLE]: seed() });
        const { stats, report } = await run(client, "live");

        expect(stats.written).toBe(4);
        expect(stats.conditionFailed).toBe(0);
        expect(client.updateCalls).toHaveLength(4);
        for (const call of client.updateCalls) {
            expect(call.request.path).toEqual(["data", "live"]);
            expect(call.request.condition).toEqual({ attribute: "_md", equals: "md-1" });
        }
        const rows = client.getRecordsForTable(TABLE);
        const data = (id: string, sk: string) =>
            rows.find(r => r.PK === `T#root#CMS#CME#${id}` && r.SK === sk)!.data as Record<string, unknown>;
        expect(data("a", "L").live).toEqual({ version: 2 });
        expect(data("a", "P").live).toEqual({ version: 2 });
        expect(data("a", "REV#0002").live).toEqual({ version: 2 });
        expect(data("a", "REV#0003").live).toBeUndefined();
        expect(data("b", "L").live).toBeNull();
        expect(report.changes.every(c => c.result === "written")).toBe(true);
    });

    it("live run: a record changed since read is reported as changed-during-run", async () => {
        const rows = seed();
        const client = new MockDynamoDbClient({ [TABLE]: rows });
        const original = client.updateAttribute.bind(client);
        client.updateAttribute = async (table, request) => {
            if (request.key.PK === "T#root#CMS#CME#a" && request.key.SK === "L") {
                rows.find(r => r.PK === request.key.PK && r.SK === "L")!._md = "md-2";
            }
            return original(table, request);
        };

        const { stats, report } = await run(client, "live");

        expect(stats.written).toBe(3);
        expect(stats.conditionFailed).toBe(1);
        expect(stats.skips["changed-during-run"]).toBe(1);
        expect(report.changes.find(c => c.sk === "L" && c.pk.endsWith("#a"))!.result).toBe("condition-failed");
        expect(report.skips).toContainEqual({
            table: "ddb",
            pk: "T#root#CMS#CME#a",
            sk: "L",
            reason: "changed-during-run",
            detail: undefined
        });
    });
});
```

- [ ] **Step 2: Helpers**

`src/features/FixLive/createEmptyStats.ts`:

```typescript
import type { LiveFieldReconciler } from "./abstractions/LiveFieldReconciler.ts";
import type { LiveFieldRunner } from "./abstractions/LiveFieldRunner.ts";

export const CHANGE_REASONS: readonly LiveFieldReconciler.ChangeReason[] = [
    "missing-live",
    "empty-live",
    "wrong-version",
    "stale-live"
];

export const SKIP_REASONS: readonly LiveFieldReconciler.SkipReason[] = [
    "no-latest-record",
    "invalid-version",
    "revision-record-missing",
    "revision-version-mismatch",
    "latest-status-contradicts-published",
    "latest-status-contradicts-unpublished",
    "decompress-failed",
    "changed-during-run"
];

export function createEmptyStats(): LiveFieldRunner.Stats {
    const changes = Object.fromEntries(CHANGE_REASONS.map(reason => [reason, 0])) as Record<
        LiveFieldReconciler.ChangeReason,
        number
    >;
    const skips = Object.fromEntries(SKIP_REASONS.map(reason => [reason, 0])) as Record<
        LiveFieldReconciler.SkipReason,
        number
    >;
    return { scanned: 0, entries: 0, changes, skips, written: 0, conditionFailed: 0 };
}
```

`src/features/FixLive/runConcurrently.ts`:

```typescript
/**
 * Runs `fn` over `items` with at most `limit` promises in flight. The first
 * rejection propagates; work already started keeps running to completion.
 */
export async function runConcurrently<T>(
    items: readonly T[],
    limit: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    const queue = [...items];
    const size = Math.max(1, Math.min(limit, queue.length));
    const workers: Promise<void>[] = [];

    for (let i = 0; i < size; i++) {
        workers.push(
            (async () => {
                for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
                    await fn(next);
                }
            })()
        );
    }

    await Promise.all(workers);
}
```

`src/features/FixLive/cmsEntryGuards.ts`:

```typescript
import { isCmsEntry } from "~/domain/transform/filters.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";

// Mirrors INTERNAL_MODELS in src/transformers/cms/addLiveField.ts. File Manager
// has no publishing, so its rows never receive `live` and are never reconciled.
const INTERNAL_MODELS = new Set(["fmfile", "wbyfmfile"]);

/** isCmsEntry matches on TYPE prefix or PK containing "#CMS#CME#"; both work on raw rows. */
export function isCmsEntryRow(row: DatabaseRecord): boolean {
    return isCmsEntry(row as BaseRecord);
}

export function isInternalModel(modelId: unknown): boolean {
    return typeof modelId === "string" && INTERNAL_MODELS.has(modelId.toLowerCase());
}

/** Root first (v5 shape), then `data` (v6 shape). */
export function readModelId(record: DatabaseRecord): unknown {
    if (record.modelId !== undefined) {
        return record.modelId;
    }
    const data = record.data as Record<string, unknown> | undefined;
    return data?.modelId;
}
```

- [ ] **Step 3: Base runner**

`src/features/FixLive/BaseLiveFieldRunner.ts`:

```typescript
import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import type { Logger } from "~/tools/Logger/abstractions/Logger.js";
import type { LiveFieldReconciler } from "./abstractions/LiveFieldReconciler.ts";
import type { LiveFieldRunner } from "./abstractions/LiveFieldRunner.ts";
import type { ChangeReport } from "./abstractions/ChangeReport.ts";
import { createEmptyStats } from "./createEmptyStats.ts";
import { runConcurrently } from "./runConcurrently.ts";
import { isCmsEntryRow } from "./cmsEntryGuards.ts";

const DEFAULT_SEGMENT_CONCURRENCY = 4;
const DEFAULT_WRITE_CONCURRENCY = 8;
const LATEST_SK = "L";
const MD_ATTRIBUTE = "_md";

export interface ReadyGroup {
    kind: "ready";
    records: Map<string, LiveFieldReconciler.Record>;
}

/** Not a reconcilable entry (e.g. File Manager row) — counted as scanned only. */
export interface IgnoredGroup {
    kind: "ignored";
}

export interface SkippedGroup {
    kind: "skipped";
    reason: LiveFieldReconciler.SkipReason;
    detail?: string;
}

export type GroupPreparation = ReadyGroup | IgnoredGroup | SkippedGroup;

export interface AttributeWrite {
    path: string[];
    value: unknown;
}

interface SegmentRun {
    segment: number;
    totalSegments: number;
}

/**
 * Scan → group → decide → write loop shared by the DDB and OS runners.
 * Scans `L` rows per segment, queries the full PK for the authoritative
 * group (no reliance on scan ordering), and conditions every write on `_md`.
 */
export abstract class BaseLiveFieldRunner implements LiveFieldRunner.Interface {
    protected abstract readonly table: LiveFieldReconciler.Table;

    protected constructor(
        protected readonly reconciler: LiveFieldReconciler.Interface,
        protected readonly logger: Logger.Interface
    ) {}

    /** Cheap gate on the scanned L row before queryAll. */
    protected abstract acceptsRow(row: DatabaseRecord): boolean;

    /** Turns the queryAll result into reconciler records (OS: decompress). */
    protected abstract prepareGroup(pk: string, rows: DatabaseRecord[]): Promise<GroupPreparation>;

    /** UpdateItem path + value for one change. */
    protected abstract buildWrite(
        change: LiveFieldReconciler.Change,
        record: LiveFieldReconciler.Record
    ): Promise<AttributeWrite>;

    public async run(options: LiveFieldRunner.Options): Promise<LiveFieldRunner.Stats> {
        const stats = createEmptyStats();
        const segments: SegmentRun[] = [];
        for (let segment = 0; segment < options.target.segments; segment++) {
            segments.push({ segment, totalSegments: options.target.segments });
        }
        const concurrency = options.target.concurrency ?? DEFAULT_SEGMENT_CONCURRENCY;

        await runConcurrently(segments, concurrency, run => this.runSegment(run, options, stats));

        options.onProgress(stats);
        return stats;
    }

    private async runSegment(
        run: SegmentRun,
        options: LiveFieldRunner.Options,
        stats: LiveFieldRunner.Stats
    ): Promise<void> {
        const { client, tableName } = options.target;
        const rows = client.scan<DatabaseRecord>(tableName, {
            segment: run.segment,
            totalSegments: run.totalSegments,
            sortKeyEquals: LATEST_SK
        });

        for await (const row of rows) {
            stats.scanned++;
            if (!isCmsEntryRow(row) || !this.acceptsRow(row)) {
                options.onProgress(stats);
                continue;
            }

            const groupRows = await client.queryAll<DatabaseRecord>(tableName, row.PK);
            const prepared = await this.prepareGroup(row.PK, groupRows);
            if (prepared.kind === "ignored") {
                options.onProgress(stats);
                continue;
            }

            stats.entries++;
            if (prepared.kind === "skipped") {
                this.recordSkip(options, stats, {
                    pk: row.PK,
                    sk: LATEST_SK,
                    reason: prepared.reason,
                    detail: prepared.detail
                });
                options.onProgress(stats);
                continue;
            }

            const decision = this.reconciler.decide({
                pk: row.PK,
                table: this.table,
                records: prepared.records
            });
            for (const skip of decision.skips) {
                this.recordSkip(options, stats, skip);
            }
            await this.applyChanges(decision.changes, prepared.records, options, stats);
            options.onProgress(stats);
        }

        this.logger.debug(
            `fix-live[${this.table}]: segment ${run.segment + 1}/${run.totalSegments} done — ${stats.scanned} rows scanned so far`
        );
    }

    private async applyChanges(
        changes: LiveFieldReconciler.Change[],
        records: Map<string, LiveFieldReconciler.Record>,
        options: LiveFieldRunner.Options,
        stats: LiveFieldRunner.Stats
    ): Promise<void> {
        for (const change of changes) {
            stats.changes[change.reason]++;
        }
        if (options.mode === "dry-run") {
            for (const change of changes) {
                options.report.change(this.toReportChange(change, "dry-run"));
            }
            return;
        }
        const writeConcurrency = options.target.writeConcurrency ?? DEFAULT_WRITE_CONCURRENCY;
        await runConcurrently(changes, writeConcurrency, change =>
            this.write(change, records, options, stats)
        );
    }

    private async write(
        change: LiveFieldReconciler.Change,
        records: Map<string, LiveFieldReconciler.Record>,
        options: LiveFieldRunner.Options,
        stats: LiveFieldRunner.Stats
    ): Promise<void> {
        const record = records.get(change.sk);
        if (!record) {
            throw new Error(
                `fix-live: decide() emitted a change for ${change.pk} ${change.sk}, which is not in the group`
            );
        }
        const { path, value } = await this.buildWrite(change, record);
        const result = await options.target.client.updateAttribute(options.target.tableName, {
            key: { PK: change.pk, SK: change.sk },
            path,
            value,
            condition: { attribute: MD_ATTRIBUTE, equals: change.expectedMd }
        });

        if (result === "written") {
            stats.written++;
            options.report.change(this.toReportChange(change, "written"));
            return;
        }
        stats.conditionFailed++;
        options.report.change(this.toReportChange(change, "condition-failed"));
        this.recordSkip(options, stats, { pk: change.pk, sk: change.sk, reason: "changed-during-run" });
    }

    private recordSkip(
        options: LiveFieldRunner.Options,
        stats: LiveFieldRunner.Stats,
        skip: LiveFieldReconciler.Skip
    ): void {
        stats.skips[skip.reason]++;
        options.report.skip({
            table: this.table,
            pk: skip.pk,
            sk: skip.sk,
            reason: skip.reason,
            detail: skip.detail
        });
    }

    private toReportChange(
        change: LiveFieldReconciler.Change,
        result: ChangeReport.Result
    ): ChangeReport.Change {
        return {
            table: this.table,
            pk: change.pk,
            sk: change.sk,
            reason: change.reason,
            before: change.before,
            after: change.after,
            result
        };
    }
}
```

- [ ] **Step 4: DDB runner**

`src/features/FixLive/DdbLiveFieldRunner.ts`:

```typescript
import { DdbLiveFieldRunner as DdbLiveFieldRunnerAbstraction } from "./abstractions/LiveFieldRunner.ts";
import { LiveFieldReconciler } from "./abstractions/LiveFieldReconciler.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.js";
import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { BaseLiveFieldRunner, type AttributeWrite, type GroupPreparation } from "./BaseLiveFieldRunner.ts";
import { isInternalModel, readModelId } from "./cmsEntryGuards.ts";

export type { ILiveFieldRunner } from "./abstractions/LiveFieldRunner.js";

class DdbLiveFieldRunnerImpl extends BaseLiveFieldRunner {
    protected readonly table: LiveFieldReconciler.Table = "ddb";

    public constructor(reconciler: LiveFieldReconciler.Interface, logger: Logger.Interface) {
        super(reconciler, logger);
    }

    protected acceptsRow(row: DatabaseRecord): boolean {
        return !isInternalModel(readModelId(row));
    }

    protected async prepareGroup(_pk: string, rows: DatabaseRecord[]): Promise<GroupPreparation> {
        const records = new Map<string, LiveFieldReconciler.Record>();
        for (const row of rows) {
            records.set(row.SK, toReconcilable(row));
        }
        return { kind: "ready", records };
    }

    protected async buildWrite(change: LiveFieldReconciler.Change): Promise<AttributeWrite> {
        return { path: ["data", "live"], value: change.after };
    }
}

function toReconcilable(row: DatabaseRecord): LiveFieldReconciler.Record {
    const data = row.data;
    return {
        ...row,
        // v6 always writes _md; an absent value can never satisfy the write condition.
        _md: typeof row._md === "string" ? row._md : "",
        data: typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
    };
}

export const DdbLiveFieldRunner = DdbLiveFieldRunnerAbstraction.createImplementation({
    implementation: DdbLiveFieldRunnerImpl,
    dependencies: [LiveFieldReconciler, Logger]
});
```

- [ ] **Step 5: Register**

`feature.ts`: add `import { DdbLiveFieldRunner } from "./DdbLiveFieldRunner.ts";` and `container.register(DdbLiveFieldRunner).inSingletonScope();`.

`src/bootstrap.ts`: add `import { FixLiveFeature } from "~/features/FixLive/index.js";` and, after `AccessCheckerFeature.register(container);`, add `FixLiveFeature.register(container);`.

- [ ] **Step 6: Verify**

```bash
yarn vitest run __tests__/features/FixLive && yarn ts-check && yarn lint
```

---

### Task 8: `DdbLiveFieldRunner` dynalite integration test

**Files:**
- Test: `__tests__/integration/fixLive.ddbRunner.test.ts`

**Interfaces:**
- Consumes: `startDynalite`, `waitForTableActive`, `DynamoDbClientImpl` (constructed directly with `endpoint`, like `failedBatchLogging.test.ts`), `createFixLiveContainer`, `MockChangeReport`.

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDbClientImpl } from "~/services/DynamoDbClient/DynamoDbClient.js";
import type { SourceDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { DdbLiveFieldRunner } from "~/features/FixLive/index.js";
import type { LiveFieldRunner } from "~/features/FixLive/abstractions/LiveFieldRunner.js";
import { startDynalite, waitForTableActive, type DynaliteInstance } from "./dynalite.ts";
import { NoopLogger } from "../helpers/NoopLogger.ts";
import { createFixLiveContainer } from "../features/FixLive/fixLiveContainer.ts";
import { MockChangeReport } from "../features/FixLive/MockChangeReport.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const TABLE = "fix-live-ddb";
const PK_A = "T#root#CMS#CME#a";
const PK_B = "T#root#CMS#CME#b";

interface SeedRow {
    PK: string;
    SK: string;
    TYPE: string;
    _et: string;
    _ct: string;
    _md: string;
    data: Record<string, unknown>;
}

function row(pk: string, sk: string, data: Record<string, unknown>): SeedRow {
    return {
        PK: pk,
        SK: sk,
        TYPE: sk === "P" ? "cms.entry.p" : sk === "L" ? "cms.entry.l" : "cms.entry",
        _et: "CmsEntries",
        _ct: "2026-01-01T00:00:00.000Z",
        _md: "2026-01-01T00:00:00.000Z",
        data: { modelId: "blogPost", values: { emptyString: "" }, ...data }
    };
}

const SEED: SeedRow[] = [
    row(PK_A, "L", { version: 3, status: "draft" }),
    row(PK_A, "P", { version: 2, status: "published" }),
    row(PK_A, "REV#0002", { version: 2, status: "published" }),
    row(PK_A, "REV#0003", { version: 3, status: "draft" }),
    row(PK_B, "L", { version: 1, status: "unpublished", live: { version: 1 } }),
    row(PK_B, "REV#0001", { version: 1, live: { version: 1 } })
];

async function createTable(doc: DynamoDBDocument, tableName: string): Promise<void> {
    await doc.send(
        new CreateTableCommand({
            TableName: tableName,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                { AttributeName: "PK", AttributeType: "S" },
                { AttributeName: "SK", AttributeType: "S" }
            ],
            KeySchema: [
                { AttributeName: "PK", KeyType: "HASH" },
                { AttributeName: "SK", KeyType: "RANGE" }
            ]
        })
    );
    await waitForTableActive(doc, tableName);
}

async function scanAll(doc: DynamoDBDocument, tableName: string): Promise<SeedRow[]> {
    const response = await doc.send(new ScanCommand({ TableName: tableName }));
    return (response.Items ?? []) as SeedRow[];
}

/** Test hook: bumps `_md` on one key right before the runner's write reaches DynamoDB. */
class MdBumpingClient implements SourceDynamoDbClient.Interface {
    public constructor(
        private readonly inner: SourceDynamoDbClient.Interface,
        private readonly doc: DynamoDBDocument,
        private readonly targetSk: string
    ) {}

    public scan<T extends SourceDynamoDbClient.Record>(tableName: string, options?: SourceDynamoDbClient.Scan) {
        return this.inner.scan<T>(tableName, options);
    }
    public query<T extends SourceDynamoDbClient.Record>(t: string, pk: string, sk?: string, o?: SourceDynamoDbClient.Query) {
        return this.inner.query<T>(t, pk, sk, o);
    }
    public queryAll<T extends SourceDynamoDbClient.Record>(t: string, pk: string, sk?: string, o?: SourceDynamoDbClient.Query) {
        return this.inner.queryAll<T>(t, pk, sk, o);
    }
    public get<T extends SourceDynamoDbClient.Record>(t: string, pk: string, sk: string) {
        return this.inner.get<T>(t, pk, sk);
    }
    public batchPut<T extends SourceDynamoDbClient.Record>(t: string, records: T[]) {
        return this.inner.batchPut(t, records);
    }
    public async updateAttribute(tableName: string, request: SourceDynamoDbClient.UpdateRequest) {
        if (request.key.SK === this.targetSk) {
            await this.doc.update({
                TableName: tableName,
                Key: request.key,
                UpdateExpression: "SET #md = :md",
                ExpressionAttributeNames: { "#md": "_md" },
                ExpressionAttributeValues: { ":md": "2026-09-04T00:00:00.000Z" }
            });
        }
        return this.inner.updateAttribute(tableName, request);
    }
}

describe("DdbLiveFieldRunner against dynalite", () => {
    let instance: DynaliteInstance;
    let doc: DynamoDBDocument;
    let client: DynamoDbClientImpl;

    beforeAll(async () => {
        instance = await startDynalite();
        doc = DynamoDBDocument.from(
            new DynamoDBClient({ endpoint: instance.endpoint, region: "us-east-1", credentials: FAKE_CREDS })
        );
        await createTable(doc, TABLE);
        for (const item of SEED) {
            await doc.put({ TableName: TABLE, Item: item });
        }
        client = new DynamoDbClientImpl(
            { region: "us-east-1", credentials: FAKE_CREDS, endpoint: instance.endpoint },
            new NoopLogger()
        );
    });

    afterAll(async () => {
        await instance.stop();
    });

    function run(mode: LiveFieldRunner.Mode, useClient: SourceDynamoDbClient.Interface = client) {
        const report = new MockChangeReport();
        return createFixLiveContainer()
            .resolve(DdbLiveFieldRunner)
            .run({
                mode,
                target: { client: useClient, tableName: TABLE, segments: 2 },
                report,
                onProgress: () => {}
            })
            .then(stats => ({ stats, report }));
    }

    it("dry run reports 4 changes and leaves the table unchanged", async () => {
        const before = await scanAll(doc, TABLE);
        const { stats, report } = await run("dry-run");

        expect(stats.scanned).toBe(2);
        expect(stats.entries).toBe(2);
        expect(stats.changes["missing-live"]).toBe(3);
        expect(stats.changes["stale-live"]).toBe(1);
        expect(report.changes.map(c => c.result)).toEqual(["dry-run", "dry-run", "dry-run", "dry-run"]);
        expect(await scanAll(doc, TABLE)).toEqual(before);
    });

    it("live run writes data.live only and keeps an empty string byte-identical", async () => {
        const { stats } = await run("live");

        expect(stats.written).toBe(4);
        expect(stats.conditionFailed).toBe(0);
        const rows = await scanAll(doc, TABLE);
        const data = (pk: string, sk: string) => rows.find(r => r.PK === pk && r.SK === sk)!.data;
        expect(data(PK_A, "L").live).toEqual({ version: 2 });
        expect(data(PK_A, "P").live).toEqual({ version: 2 });
        expect(data(PK_A, "REV#0002").live).toEqual({ version: 2 });
        expect(data(PK_A, "REV#0003").live).toBeUndefined();
        expect(data(PK_B, "L").live).toBeNull();
        expect((data(PK_A, "L").values as Record<string, unknown>).emptyString).toBe("");
        expect(rows.every(r => r._md === "2026-01-01T00:00:00.000Z")).toBe(true);

        const again = await run("dry-run");
        expect(again.report.changes).toEqual([]);
    });

    it("a record whose _md changed between read and write is reported as changed-during-run", async () => {
        await doc.update({
            TableName: TABLE,
            Key: { PK: PK_A, SK: "P" },
            UpdateExpression: "SET #d.#l = :empty",
            ExpressionAttributeNames: { "#d": "data", "#l": "live" },
            ExpressionAttributeValues: { ":empty": {} }
        });

        const { stats, report } = await run("live", new MdBumpingClient(client, doc, "P"));

        expect(stats.changes["empty-live"]).toBe(1);
        expect(stats.written).toBe(0);
        expect(stats.conditionFailed).toBe(1);
        expect(report.skips).toContainEqual({
            table: "ddb",
            pk: PK_A,
            sk: "P",
            reason: "changed-during-run",
            detail: undefined
        });
    });
});
```

- [ ] **Step 2: Verify**

```bash
yarn vitest run __tests__/integration/fixLive.ddbRunner.test.ts
```

---

### Task 9: `OsLiveFieldRunner` + unit test

**Files:**
- Create: `src/features/FixLive/OsLiveFieldRunner.ts`
- Modify: `src/features/FixLive/feature.ts`
- Test: `__tests__/features/FixLive/OsLiveFieldRunner.test.ts`

**Interfaces:**
- Consumes: `OsRecordDecompressor.Interface`, `CompressionHandler.Interface`.
- Produces: `OsLiveFieldRunner` token bound; writes `path: ["data"]` with the recompressed blob.

- [ ] **Step 1: Failing unit test**

```typescript
import { describe, it, expect } from "vitest";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { OsLiveFieldRunner } from "~/features/FixLive/index.js";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { createFixLiveContainer } from "./fixLiveContainer.ts";
import { MockChangeReport } from "./MockChangeReport.ts";

const TABLE = "v6-os";
const PK = "T#root#L#en-US#CMS#CME#a";
const INDEX = "root-headless-cms-en-us-blogpost";

describe("OsLiveFieldRunner", () => {
    it("decompresses, decides, and rewrites only live inside the blob", async () => {
        const container = createFixLiveContainer();
        const compression = container.resolve(CompressionHandler);
        const latestInner = { modelId: "blogPost", version: 3, status: "draft", live: {}, values: { a: "" } };
        const publishedInner = { modelId: "blogPost", version: 2, status: "published", live: { version: 2 } };
        const client = new MockDynamoDbClient({
            [TABLE]: [
                { PK, SK: "L", index: INDEX, data: await compression.compress(latestInner), _md: "md-1" },
                { PK, SK: "P", index: INDEX, data: await compression.compress(publishedInner), _md: "md-1" },
                {
                    PK: "T#root#L#en-US#CMS#CME#file",
                    SK: "L",
                    index: "root-headless-cms-en-us-fmfile",
                    data: await compression.compress({ modelId: "fmFile", version: 1, status: "draft" }),
                    _md: "md-1"
                },
                {
                    PK: "T#root#L#en-US#CMS#CME#corrupt",
                    SK: "L",
                    index: INDEX,
                    data: { compression: "gzip", value: "not-gzip" },
                    _md: "md-1"
                }
            ]
        });
        const report = new MockChangeReport();

        const stats = await container.resolve(OsLiveFieldRunner).run({
            mode: "live",
            target: { client, tableName: TABLE, segments: 1 },
            report,
            onProgress: () => {}
        });

        expect(stats.scanned).toBe(3);
        expect(stats.entries).toBe(2);
        expect(stats.changes["empty-live"]).toBe(1);
        expect(stats.skips["decompress-failed"]).toBe(1);
        expect(stats.written).toBe(1);

        const call = client.updateCalls[0]!;
        expect(call.request.key).toEqual({ PK, SK: "L" });
        expect(call.request.path).toEqual(["data"]);
        expect(call.request.condition).toEqual({ attribute: "_md", equals: "md-1" });
        const rewritten = await compression.decompress<Record<string, unknown>>(call.request.value);
        expect(rewritten).toEqual({ ...latestInner, live: { version: 2 } });
        expect(report.changes[0]).toMatchObject({ table: "os", sk: "L", reason: "empty-live", before: {} });
    });
});
```

- [ ] **Step 2: Implement**

`src/features/FixLive/OsLiveFieldRunner.ts`:

```typescript
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { OsLiveFieldRunner as OsLiveFieldRunnerAbstraction } from "./abstractions/LiveFieldRunner.ts";
import { LiveFieldReconciler } from "./abstractions/LiveFieldReconciler.ts";
import { OsRecordDecompressor } from "~/features/OsRecordDecompressor/abstractions/OsRecordDecompressor.js";
import { Logger } from "~/tools/Logger/abstractions/Logger.js";
import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";
import { BaseLiveFieldRunner, type AttributeWrite, type GroupPreparation } from "./BaseLiveFieldRunner.ts";
import { isInternalModel } from "./cmsEntryGuards.ts";

export type { ILiveFieldRunner } from "./abstractions/LiveFieldRunner.js";

const LATEST_SK = "L";

class OsLiveFieldRunnerImpl extends BaseLiveFieldRunner {
    protected readonly table: LiveFieldReconciler.Table = "os";

    public constructor(
        reconciler: LiveFieldReconciler.Interface,
        logger: Logger.Interface,
        private readonly decompressor: OsRecordDecompressor.Interface,
        private readonly compression: CompressionHandler.Interface
    ) {
        super(reconciler, logger);
    }

    /** modelId lives inside the blob — the internal-model check happens after decompression. */
    protected acceptsRow(_row: DatabaseRecord): boolean {
        return true;
    }

    protected async prepareGroup(_pk: string, rows: DatabaseRecord[]): Promise<GroupPreparation> {
        const records = new Map<string, LiveFieldReconciler.Record>();
        for (const row of rows) {
            const data = await this.decompressRow(row);
            if (data === null) {
                return { kind: "skipped", reason: "decompress-failed", detail: `SK=${row.SK}` };
            }
            records.set(row.SK, {
                ...row,
                _md: typeof row._md === "string" ? row._md : "",
                data
            });
        }
        const latest = records.get(LATEST_SK);
        if (latest && isInternalModel(latest.data.modelId)) {
            return { kind: "ignored" };
        }
        return { kind: "ready", records };
    }

    /**
     * The whole blob is one attribute, so it is replaced as a unit. Its
     * decompressed content differs from what was read only in `live`.
     */
    protected async buildWrite(
        change: LiveFieldReconciler.Change,
        record: LiveFieldReconciler.Record
    ): Promise<AttributeWrite> {
        const data = { ...record.data, live: change.after };
        const compressed = await this.compression.compress(data);
        return { path: ["data"], value: compressed };
    }

    private async decompressRow(row: DatabaseRecord): Promise<Record<string, unknown> | null> {
        try {
            return await this.decompressor.decompress(row as OsRecordDecompressor.Compressed);
        } catch (error) {
            this.logger.warn(`fix-live[os]: failed to decompress ${row.PK} ${row.SK}: ${String(error)}`);
            return null;
        }
    }
}

export const OsLiveFieldRunner = OsLiveFieldRunnerAbstraction.createImplementation({
    implementation: OsLiveFieldRunnerImpl,
    dependencies: [LiveFieldReconciler, Logger, OsRecordDecompressor, CompressionHandler]
});
```

`feature.ts`: add `import { OsLiveFieldRunner } from "./OsLiveFieldRunner.ts";` and `container.register(OsLiveFieldRunner).inSingletonScope();`. Final `feature.ts` registers, in order: `LiveFieldReconciler`, `ChangeReport`, `FixLiveState`, `DdbLiveFieldRunner`, `OsLiveFieldRunner`.

- [ ] **Step 3: Verify**

```bash
yarn vitest run __tests__/features/FixLive && yarn ts-check && yarn lint
```

---

### Task 10: `OsLiveFieldRunner` dynalite integration test

**Files:**
- Test: `__tests__/integration/fixLive.osRunner.test.ts`

**Interfaces:**
- Consumes: same harness as Task 8 plus `CompressionHandler` resolved from `createFixLiveContainer()`.

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { DynamoDbClientImpl } from "~/services/DynamoDbClient/DynamoDbClient.js";
import { OsLiveFieldRunner } from "~/features/FixLive/index.js";
import type { LiveFieldRunner } from "~/features/FixLive/abstractions/LiveFieldRunner.js";
import { startDynalite, waitForTableActive, type DynaliteInstance } from "./dynalite.ts";
import { NoopLogger } from "../helpers/NoopLogger.ts";
import { createFixLiveContainer } from "../features/FixLive/fixLiveContainer.ts";
import { MockChangeReport } from "../features/FixLive/MockChangeReport.ts";

const FAKE_CREDS = { accessKeyId: "test", secretAccessKey: "test" };
const TABLE = "fix-live-os";
const PK = "T#root#L#en-US#CMS#CME#a";
const INDEX = "root-headless-cms-en-us-blogpost";
const MD = "2026-01-01T00:00:00.000Z";

interface OsRow {
    PK: string;
    SK: string;
    index: string;
    data: unknown;
    _ct: string;
    _et: string;
    _md: string;
}

const LATEST_INNER = { modelId: "blogPost", version: 3, status: "draft", live: {}, values: { s: "" } };
const PUBLISHED_INNER = { modelId: "blogPost", version: 2, status: "published", live: { version: 2 } };

describe("OsLiveFieldRunner against dynalite", () => {
    let instance: DynaliteInstance;
    let doc: DynamoDBDocument;
    let client: DynamoDbClientImpl;
    const container = createFixLiveContainer();
    const compression = container.resolve(CompressionHandler);

    beforeAll(async () => {
        instance = await startDynalite();
        doc = DynamoDBDocument.from(
            new DynamoDBClient({ endpoint: instance.endpoint, region: "us-east-1", credentials: FAKE_CREDS })
        );
        await doc.send(
            new CreateTableCommand({
                TableName: TABLE,
                BillingMode: "PAY_PER_REQUEST",
                AttributeDefinitions: [
                    { AttributeName: "PK", AttributeType: "S" },
                    { AttributeName: "SK", AttributeType: "S" }
                ],
                KeySchema: [
                    { AttributeName: "PK", KeyType: "HASH" },
                    { AttributeName: "SK", KeyType: "RANGE" }
                ]
            })
        );
        await waitForTableActive(doc, TABLE);
        const rows: OsRow[] = [
            { PK, SK: "L", index: INDEX, data: await compression.compress(LATEST_INNER), _ct: MD, _et: "CmsEntriesElasticsearch", _md: MD },
            { PK, SK: "P", index: INDEX, data: await compression.compress(PUBLISHED_INNER), _ct: MD, _et: "CmsEntriesElasticsearch", _md: MD }
        ];
        for (const item of rows) {
            await doc.put({ TableName: TABLE, Item: item });
        }
        client = new DynamoDbClientImpl(
            { region: "us-east-1", credentials: FAKE_CREDS, endpoint: instance.endpoint },
            new NoopLogger()
        );
    });

    afterAll(async () => {
        await instance.stop();
    });

    function run(mode: LiveFieldRunner.Mode) {
        const report = new MockChangeReport();
        return container
            .resolve(OsLiveFieldRunner)
            .run({ mode, target: { client, tableName: TABLE, segments: 1 }, report, onProgress: () => {} })
            .then(stats => ({ stats, report }));
    }

    async function readRows(): Promise<OsRow[]> {
        const response = await doc.send(new ScanCommand({ TableName: TABLE }));
        return (response.Items ?? []) as OsRow[];
    }

    it("dry run reports empty-live on L and changes nothing", async () => {
        const before = await readRows();
        const { stats, report } = await run("dry-run");

        expect(stats.entries).toBe(1);
        expect(stats.changes["empty-live"]).toBe(1);
        expect(report.changes).toEqual([
            expect.objectContaining({ table: "os", sk: "L", reason: "empty-live", before: {}, after: { version: 2 }, result: "dry-run" })
        ]);
        expect(await readRows()).toEqual(before);
    });

    it("live run rewrites the L blob with only live changed and leaves root attributes alone", async () => {
        const { stats } = await run("live");

        expect(stats.written).toBe(1);
        const rows = await readRows();
        const latest = rows.find(r => r.SK === "L")!;
        const decompressed = await compression.decompress<Record<string, unknown>>(latest.data);
        expect(decompressed).toEqual({ ...LATEST_INNER, live: { version: 2 } });
        expect(latest._md).toBe(MD);
        expect(latest.index).toBe(INDEX);
        expect(rows.find(r => r.SK === "P")!.data).toEqual(await compression.compress(PUBLISHED_INNER));

        const again = await run("dry-run");
        expect(again.report.changes).toEqual([]);
    });
});
```

Note: the `P` blob equality assertion holds because gzip output is deterministic for identical input on one platform and the runner never rewrites `P` here (it was already correct).

- [ ] **Step 2: Verify**

```bash
yarn vitest run __tests__/integration/fixLive.osRunner.test.ts
```

---

### Task 11: Full verification

**Files:**
- No new files. Fix whatever the checks surface.

- [ ] **Step 1: Run the full check set**

```bash
yarn npm audit && yarn format:fix && yarn ts-check && yarn test:coverage && yarn lint && yarn check:imports
```

Expect: no audit suggestions, 0 type errors, all tests green with coverage thresholds met, 0 lint errors, 0 import errors.

- [ ] **Step 2: Confirm the golden is untouched and the public API is unchanged**

```bash
git status --short __tests__/data src/index.ts
```

Neither `__tests__/data/small-one.expected.json` nor `src/index.ts` may appear.

- [ ] **Step 3: Review `git status`**

Expected changed/added: `src/features/OsProcessor/OsProcessor.ts`, `src/transformers/cms/addLiveField.ts`, `src/services/DynamoDbClient/**`, `src/tools/FileTool/**`, `src/features/FixLive/**`, `src/bootstrap.ts`, `docs/hard-won-decisions.md`, `.changeset/fix-live-field-os-lane.md`, and the tests listed per task. Commit only when asked; the sibling plan (command menu, `FixLiveCommand`, v6 guard step, guides) builds on the `DdbLiveFieldRunner` / `OsLiveFieldRunner` / `ChangeReport` / `FixLiveState` tokens defined in Task 4.
