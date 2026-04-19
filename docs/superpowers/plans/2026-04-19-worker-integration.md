# Worker Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-enable `yarn transfer --config=...` end-to-end by adding a shard-slice API to `PipelineRunner` and real implementations for `processSegment` + `processOsSegment` worker handlers.

**Architecture:** `PipelineRunner.run` gains an optional `RunOptions { segment, totalSegments }` param. When given, the runner validates against `scanner.listShards()`, then processes only that shard via existing internals. A new `getProcessors()` method lets worker handlers retrieve per-shard state after the run. Worker handlers become thin: load config → bootstrap → configure preset → `runner.run({segment, total})` → write state file (OS only) → exit. Orchestrator switches to `Promise.allSettled` and runs after-hooks best-effort on partial failure.

**Tech Stack:** TypeScript strict, vitest, `@webiny/di`, `execa` (orchestrator only, untouched), `node:fs/promises`.

**Reference spec:** `docs/superpowers/specs/2026-04-19-worker-integration-design.md`.

---

## File structure

### Create

| Path | Responsibility |
|---|---|
| `__tests__/features/PipelineRunner/PipelineRunner.shard.test.ts` | Unit tests for `run({segment, totalSegments})` — happy path, mismatch guard, multi-merge-group guard. |
| `__tests__/features/PipelineRunner/PipelineRunner.getProcessors.test.ts` | Unit tests for `getProcessors()` — dedup-by-instance, empty-when-unregistered. |
| `__tests__/commands/processSegment.test.ts` | Handler unit tests (DDB) — mocked bootstrap/loadConfig/runner. |
| `__tests__/commands/processOsSegment.test.ts` | Handler unit tests (OS) — mocked deps + `<segment>-indexes.json` write verification. |

### Modify

| Path | Change |
|---|---|
| `src/features/PipelineRunner/abstractions/PipelineRunner.ts` | Add `RunOptions` interface, change `run` signature to accept optional `RunOptions`, add `getProcessors()` signature. |
| `src/features/PipelineRunner/PipelineRunner.ts` | Implement `run(opts?)` shard-mode branch + multi-merge-group guard + scanner-shard-count guard; implement `getProcessors()`. |
| `src/commands/processSegment/handler.ts` | Replace throwing stub with real impl. |
| `src/commands/processOsSegment/handler.ts` | Replace throwing stub with real impl. Also writes `<segment>-indexes.json`. |
| `src/commands/run/handler.ts` | Swap `Promise.all` for `Promise.allSettled`; preserve after-hook run on partial failure; exit 1 if any worker rejected. |
| `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` | Add one `it` verifying `run({segment:0, totalSegments:1})` matches `run()` on single-shard scanner. |

---

### Task 1: Add `RunOptions` type + new method signatures to `IPipelineRunner`

**Files:**
- Modify: `src/features/PipelineRunner/abstractions/PipelineRunner.ts`

- [ ] **Step 1: Read the current abstraction file**

Open `src/features/PipelineRunner/abstractions/PipelineRunner.ts`. Current shape has `pipeline`, `register`, `run()` with no args. This task adds `RunOptions` + `getProcessors()` + changes `run` signature.

- [ ] **Step 2: Apply the new abstraction shape**

Replace the interior of the file with:

```typescript
import type { Abstraction } from "@webiny/di";
import { createAbstraction } from "~/base/index.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import type { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";

export interface PipelineRunnerFactoryInput<TRecord, TContext extends Processor.Context, TShard> {
    name: string;
    scanner: Abstraction<Scanner.Interface<TRecord, TShard>>;
    processor: Abstraction<Processor.Interface<TRecord, TContext>>;
}

export interface RunOptions {
    /** Zero-based index of the shard this runner invocation should process. */
    segment: number;
    /** Total number of shards. Must match the scanner's reported shard count. */
    totalSegments: number;
}

interface IPipelineRunner {
    pipeline<TRecord, TContext extends Processor.Context, TShard>(
        config: PipelineRunnerFactoryInput<TRecord, TContext, TShard>
    ): PipelineBuilder<TRecord, TContext, TShard>;

    register<TRecord, TContext extends Processor.Context, TShard>(
        pipeline: Pipeline<TRecord, TContext, TShard>
    ): this;

    run(opts?: RunOptions): Promise<void>;

    getProcessors(): Processor.Interface<unknown, Processor.Context>[];
}

export const PipelineRunner = createAbstraction<IPipelineRunner>("Core/PipelineRunner");

export namespace PipelineRunner {
    export type Interface = IPipelineRunner;
    export type FactoryInput<
        TRecord,
        TContext extends Processor.Context,
        TShard
    > = PipelineRunnerFactoryInput<TRecord, TContext, TShard>;
    export type Run = RunOptions;
}
```

