# Periodic Shard Flush (flushEvery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound per-shard memory usage by flushing `processor.execute()` every N records instead of once at shard end.

**Architecture:** Add `flushEvery: number` to `tuningSchema`; inject `MigrationConfig` into `PipelineRunner`; replace the single shard-end `execute` drain with a periodic mid-shard flush triggered by a record counter, plus a final flush for the remainder. `afterShard` is unchanged — still fires once per shard after all flushes.

**Tech Stack:** Zod (schema), Vitest (tests), existing DI container wiring.

---

## Task 1: Add `flushEvery` to `tuningSchema`

**Files:**
- Modify: `src/features/MigrationConfig/schemas/shared.schema.ts`
- Test: `__tests__/features/MigrationConfig/createConfig.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block to `__tests__/features/MigrationConfig/createConfig.test.ts`:

```typescript
describe("createConfig — tuning.flushEvery", () => {
    it("accepts a positive integer", () => {
        const config = createConfig({
            source: baseSource,
            target: baseTarget,
            pipeline: {},
            tuning: { flushEvery: 100 }
        });
        expect(config.tuning?.flushEvery).toBe(100);
    });

    it("rejects 0 (not positive)", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: baseTarget,
                pipeline: {},
                tuning: { flushEvery: 0 }
            })
        ).toThrow();
    });

    it("rejects -1 (negative)", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: baseTarget,
                pipeline: {},
                tuning: { flushEvery: -1 }
            })
        ).toThrow();
    });

    it("rejects 1.5 (non-integer)", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: baseTarget,
                pipeline: {},
                tuning: { flushEvery: 1.5 }
            })
        ).toThrow();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test __tests__/features/MigrationConfig/createConfig.test.ts
```

Expected: the 4 new tests fail (unknown field / no validation yet).

- [ ] **Step 3: Add `flushEvery` to `tuningSchema`**

In `src/features/MigrationConfig/schemas/shared.schema.ts`, add `flushEvery` as the first field of `tuningSchema`:

```typescript
export const tuningSchema = z
    .object({
        flushEvery: z.number().int().positive().optional(),
        ddb: z
            .object({
                maxRetries: z.number().int().nonnegative().optional(),
                initialBackoffMs: z.number().int().nonnegative().optional(),
                requestTimeoutMs: z.number().int().positive().optional()
            })
            .optional(),
        s3: z
            .object({
                concurrency: z.number().int().positive().optional(),
                maxRetries: z.number().int().nonnegative().optional(),
                initialBackoffMs: z.number().int().nonnegative().optional(),
                requestTimeoutMs: z.number().int().positive().optional()
            })
            .optional(),
        os: z
            .object({
                maxRetries: z.number().int().nonnegative().optional(),
                retryScheduleMs: z.array(z.number().int().nonnegative()).optional(),
                gzipConcurrency: z.number().int().positive().optional()
            })
            .optional()
    })
    .optional();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test __tests__/features/MigrationConfig/createConfig.test.ts
```

Expected: all tests pass including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/features/MigrationConfig/schemas/shared.schema.ts \
        __tests__/features/MigrationConfig/createConfig.test.ts
git commit -m "feat: add tuning.flushEvery to schema"
```

---

## Task 2: Wire `MigrationConfig` into `PipelineRunner` + periodic flush

**Files:**
- Modify: `src/features/PipelineRunner/PipelineRunner.ts`
- Modify: `__tests__/features/PipelineRunner/PipelineRunner.test.ts`

- [ ] **Step 1: Write the failing tests**

In `__tests__/features/PipelineRunner/PipelineRunner.test.ts`, make two changes:

**2a. Add the `MigrationConfig` import** at the top of the file alongside the other imports:

```typescript
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
```

**2b. Update `makeContainer`** to accept `flushEvery` and register `MigrationConfig`:

Replace the existing signature and body:

```typescript
function makeContainer(options: { runId?: string; flushEvery?: number } = {}): {
    container: Container;
    logger: TestLogger;
} {
    const container = new Container();
    const logger = new TestLogger();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(Logger, logger);
    container.registerInstance(TransferContext, { runId: options.runId ?? "test-run-id" });
    container.registerInstance(BaseTransformContextFactory, new FakeBaseContextFactory());
    container.registerInstance(SnapshotWriter, {
        async write(): Promise<void> {},
        async close(): Promise<void> {}
    });
    container.registerInstance(DroppedRecordLog, new MockDroppedRecordLog());
    container.registerInstance(TransferredRecordLog, new MockTransferredRecordLog());
    container.registerInstance(
        MigrationConfig,
        {
            tuning:
                options.flushEvery !== undefined ? { flushEvery: options.flushEvery } : undefined
        } as unknown as MigrationConfig.Interface
    );
    container.register(FakeScannerImpl).inSingletonScope();
    container.register(FakeProcessorImpl).inSingletonScope();
    container.register(FakeHookAImpl).inSingletonScope();
    container.register(FakeHookBImpl).inSingletonScope();
    PipelineBuilderFactoryFeature.register(container);
    PipelineRunnerFeature.register(container);
    return { container, logger };
}
```

**2c. Add the new flush describe block** after the existing `describe("PipelineRunner.run()", ...)` block:

```typescript
describe("PipelineRunner — periodic flush (flushEvery)", () => {
    it("flushes mid-shard every flushEvery records", async () => {
        const { container } = makeContainer({ flushEvery: 2 });
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" },
            { id: "r3", type: "foo" },
            { id: "r4", type: "foo" },
            { id: "r5", type: "foo" }
        ];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "flush-mid-shard"));
        await runner.run();

        // flushEvery=2, 5 records: flush at 2, flush at 4, final flush at 5
        expect(processor.executed).toHaveLength(3);
        expect(processor.executed[0]?.size()).toBe(2);
        expect(processor.executed[1]?.size()).toBe(2);
        expect(processor.executed[2]?.size()).toBe(1);
    });

    it("flushes exactly N/flushEvery times when count is divisible", async () => {
        const { container } = makeContainer({ flushEvery: 2 });
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" },
            { id: "r3", type: "foo" },
            { id: "r4", type: "foo" }
        ];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "flush-divisible"));
        await runner.run();

        // flushEvery=2, 4 records: flush at 2, flush at 4, no remainder
        expect(processor.executed).toHaveLength(2);
        expect(processor.executed[0]?.size()).toBe(2);
        expect(processor.executed[1]?.size()).toBe(2);
    });

    it("no record loss across flush boundaries", async () => {
        const { container } = makeContainer({ flushEvery: 2 });
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" },
            { id: "r3", type: "foo" }
        ];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "flush-no-loss"));
        await runner.run();

        const totalCommands = processor.executed.reduce((sum, c) => sum + c.size(), 0);
        expect(totalCommands).toBe(3);
    });

    it("afterShard fires exactly once regardless of flush count", async () => {
        const { container } = makeContainer({ flushEvery: 2 });
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" },
            { id: "r3", type: "foo" },
            { id: "r4", type: "foo" },
            { id: "r5", type: "foo" }
        ];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "flush-aftershard"));
        await runner.run();

        expect(processor.afterShardCalls).toHaveLength(1);
        expect(processor.afterShardCalls[0]).toEqual({ segment: 0, totalSegments: 1 });
    });

    it("without flushEvery set, uses a single shard-end flush (default 500 > record count)", async () => {
        const { container } = makeContainer(); // no flushEvery → default 500
        const scanner = container.resolve(Scanner) as FakeScanner;
        const processor = container.resolve(Processor) as FakeProcessor;
        scanner.records = [
            { id: "r1", type: "foo" },
            { id: "r2", type: "foo" }
        ];

        const runner = container.resolve(PipelineRunner);
        runner.register(buildPipeline(container, "flush-default"));
        await runner.run();

        // 2 records < 500 default → single execute call at shard end
        expect(processor.executed).toHaveLength(1);
        expect(processor.executed[0]?.size()).toBe(2);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test __tests__/features/PipelineRunner/PipelineRunner.test.ts
```