- [ ] **Step 3: Verify type-check fails where expected**

Run: `yarn ts-check 2>&1 | grep "error TS" | head -5`
Expected: at least one error in `src/features/PipelineRunner/PipelineRunner.ts` — the impl doesn't yet implement `getProcessors` and doesn't accept `RunOptions`. This is expected; Task 2 + Task 3 fix it.

- [ ] **Step 4: Commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/features/PipelineRunner/abstractions/PipelineRunner.ts
git commit -m "feat(runner): add RunOptions + getProcessors to IPipelineRunner"
```

---

### Task 2: Implement `getProcessors()` on `PipelineRunnerImpl`

**Files:**
- Modify: `src/features/PipelineRunner/PipelineRunner.ts`
- Create: `__tests__/features/PipelineRunner/PipelineRunner.getProcessors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/PipelineRunner/PipelineRunner.getProcessors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Pipeline, createFilter } from "~/domain/pipeline/index.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";

type AnyPipeline = Pipeline<unknown, Processor.Context, unknown>;

function makeBuilder(runner: PipelineRunner.Interface, name: string) {
    return runner.pipeline<
        BaseRecord,
        DdbTransformContext.Interface<BaseRecord>,
        DdbScanner.Shard
    >({
        name,
        scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
        processor: Processor as Abstraction<
            Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
        >
    });
}

describe("PipelineRunner.getProcessors", () => {
    it("returns empty array when no pipelines registered", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);
        expect(runner.getProcessors()).toEqual([]);
    });

    it("returns one entry when pipelines share the same processor token", () => {
        const container = createDdbContainer();
        const runner = container.resolve(PipelineRunner);

        const b1 = makeBuilder(runner, "p1").filter(createFilter<BaseRecord>(() => true));
        const b2 = makeBuilder(runner, "p2").filter(createFilter<BaseRecord>(() => true));
        runner.register(b1.build() as unknown as AnyPipeline);
        runner.register(b2.build() as unknown as AnyPipeline);

        const processors = runner.getProcessors();
        expect(processors).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run the failing test**

Run: `yarn test __tests__/features/PipelineRunner/PipelineRunner.getProcessors.test.ts`
Expected: compile errors or test failure — `runner.getProcessors is not a function` (from Task 1's abstraction change the impl class doesn't yet implement this method).

- [ ] **Step 3: Add `getProcessors()` to the impl**

Open `src/features/PipelineRunner/PipelineRunner.ts`. Add the method inside the `PipelineRunnerImpl` class (after `register`):

```typescript
    public getProcessors(): Processor.Interface<unknown, Processor.Context>[] {
        const seen = new Set<Processor.Interface<unknown, Processor.Context>>();
        const processors: Processor.Interface<unknown, Processor.Context>[] = [];
        for (const pipelines of this.mergeGroups.values()) {
            for (const pipeline of pipelines) {
                const processor = this.container.resolve(pipeline.processorToken);
                if (!seen.has(processor)) {
                    seen.add(processor);
                    processors.push(processor);
                }
            }
        }
        return processors;
    }
```

- [ ] **Step 4: Run tests**

Run: `yarn test __tests__/features/PipelineRunner/PipelineRunner.getProcessors.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/features/PipelineRunner/PipelineRunner.ts __tests__/features/PipelineRunner/PipelineRunner.getProcessors.test.ts
git commit -m "feat(runner): getProcessors returns deduped processor instances"
```

---

### Task 3: Implement `run(opts?)` shard mode on `PipelineRunnerImpl`

**Files:**
- Modify: `src/features/PipelineRunner/PipelineRunner.ts`
- Create: `__tests__/features/PipelineRunner/PipelineRunner.shard.test.ts`

- [ ] **Step 1: Write the failing shard-mode test**

Create `__tests__/features/PipelineRunner/PipelineRunner.shard.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Abstraction } from "@webiny/di";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { Pipeline, createFilter } from "~/domain/pipeline/index.ts";
import { TargetDynamoDbClient } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.ts";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";

type AnyPipeline = Pipeline<unknown, Processor.Context, unknown>;

function makeRecord(pk: string, sk: string, type: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: type
    };
}

describe("PipelineRunner.run — shard mode", () => {
    it("processes only the requested shard when opts given", async () => {
        const records = Array.from({ length: 8 }, (_, i) =>
            makeRecord("T#root", `sk-${i}`, "test.record")
        );
        const container = createDdbContainer({
            sourceRecords: { "source-table": records },
            pipelineOverride: { segments: 4 }
        });
        const runner = container.resolve(PipelineRunner);

        const builder = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbScanner.Shard
        >({
            name: "shard-test",
            scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
            processor: Processor as Abstraction<
                Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
            >
        });
        builder.filter(createFilter<BaseRecord>(() => true));
        runner.register(builder.build() as unknown as AnyPipeline);

        await runner.run({ segment: 0, totalSegments: 4 });

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        // MockDynamoDbClient.scan distributes records by `i % totalSegments === segment`.
        // 8 records split into 4 shards → 2 records per shard.
        expect(targetDb.batchPutRecords).toHaveLength(2);
    });

    it("throws when scanner's listShards length mismatches totalSegments", async () => {
        const container = createDdbContainer({ pipelineOverride: { segments: 2 } });
        const runner = container.resolve(PipelineRunner);
        const builder = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbScanner.Shard
        >({
            name: "mismatch",
            scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
            processor: Processor as Abstraction<
                Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
            >
        });
        builder.filter(createFilter<BaseRecord>(() => true));
        runner.register(builder.build() as unknown as AnyPipeline);

        await expect(runner.run({ segment: 0, totalSegments: 4 })).rejects.toThrow(
            /scanner.*reported 2 shards.*totalSegments=4/i
        );
    });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `yarn test __tests__/features/PipelineRunner/PipelineRunner.shard.test.ts`
Expected: tests fail — `runner.run` currently accepts no args, so passing `{segment, totalSegments}` either compiles (TS 5+ ignores extras) and runs full-scan (returning ~8 records instead of 2), or throws a different error.

- [ ] **Step 3: Replace `run()` in the impl with shard-aware version**

Open `src/features/PipelineRunner/PipelineRunner.ts`. Replace the existing `run` method with:

```typescript
    public async run(opts?: RunOptions): Promise<void> {
        if (!opts) {
            for (const [scannerToken, pipelines] of this.mergeGroups) {
                await this.runMergeGroup(scannerToken, pipelines);
            }
            return;
        }

        if (this.mergeGroups.size > 1) {
            throw new Error(
                `PipelineRunner.run({...}): shard mode is only supported with a single ` +
                    `merge group; got ${this.mergeGroups.size}.`
            );
        }

        const entry = this.mergeGroups.entries().next();
        if (entry.done) {
            return;
        }
        const [scannerToken, pipelines] = entry.value;
        await this.runSingleShard(scannerToken, pipelines, opts);
    }

    private async runSingleShard(
        scannerToken: Abstraction<Scanner.Interface<unknown, unknown>>,
        pipelines: Pipeline<unknown, Processor.Context, unknown>[],
        opts: RunOptions
    ): Promise<void> {
        const scanner = this.container.resolve(scannerToken);
        const shards = await scanner.listShards();

        if (shards.length !== opts.totalSegments) {
            throw new Error(
                `PipelineRunner.run({segment, totalSegments}): scanner "${scannerToken.toString()}" ` +
                    `reported ${shards.length} shards but caller declared ` +
                    `totalSegments=${opts.totalSegments}.`
            );
        }

        const mergeGroupId = this.deriveMergeGroupId(scannerToken);

        const pipelineToProcessor: Map<
            Pipeline<unknown, Processor.Context, unknown>,
            Processor.Interface<unknown, Processor.Context>
        > = new Map();
        for (const pipeline of pipelines) {
            pipelineToProcessor.set(pipeline, this.container.resolve(pipeline.processorToken));
        }

        const shard = shards[opts.segment];
        await this.runShard(mergeGroupId, pipelines, scanner, shard, pipelineToProcessor);
    }
```

Also update the imports at the top of the file to include `RunOptions`:

```typescript
import {
    PipelineRunner as PipelineRunnerAbstraction,
    type PipelineRunnerFactoryInput,
    type RunOptions
} from "./abstractions/PipelineRunner.ts";
```

- [ ] **Step 4: Verify tests pass**

Run: `yarn test __tests__/features/PipelineRunner/PipelineRunner.shard.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Run full suite**

Run: `yarn test`
Expected: no regressions. All prior tests still green; suite count grew by 2 (this file) + 2 (Task 2) = +4.

- [ ] **Step 6: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/features/PipelineRunner/PipelineRunner.ts __tests__/features/PipelineRunner/PipelineRunner.shard.test.ts
git commit -m "feat(runner): run(opts?) processes a single shard when opts given"
```

---

### Task 4: Integration test addendum — shard mode equals full run on single-shard scanner

**Files:**
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`

- [ ] **Step 1: Add the new `it` block at the end of the describe**

Open `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`. Before the closing `});` of the outer `describe`, add:

```typescript
    it("run({segment:0, totalSegments:1}) on a single-shard scanner matches run()", async () => {
        const records = [
            makeRecord("tenant-1", "team-1", "security.team"),
            makeRecord("tenant-1", "team-2", "security.team")
        ];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const runner = container.resolve(PipelineRunner);

        const builder = runner.pipeline<
            BaseRecord,
            DdbTransformContext.Interface<BaseRecord>,
            DdbScanner.Shard
        >({
            name: "single-shard-shardmode",
            scanner: Scanner as Abstraction<Scanner.Interface<BaseRecord, DdbScanner.Shard>>,
            processor: Processor as Abstraction<
                Processor.Interface<BaseRecord, DdbTransformContext.Interface<BaseRecord>>
            >
        });
        builder.filter(createFilter<BaseRecord>(r => r.TYPE === "security.team"));
        runner.register(builder.build() as unknown as AnyPipeline);

        await runner.run({ segment: 0, totalSegments: 1 });

        const targetDb = container.resolve(TargetDynamoDbClient) as MockDynamoDbClient;
        expect(targetDb.batchPutRecords).toHaveLength(2);
    });
```

- [ ] **Step 2: Run the integration test file**

Run: `yarn test __tests__/features/PipelineRunner/PipelineRunner.integration.test.ts`
Expected: all prior tests + the new one pass.

- [ ] **Step 3: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add __tests__/features/PipelineRunner/PipelineRunner.integration.test.ts
git commit -m "test(runner): shard-mode equals full-run on single-shard scanner"
```

---

### Task 5: Implement `processSegment/handler.ts` (DDB worker)

**Files:**
- Modify: `src/commands/processSegment/handler.ts`
- Create: `__tests__/commands/processSegment.test.ts`

- [ ] **Step 1: Write the failing handler test**

Create `__tests__/commands/processSegment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const runSpy = vi.fn();
const getProcessorsSpy = vi.fn(() => []);
const loadSpy = vi.fn(async () => ({
    name: "test-preset",
    description: "test",
    configure(_runner: unknown): void {}
}));
const resolveMap = new Map<unknown, unknown>();

vi.mock("~/features/MigrationConfig/loadConfig.ts", () => ({
    loadConfig: vi.fn(async (_path: string) => ({ storage: "ddb", pipeline: { preset: "x" } }))
}));
vi.mock("~/bootstrap.ts", () => ({
    bootstrap: vi.fn(() => ({
        resolve: (token: unknown) => resolveMap.get(token),
        registerInstance: vi.fn()
    }))
}));

import { handler } from "~/commands/processSegment/handler.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";

describe("processSegment handler", () => {
    beforeEach(() => {
        runSpy.mockReset();
        getProcessorsSpy.mockReset().mockReturnValue([]);
        loadSpy.mockReset().mockResolvedValue({
            name: "test-preset",
            description: "test",
            configure(_runner: unknown): void {}
        });
        resolveMap.clear();
        resolveMap.set(Logger, { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) });
        resolveMap.set(PipelineRunner, { run: runSpy, getProcessors: getProcessorsSpy });
        resolveMap.set(PresetLoader, { load: loadSpy, getBuiltInPresets: () => [] });
    });

    it("loads preset, configures runner, calls run({segment, totalSegments})", async () => {
        await handler({ runId: "r1", segment: 2, total: 4, config: "./x.ts" });

        expect(loadSpy).toHaveBeenCalledWith("x");
        expect(runSpy).toHaveBeenCalledWith({ segment: 2, totalSegments: 4 });
    });

    it("re-throws on runner failure", async () => {
        runSpy.mockRejectedValueOnce(new Error("boom"));
        await expect(
            handler({ runId: "r1", segment: 0, total: 1, config: "./x.ts" })
        ).rejects.toThrow("boom");
    });
});
```

- [ ] **Step 2: Verify test fails**

Run: `yarn test __tests__/commands/processSegment.test.ts`
Expected: test fails — the current handler throws immediately.

- [ ] **Step 3: Replace the handler stub**

Replace the contents of `src/commands/processSegment/handler.ts` with:

```typescript
import { bootstrap } from "~/bootstrap.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";

export interface ProcessSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

export async function handler(argv: ProcessSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    const container = bootstrap({ config });
    container.registerInstance(TransferContext, { runId: argv.runId });

    const logger = container.resolve(Logger).child(`[segment ${argv.segment}]`);
    const runner = container.resolve(PipelineRunner);
    const presetLoader = container.resolve(PresetLoader);

    const preset = await presetLoader.load(config.pipeline.preset);
    preset.configure(runner);

    logger.info(`Processing shard ${argv.segment + 1}/${argv.total}...`);

    await runner.run({ segment: argv.segment, totalSegments: argv.total });

    logger.info("Shard complete.");
}
```

DDB handler writes NO state file — `DdbProcessor.getShardState()` returns `{}` and no existing hook reads DDB shard state.

- [ ] **Step 4: Verify the test passes**

Run: `yarn test __tests__/commands/processSegment.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/commands/processSegment/handler.ts __tests__/commands/processSegment.test.ts
git commit -m "feat(worker): processSegment handler — DDB shard processing"
```

---

### Task 6: Implement `processOsSegment/handler.ts` (OS worker)

**Files:**
- Modify: `src/commands/processOsSegment/handler.ts`
- Create: `__tests__/commands/processOsSegment.test.ts`

- [ ] **Step 1: Write the failing handler test**

Create `__tests__/commands/processOsSegment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const runSpy = vi.fn();
const touchedIndexesMap = new Map<string, string>();
const loadSpy = vi.fn(async () => ({
    name: "test-os-preset",
    description: "test",
    configure(_runner: unknown): void {}
}));
const resolveMap = new Map<unknown, unknown>();
const registerInstanceSpy = vi.fn();

vi.mock("~/features/MigrationConfig/loadConfig.ts", () => ({
    loadConfig: vi.fn(async (_path: string) => ({ storage: "os", pipeline: { preset: "x" } }))
}));
vi.mock("~/bootstrap.ts", () => ({
    bootstrap: vi.fn(() => ({
        resolve: (token: unknown) => resolveMap.get(token),
        registerInstance: registerInstanceSpy
    }))
}));

import { handler } from "~/commands/processOsSegment/handler.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";

describe("processOsSegment handler", () => {
    let originalCwd: string;
    let workDir: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "os-handler-"));
        process.chdir(workDir);

        runSpy.mockReset();
        touchedIndexesMap.clear();
        loadSpy.mockReset().mockResolvedValue({
            name: "test-os-preset",
            description: "test",
            configure(_runner: unknown): void {}
        });
        resolveMap.clear();
        resolveMap.set(Logger, {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
        });
        const fakeOsProcessor = {
            execute: vi.fn(),
            createContext: vi.fn(),
            getShardState: () => ({
                touchedIndexes: Object.fromEntries(touchedIndexesMap)
            })
        };
        resolveMap.set(PipelineRunner, {
            run: runSpy,
            getProcessors: () => [fakeOsProcessor]
        });
        resolveMap.set(PresetLoader, { load: loadSpy, getBuiltInPresets: () => [] });
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("writes <segment>-indexes.json after successful run", async () => {
        touchedIndexesMap.set("root-headless-cms-category", "1s");
        touchedIndexesMap.set("root-headless-cms-article", "5s");

        await handler({ runId: "r1", segment: 2, total: 4, config: "./x.ts" });

        const filePath = join(workDir, ".transfer", "r1", "2-indexes.json");
        const content = await readFile(filePath, "utf-8");
        const parsed = JSON.parse(content);
        expect(parsed).toEqual({
            "root-headless-cms-category": "1s",
            "root-headless-cms-article": "5s"
        });
    });

    it("writes empty indexes file when no indexes touched", async () => {
        await handler({ runId: "r2", segment: 0, total: 1, config: "./x.ts" });

        const filePath = join(workDir, ".transfer", "r2", "0-indexes.json");
        const content = await readFile(filePath, "utf-8");
        expect(JSON.parse(content)).toEqual({});
    });

    it("re-throws on runner failure", async () => {
        runSpy.mockRejectedValueOnce(new Error("scan fail"));
        await expect(
            handler({ runId: "r3", segment: 0, total: 1, config: "./x.ts" })
        ).rejects.toThrow("scan fail");
    });
});
```

- [ ] **Step 2: Verify test fails**

Run: `yarn test __tests__/commands/processOsSegment.test.ts`
Expected: test fails — current handler throws immediately.

- [ ] **Step 3: Replace the handler stub**

Replace the contents of `src/commands/processOsSegment/handler.ts` with:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bootstrap } from "~/bootstrap.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import type { OsProcessor } from "~/features/OsProcessor/abstractions/OsProcessor.ts";

export interface ProcessOsSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

interface OsShardStateShape {
    touchedIndexes: Record<string, string>;
}

export async function handler(argv: ProcessOsSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    const container = bootstrap({ config });
    container.registerInstance(TransferContext, { runId: argv.runId });

    const logger = container.resolve(Logger).child(`[segment ${argv.segment}]`);
    const runner = container.resolve(PipelineRunner);
    const presetLoader = container.resolve(PresetLoader);

    const preset = await presetLoader.load(config.pipeline.preset);
    preset.configure(runner);

    logger.info(`Processing shard ${argv.segment + 1}/${argv.total}...`);

    await runner.run({ segment: argv.segment, totalSegments: argv.total });

    // Collect touchedIndexes from the OS processor(s) and write the
    // <segment>-indexes.json file that EnableRefreshHook already reads.
    const processors = runner.getProcessors();
    const merged: Record<string, string> = {};
    for (const processor of processors) {
        const state = (processor as { getShardState(): OsShardStateShape }).getShardState();
        if (state && typeof state === "object" && "touchedIndexes" in state) {
            for (const [indexName, refresh] of Object.entries(state.touchedIndexes)) {
                if (!(indexName in merged)) {
                    merged[indexName] = refresh;
                }
            }
        }
    }

    const transferDir = join(process.cwd(), ".transfer", argv.runId);
    await mkdir(transferDir, { recursive: true });
    const stateFile = join(transferDir, `${argv.segment}-indexes.json`);
    await writeFile(stateFile, JSON.stringify(merged), "utf-8");

    logger.info("Shard complete.");
}
```