Expected: the 5 new tests fail (MigrationConfig not injected yet, no flush logic yet). Existing tests may also fail with a DI error about unresolved `MigrationConfig` — that's expected.

- [ ] **Step 3: Add `MigrationConfig` dependency to `PipelineRunnerImpl`**

In `src/features/PipelineRunner/PipelineRunner.ts`:

Add the import at the top:
```typescript
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
```

Add `config` as the second constructor parameter (after `container`):
```typescript
public constructor(
    private readonly container: Container,
    private readonly config: MigrationConfig.Interface,
    private readonly logger: Logger.Interface,
    private readonly transferContext: TransferContext.Interface,
    private readonly baseContextFactory: BaseTransformContextFactory.Interface,
    private readonly snapshotWriter: SnapshotWriter.Interface,
    private readonly droppedLog: DroppedRecordLog.Interface,
    private readonly transferredLog: TransferredRecordLog.Interface
) {}
```

Update the `dependencies` array at the bottom of the file:
```typescript
export const PipelineRunner = PipelineRunnerAbstraction.createImplementation({
    implementation: PipelineRunnerImpl,
    dependencies: [
        ContainerToken,
        MigrationConfig,
        Logger,
        TransferContext,
        BaseTransformContextFactory,
        SnapshotWriter,
        DroppedRecordLog,
        TransferredRecordLog
    ]
});
```

- [ ] **Step 4: Add `flushShard` helper and rewrite `runShard`**

Replace the `runShard` method body and add `flushShard` after the `runShard` closing brace. The full replacement for `runShard` (currently lines 240–346):

```typescript
private async runShard(params: RunShardParams): Promise<ShardStats> {
    const { mergeGroupId, pipelines, scanner, shard, pipelineProcessors, shardCtx } = params;

    const flushEvery = this.config.tuning?.flushEvery ?? 500;
    const processorOrder = this.collectProcessorOrder(pipelines, pipelineProcessors);
    let pendingCommands = new Commands();
    let recordCount = 0;

    const perPipelineTransferred: Map<string, number> = new Map();
    const perPipelineBlackholed: Map<string, number> = new Map();
    const unmatchedByType: Map<string, number> = new Map();

    for await (const record of scanner.scan(shard)) {
        let matched = false;
        for (const pipeline of pipelines) {
            if (!pipeline.accepts(record)) {
                continue;
            }
            matched = true;
            const processors = pipelineProcessors.get(pipeline)!;
            await this.snapshotWriter.write(
                `${pipeline.name}/segment-${shardCtx.segment}.source.jsonl`,
                record
            );
            const result = await this.runRecord(
                pipeline,
                processors,
                record,
                pendingCommands,
                shardCtx
            );
            if (result instanceof RecordDisposition.Blackholed) {
                this.droppedLog.add(record, result);
                perPipelineBlackholed.set(
                    pipeline.name,
                    (perPipelineBlackholed.get(pipeline.name) ?? 0) + 1
                );
            } else {
                perPipelineTransferred.set(
                    pipeline.name,
                    (perPipelineTransferred.get(pipeline.name) ?? 0) + 1
                );
                this.transferredLog.add(record, pipeline.name);
            }
            break;
        }
        if (!matched) {
            const { PK, SK, TYPE } = record as any;
            const typeKey: string = TYPE && TYPE !== "unknown" ? TYPE : `${PK}:${SK}`;
            unmatchedByType.set(typeKey, (unmatchedByType.get(typeKey) ?? 0) + 1);
            this.logger.warn(`unmatched record — TYPE=${typeKey} PK=${PK} SK=${SK}`);
            await this.snapshotWriter.write(
                `dropped/segment-${shardCtx.segment}.jsonl`,
                record
            );
            this.droppedLog.add(record, new RecordDisposition.Unmatched());
        }

        recordCount++;
        if (recordCount % flushEvery === 0) {
            await this.flushShard(pendingCommands, processorOrder);
            pendingCommands = new Commands();
        }
    }

    this.logShardSummary(
        mergeGroupId,
        shardCtx,
        perPipelineTransferred,
        perPipelineBlackholed,
        unmatchedByType
    );

    if (pendingCommands.size() > 0) {
        await this.flushShard(pendingCommands, processorOrder);
    }

    for (const processor of processorOrder) {
        if (!processor.afterShard) {
            continue;
        }
        await processor.afterShard(shardCtx);
    }

    this.droppedLog.flush(shardCtx.segment);
    this.transferredLog.flush(shardCtx.segment);

    return {
        transferred: perPipelineTransferred,
        blackholed: perPipelineBlackholed,
        unmatched: unmatchedByType
    };
}

private async flushShard(commands: Commands, processors: ProcessorInstance[]): Promise<void> {
    for (const processor of processors) {
        await processor.execute(commands);
    }
    this.warnUnclaimedKeys(commands);
}
```