- [ ] **Step 4: Verify tests pass**

Run: `yarn test __tests__/commands/processOsSegment.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/commands/processOsSegment/handler.ts __tests__/commands/processOsSegment.test.ts
git commit -m "feat(worker): processOsSegment handler — OS shard + state file"
```

---

### Task 7: Orchestrator — Promise.allSettled + after-hook best-effort

**Files:**
- Modify: `src/commands/run/handler.ts`

- [ ] **Step 1: Open and understand the current handler**

Read `src/commands/run/handler.ts`. The relevant block is around lines 32-55 where workers are awaited and after-hooks run.

- [ ] **Step 2: Replace the workers-await block with allSettled + summary**

Find this existing block in the handler:

```typescript
        for (let segment = 0; segment < segments; segment++) {
            workers.push(spawnWorker(segment, segments, runId, configPath, workerCommand));
        }

        await Promise.all(workers);

        try {
            const afterHook = container.resolve(AfterTransferHook);
            logger.info("Running after-transfer hooks...");
            await afterHook.execute();
        } catch (error) {
            logger.error(
                `After-transfer hooks failed. Data transfer succeeded, but post-transfer actions may need manual intervention. Error: ${error}`
            );
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`Transfer completed successfully in ${duration}s`);
    } catch (error) {
        logger.error(`Transfer failed: ${error}`);
        process.exit(1);
    }
```