Also delete the old `collectProcessorOrder` call that was at lines 322–325 (it is now at the top of `runShard`) and the old `warnUnclaimedKeys(shardCommands)` call at line 337 (now inside `flushShard`).

- [ ] **Step 5: Run tests to verify they pass**

```bash
yarn test __tests__/features/PipelineRunner/PipelineRunner.test.ts
```

Expected: all tests pass — the 5 new flush tests plus all pre-existing runner tests.

- [ ] **Step 6: Run the full test suite**

```bash
yarn test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/PipelineRunner/PipelineRunner.ts \
        __tests__/features/PipelineRunner/PipelineRunner.test.ts
git commit -m "feat: periodic shard flush via tuning.flushEvery"
```

---

## Task 3: Wire `FLUSH_EVERY` in config templates

**Files:**
- Modify: `templates/projects/example/config.ts`
- Modify: `templates/internal-project/config.ts`
- Modify: `templates/projects/example/.env.example`
- Modify: `templates/internal-project/.env.example`

No tests — templates are scaffolding, not executed by the test suite.

- [ ] **Step 1: Update `templates/projects/example/config.ts`**

Add a `tuning` section after `pipeline`. Replace the closing brace of `createConfig({...})` to add:

```typescript
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models"),
        presetsDir: "./presets"
    },
    tuning: {
        flushEvery: numberFromEnv("FLUSH_EVERY", 500)
    }
```

(The rest of the file — imports, `loadEnv`, `source`, `target`, and the commented `debug` block — remains unchanged.)

- [ ] **Step 2: Update `templates/internal-project/config.ts`**

Add a `tuning` section after `pipeline`. Replace:

```typescript
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models"),
        presetsDir: "./presets"
    }
});
```

with:

```typescript
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models"),
        presetsDir: "./presets"
    },
    tuning: {
        flushEvery: numberFromEnv("FLUSH_EVERY", 500)
    }
});
```

- [ ] **Step 3: Update `templates/projects/example/.env.example`**

Append `FLUSH_EVERY` to the `# --- Tuning ---` section. After the existing `SEGMENTS={{SEGMENTS}}` line add:

```
# Records read per shard before flushing writes to the target. Lower values
# reduce peak memory on large tables; higher values reduce write round-trips.
# FLUSH_EVERY=500
```

- [ ] **Step 4: Update `templates/internal-project/.env.example`**

Same addition after `SEGMENTS={{SEGMENTS}}`:

```
# Records read per shard before flushing writes to the target. Lower values
# reduce peak memory on large tables; higher values reduce write round-trips.
# FLUSH_EVERY=500
```

- [ ] **Step 5: Commit**

```bash
git add templates/projects/example/config.ts \
        templates/internal-project/config.ts \
        templates/projects/example/.env.example \
        templates/internal-project/.env.example
git commit -m "feat: wire FLUSH_EVERY env var in config templates"
```