Replace with:

```typescript
        for (let segment = 0; segment < segments; segment++) {
            workers.push(spawnWorker(segment, segments, runId, configPath, workerCommand));
        }

        const results = await Promise.allSettled(workers);
        const failures: number[] = [];
        results.forEach((result, segment) => {
            if (result.status === "rejected") {
                failures.push(segment);
                logger.error(`Segment ${segment} failed: ${result.reason}`);
            }
        });
        logger.info(
            `${segments - failures.length} of ${segments} shards succeeded` +
                (failures.length > 0 ? ` (failed: ${failures.join(", ")})` : "")
        );

        try {
            const afterHook = container.resolve(AfterTransferHook);
            logger.info("Running after-transfer hooks...");
            await afterHook.execute();
        } catch (error) {
            logger.error(
                `After-transfer hooks failed. Data transfer state may need manual intervention. Error: ${error}`
            );
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        if (failures.length > 0) {
            logger.error(
                `Transfer completed with ${failures.length} failed shard(s) in ${duration}s`
            );
            process.exit(1);
        }
        logger.info(`Transfer completed successfully in ${duration}s`);
    } catch (error) {
        logger.error(`Transfer failed: ${error}`);
        process.exit(1);
    }
```

- [ ] **Step 3: Run full test suite**

Run: `yarn test`
Expected: no regressions. Run handler has no direct test today; spot-check: `yarn ts-check` passes.

- [ ] **Step 4: Format + commit**

```bash
yarn format:fix
git checkout -- src/presets/example.ts 2>/dev/null || true
git add src/commands/run/handler.ts
git commit -m "feat(run): Promise.allSettled + best-effort after-hook on partial failure"
```

---

### Task 8: Final verification

**Files:** none modified. No commit.

- [ ] **Step 1: Format check**

Run: `yarn format:fix`
Expected: `Finished in Xms on Y files using 10 threads.` — no surprise reformatting. Ignore/revert any `src/presets/example.ts` noise (shouldn't happen since that file was deleted in an earlier cleanup, but keep muscle memory).

- [ ] **Step 2: Type-check**

Run: `yarn ts-check 2>&1 | grep "error TS" | wc -l`
Expected: 0.

- [ ] **Step 3: Full test suite**

Run: `yarn test 2>&1 | grep -E "Test Files|Tests " | head -3`
Expected: Test Files 86 passed (86) | Tests 412 passed (412) — up ~9 from the post-cleanup baseline of 403 (2 shard tests + 2 getProcessors tests + 1 integration addendum + 2 processSegment tests + 3 processOsSegment tests = 10 new; but some may share overhead, so +9-10 range).

- [ ] **Step 4: Commit log review**

Run: `git log --oneline -10`
Expected: 7 new commits from this plan (Tasks 1-7) + the spec commit at the bottom. Task 8 adds no commit.

- [ ] **Step 5: Smoke the public-API surface**

Run: `grep -c "RunOptions\|getProcessors" src/index.ts`
Expected: `RunOptions` and `getProcessors` are NOT exported from `src/index.ts`. They're internal orchestration plumbing — the runner itself is not user-API (users go through `createDdbTransfer` + CLI). If either leaked into `src/index.ts`, remove.

- [ ] **Step 6: Confirm worker stubs are gone**

Run: `grep -l "temporarily disabled" src/commands/`
Expected: empty output. Neither handler references the stub message anymore.

---

## Summary of what this plan delivers

- `PipelineRunner.run(opts?)` — full-run unchanged, shard-mode added.
- `PipelineRunner.getProcessors()` — deduped processor set for worker introspection.
- `processSegment/handler.ts` — real DDB worker.
- `processOsSegment/handler.ts` — real OS worker with per-shard state file matching the existing `EnableRefreshHook` contract.
- `run/handler.ts` — `Promise.allSettled` + best-effort after-hook.
- +10 tests covering shard runner, getProcessors, integration passthrough, both handlers.

After this plan lands, `yarn transfer --config=...` actually runs end-to-end. `EnableRefreshHook` restores `refresh_interval` from unioned worker state. Pipeline-level merge-group hooks and multi-merge-group distributed runs stay as flagged follow-ups.
