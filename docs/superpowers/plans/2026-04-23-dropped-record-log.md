# Dropped Record Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log every dropped record (unmatched or blackholed) to a human-readable per-segment file at `.transfer/<runId>/segment-{n}-dropped.log`.

**Architecture:** `RecordDisposition` domain classes replace the `void` return of `PipelineRunner.runRecord`; a new `DroppedRecordLog` DI service (injected into `PipelineRunner`) buffers formatted lines and flushes them to disk at shard end. Test containers use a `MockDroppedRecordLog` that captures entries in memory without touching the filesystem.

**Tech Stack:** TypeScript, `@webiny/di`, Vitest, Node `fs`

---

### Task 1: `RecordDisposition` — domain classes

**Files:**
- Create: `src/domain/pipeline/RecordDisposition.ts`
- Modify: `src/domain/pipeline/index.ts`

No behavior — just data. No tests needed; type-checking catches mistakes.

- [ ] **Step 1: Create `RecordDisposition.ts`**

```typescript
// src/domain/pipeline/RecordDisposition.ts
export namespace RecordDisposition {
    export class Processed {}

    export class Blackholed {
        public constructor(public readonly pipelineName: string) {}
    }

    export class Unmatched {}
}
```

- [ ] **Step 2: Export from the domain barrel**

Add to `src/domain/pipeline/index.ts`:

```typescript
export { RecordDisposition } from "./RecordDisposition.ts";
```

- [ ] **Step 3: Run the full suite to confirm no regressions**

```bash
yarn test
```

Expected: same pass/fail count as before (one pre-existing S3 failure is expected).

- [ ] **Step 4: Commit**

```bash
git add src/domain/pipeline/RecordDisposition.ts src/domain/pipeline/index.ts
git commit -m "feat(domain): add RecordDisposition discriminated result classes"
```

---

### Task 2: `DroppedRecordLog` DI service

**Files:**
- Create: `src/features/DroppedRecordLog/abstractions/DroppedRecordLog.ts`
- Create: `src/features/DroppedRecordLog/abstractions/index.ts`
- Create: `src/features/DroppedRecordLog/DroppedRecordLog.ts`
- Create: `src/features/DroppedRecordLog/feature.ts`
- Create: `src/features/DroppedRecordLog/index.ts`
- Create: `__tests__/features/DroppedRecordLog/DroppedRecordLog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/features/DroppedRecordLog/DroppedRecordLog.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { DirectoryToolFeature } from "~/tools/DirectoryTool/index.ts";
import { FileToolFeature } from "~/tools/FileTool/index.ts";
import { DroppedRecordLog, DroppedRecordLogFeature } from "~/features/DroppedRecordLog/index.ts";
import { RecordDisposition } from "~/domain/pipeline/index.ts";

function createContainer(): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(TransferContext, { runId: "test-run-id" });
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);
    DroppedRecordLogFeature.register(container);
    return container;
}

describe("DroppedRecordLog", () => {
    let originalCwd: string;
    let workDir: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workDir = await mkdtemp(join(tmpdir(), "dropped-record-log-"));
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    it("writes [UNMATCHED] line with modelId when record has top-level modelId", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add(
            { PK: "T#root", SK: "L", TYPE: "cms.entry.l", modelId: "blogPost" },
            new RecordDisposition.Unmatched()
        );
        log.flush(0);

        const content = await readFile(
            join(workDir, ".transfer", "test-run-id", "segment-0-dropped.log"),
            "utf-8"
        );
        expect(content.trim()).toBe("[UNMATCHED] [blogPost] T#root : L : cms.entry.l");
    });

    it("writes [UNMATCHED] line with [TYPE] tag when record has no modelId", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add(
            { PK: "T#root#FLP#1", SK: "A", TYPE: "flp.record" },
            new RecordDisposition.Unmatched()
        );
        log.flush(0);

        const content = await readFile(
            join(workDir, ".transfer", "test-run-id", "segment-0-dropped.log"),
            "utf-8"
        );
        expect(content.trim()).toBe("[UNMATCHED] [flp.record] T#root#FLP#1 : A");
    });

    it("writes [BLACKHOLED] line using data.modelId as fallback", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add(
            {
                PK: "T#root#TASK#1",
                SK: "L",
                TYPE: "webinyTask",
                data: { modelId: "webinyTask" }
            },
            new RecordDisposition.Blackholed("BackgroundTasks")
        );
        log.flush(0);

        const content = await readFile(
            join(workDir, ".transfer", "test-run-id", "segment-0-dropped.log"),
            "utf-8"
        );
        expect(content.trim()).toBe("[BLACKHOLED] [webinyTask] T#root#TASK#1 : L : webinyTask");
    });

    it("writes multiple lines in add order", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add({ PK: "PK1", SK: "SK1", TYPE: "t1" }, new RecordDisposition.Unmatched());
        log.add(
            { PK: "PK2", SK: "SK2", TYPE: "t2" },
            new RecordDisposition.Blackholed("pipe")
        );
        log.flush(1);

        const content = await readFile(
            join(workDir, ".transfer", "test-run-id", "segment-1-dropped.log"),
            "utf-8"
        );
        const lines = content.trim().split("\n");
        expect(lines[0]).toBe("[UNMATCHED] [t1] PK1 : SK1");
        expect(lines[1]).toBe("[BLACKHOLED] [t2] PK2 : SK2");
    });

    it("creates no file when buffer is empty", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.flush(0);

        await expect(
            readFile(
                join(workDir, ".transfer", "test-run-id", "segment-0-dropped.log"),
                "utf-8"
            )
        ).rejects.toThrow(/ENOENT/);
    });

    it("clears buffer after flush — second flush with no new adds is a no-op", async () => {
        const log = createContainer().resolve(DroppedRecordLog);
        log.add({ PK: "PK1", SK: "SK1", TYPE: "t1" }, new RecordDisposition.Unmatched());
        log.flush(0);
        log.flush(1); // buffer was cleared; no file for segment 1

        await expect(
            readFile(
                join(workDir, ".transfer", "test-run-id", "segment-1-dropped.log"),
                "utf-8"
            )
        ).rejects.toThrow(/ENOENT/);
    });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
yarn test __tests__/features/DroppedRecordLog/DroppedRecordLog.test.ts
```

Expected: FAIL — `DroppedRecordLog` not found.

- [ ] **Step 3: Create the abstraction**

Create `src/features/DroppedRecordLog/abstractions/DroppedRecordLog.ts`:

```typescript
import { createAbstraction } from "~/base/index.ts";
import type { RecordDisposition } from "~/domain/pipeline/RecordDisposition.ts";

interface IDroppedRecordLog {
    add(
        record: unknown,
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
    ): void;
    flush(segment: number): void;
}

export const DroppedRecordLog = createAbstraction<IDroppedRecordLog>("Core/DroppedRecordLog");

export namespace DroppedRecordLog {
    export type Interface = IDroppedRecordLog;
}
```

Create `src/features/DroppedRecordLog/abstractions/index.ts`:

```typescript
export { DroppedRecordLog } from "./DroppedRecordLog.ts";
```

- [ ] **Step 4: Create the implementation**

Create `src/features/DroppedRecordLog/DroppedRecordLog.ts`:

```typescript
import { join } from "node:path";
import { DroppedRecordLog as DroppedRecordLogAbstraction } from "./abstractions/DroppedRecordLog.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { RecordDisposition } from "~/domain/pipeline/RecordDisposition.ts";

class DroppedRecordLogImpl implements DroppedRecordLogAbstraction.Interface {
    private readonly buffer: string[] = [];

    public constructor(
        private readonly transferContext: TransferContext.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface
    ) {}

    public add(
        record: unknown,
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
    ): void {
        this.buffer.push(this.formatLine(record, disposition));
    }

    public flush(segment: number): void {
        if (this.buffer.length === 0) {
            return;
        }
        const dir = join(process.cwd(), ".transfer", this.transferContext.runId);
        this.dirTool.create(dir);
        const path = join(dir, `segment-${segment}-dropped.log`);
        this.fileTool.writeFileOrThrow(path, this.buffer.join("\n") + "\n");
        this.buffer.length = 0;
    }

    private formatLine(
        record: unknown,
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
    ): string {
        const r = record as Record<string, unknown>;
        const data = r.data as Record<string, unknown> | undefined;
        const modelId = (r.modelId ?? data?.modelId) as string | undefined;
        const pk = (r.PK ?? "") as string;
        const sk = (r.SK ?? "") as string;
        const type = (r.TYPE ?? "?") as string;
        const tag =
            disposition instanceof RecordDisposition.Blackholed ? "BLACKHOLED" : "UNMATCHED";
        const body = modelId
            ? `[${modelId}] ${pk} : ${sk} : ${type}`
            : `[${type}] ${pk} : ${sk}`;
        return `[${tag}] ${body}`;
    }
}

export const DroppedRecordLog = DroppedRecordLogAbstraction.createImplementation({
    implementation: DroppedRecordLogImpl,
    dependencies: [TransferContext, DirectoryTool, FileTool]
});
```

- [ ] **Step 5: Create feature and index barrel**

Create `src/features/DroppedRecordLog/feature.ts`:

```typescript
import { createFeature } from "~/base/index.ts";
import { DroppedRecordLog } from "./DroppedRecordLog.ts";

export const DroppedRecordLogFeature = createFeature({
    name: "Core/DroppedRecordLogFeature",
    register(container) {
        container.register(DroppedRecordLog).inSingletonScope();
    }
});
```

Create `src/features/DroppedRecordLog/index.ts`:

```typescript
export { DroppedRecordLog } from "./abstractions/DroppedRecordLog.ts";
export { DroppedRecordLogFeature } from "./feature.ts";
```

- [ ] **Step 6: Run the tests to confirm green**

```bash
yarn test __tests__/features/DroppedRecordLog/DroppedRecordLog.test.ts
```

Expected: 6/6 pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/DroppedRecordLog/ \
        __tests__/features/DroppedRecordLog/DroppedRecordLog.test.ts
git commit -m "feat(dropped-log): add DroppedRecordLog DI service"
```

---

### Task 3: Wire `PipelineRunner` + `MockDroppedRecordLog` + test containers

**Files:**
- Modify: `src/features/PipelineRunner/PipelineRunner.ts`
- Create: `__tests__/features/DroppedRecordLog/MockDroppedRecordLog.ts`
- Modify: `__tests__/containers/ddb.ts`
- Modify: `__tests__/containers/os.ts`
- Create: `__tests__/features/PipelineRunner/PipelineRunner.droppedLog.test.ts`

- [ ] **Step 1: Create `MockDroppedRecordLog`**

Create `__tests__/features/DroppedRecordLog/MockDroppedRecordLog.ts`:

```typescript
import { DroppedRecordLog } from "~/features/DroppedRecordLog/abstractions/DroppedRecordLog.ts";
import type { RecordDisposition } from "~/domain/pipeline/index.ts";

export class MockDroppedRecordLog implements DroppedRecordLog.Interface {
    public readonly entries: Array<{
        record: unknown;
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched;
    }> = [];
    public readonly flushedSegments: number[] = [];

    public add(
        record: unknown,
        disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
    ): void {
        this.entries.push({ record, disposition });
    }

    public flush(segment: number): void {
        this.flushedSegments.push(segment);
    }

    public clear(): void {
        this.entries.length = 0;
        this.flushedSegments.length = 0;
    }
}
```

- [ ] **Step 2: Write the failing PipelineRunner dropped-log tests**

Create `__tests__/features/PipelineRunner/PipelineRunner.droppedLog.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { createFilter, RecordDisposition } from "~/domain/pipeline/index.ts";
import { DroppedRecordLog } from "~/features/DroppedRecordLog/index.ts";
import { MockDroppedRecordLog } from "../DroppedRecordLog/MockDroppedRecordLog.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";

function makeRecord(pk: string, sk: string, type: string, modelId?: string): BaseRecord {
    return {
        PK: pk,
        SK: sk,
        _et: "Test",
        _ct: "2024-01-01T00:00:00.000Z",
        _md: "2024-01-01T00:00:00.000Z",
        TYPE: type,
        ...(modelId ? { modelId } : {})
    } as unknown as BaseRecord;
}

describe("PipelineRunner — DroppedRecordLog integration", () => {
    it("logs unmatched records as Unmatched disposition", async () => {
        const records = [
            makeRecord("T#root", "L", "cms.entry.l"),
            makeRecord("T#root", "A", "unknown.type")
        ];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const runner = container.resolve(PipelineRunner);
        const factory = container.resolve(PipelineBuilderFactory);

        // Pipeline only accepts cms.entry.l — the unknown.type record goes unmatched
        const builder = factory.create({
            name: "cms",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(r => r.TYPE === "cms.entry.l"));
        runner.register(builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        const log = container.resolve(DroppedRecordLog) as MockDroppedRecordLog;
        expect(log.entries).toHaveLength(1);
        expect(log.entries[0]?.disposition).toBeInstanceOf(RecordDisposition.Unmatched);
        expect((log.entries[0]?.record as BaseRecord).TYPE).toBe("unknown.type");
        expect(log.flushedSegments).toContain(0);
    });

    it("logs blackholed records as Blackholed disposition with pipeline name", async () => {
        const records = [makeRecord("T#root", "L", "task.record")];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const runner = container.resolve(PipelineRunner);
        const factory = container.resolve(PipelineBuilderFactory);

        const builder = factory.create({
            name: "task-blackhole",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(r => r.TYPE === "task.record"));
        builder.blackhole();
        runner.register(builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        const log = container.resolve(DroppedRecordLog) as MockDroppedRecordLog;
        expect(log.entries).toHaveLength(1);
        const disposition = log.entries[0]?.disposition;
        expect(disposition).toBeInstanceOf(RecordDisposition.Blackholed);
        expect((disposition as RecordDisposition.Blackholed).pipelineName).toBe("task-blackhole");
        expect(log.flushedSegments).toContain(0);
    });

    it("flush is called even when no records were dropped", async () => {
        const records = [makeRecord("T#root", "L", "cms.entry.l")];
        const container = createDdbContainer({
            sourceRecords: { "source-table": records }
        });
        const runner = container.resolve(PipelineRunner);
        const factory = container.resolve(PipelineBuilderFactory);

        const builder = factory.create({
            name: "cms",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.filter(createFilter<BaseRecord>(() => true));
        runner.register(builder.build());

        await runner.run({ segment: 0, totalSegments: 1 });

        const log = container.resolve(DroppedRecordLog) as MockDroppedRecordLog;
        expect(log.entries).toHaveLength(0);
        expect(log.flushedSegments).toContain(0);
    });
});
```

- [ ] **Step 3: Run to confirm the new tests fail**

```bash
yarn test __tests__/features/PipelineRunner/PipelineRunner.droppedLog.test.ts
```

Expected: FAIL — `DroppedRecordLog` not registered in container, or method does not exist yet.

- [ ] **Step 4: Modify `PipelineRunner.ts`**

Add two imports after the existing `SnapshotWriter` import:

```typescript
import { DroppedRecordLog } from "~/features/DroppedRecordLog/index.ts";
import { RecordDisposition } from "~/domain/pipeline/index.ts";
```

Add `droppedLog` as the last constructor parameter (after `snapshotWriter`):

```typescript
public constructor(
    private readonly container: Container,
    private readonly logger: Logger.Interface,
    private readonly transferContext: TransferContext.Interface,
    private readonly baseContextFactory: BaseTransformContextFactory.Interface,
    private readonly snapshotWriter: SnapshotWriter.Interface,
    private readonly droppedLog: DroppedRecordLog.Interface
) {}
```

In `runShard`, inside the pipeline-match loop, change the `runRecord` call to capture the result and log blackholed records:

```typescript
matched = true;
perPipelineCounts.set(
    pipeline.name,
    (perPipelineCounts.get(pipeline.name) ?? 0) + 1
);
await this.snapshotWriter.write(
    `${pipeline.name}/segment-${shardCtx.segment}.source.jsonl`,
    record
);
const result = await this.runRecord(pipeline, processors, record, shardCommands, shardCtx);
if (result instanceof RecordDisposition.Blackholed) {
    this.droppedLog.add(record, result);
}
break;
```

In the `!matched` block, add the `droppedLog.add` call after the existing `snapshotWriter.write`:

```typescript
if (!matched) {
    const { PK, SK } = record as any;
    droppedCount++;
    this.logger.debug(
        `record dropped: no matching pipeline in merge group (${PK} ${SK})`,
        mergeGroupId
    );
    await this.snapshotWriter.write(
        `dropped/segment-${shardCtx.segment}.jsonl`,
        record
    );
    this.droppedLog.add(record, new RecordDisposition.Unmatched());
}
```

After `this.warnUnclaimedKeys(shardCommands)`, add the flush:

```typescript
this.warnUnclaimedKeys(shardCommands);
this.droppedLog.flush(shardCtx.segment);
```

Change `runRecord` return type from `Promise<void>` to `Promise<RecordDisposition.Processed | RecordDisposition.Blackholed>` and update the two return sites:

```typescript
private async runRecord(
    pipeline: AnyPipeline,
    processors: ProcessorInstance[],
    record: unknown,
    shardCommands: Commands,
    shardCtx: Processor.AfterShardContext
): Promise<RecordDisposition.Processed | RecordDisposition.Blackholed> {
```

At the blackhole check:

```typescript
if (pipeline.isBlackhole) {
    return new RecordDisposition.Blackholed(pipeline.name);
}
```

At the end of the method (after the `for...of commands.all()` loop):

```typescript
for (const cmd of commands.all()) {
    shardCommands.add(cmd);
}
return new RecordDisposition.Processed();
```

Update `createImplementation` at the bottom of the file to add `DroppedRecordLog`:

```typescript
export const PipelineRunner = PipelineRunnerAbstraction.createImplementation({
    implementation: PipelineRunnerImpl,
    dependencies: [
        ContainerToken,
        Logger,
        TransferContext,
        BaseTransformContextFactory,
        SnapshotWriter,
        DroppedRecordLog
    ]
});
```

- [ ] **Step 5: Register `MockDroppedRecordLog` in `ddb.ts` container**

In `__tests__/containers/ddb.ts`, add the import:

```typescript
import { DroppedRecordLog } from "../../src/features/DroppedRecordLog/abstractions/DroppedRecordLog.ts";
import { MockDroppedRecordLog } from "../features/DroppedRecordLog/MockDroppedRecordLog.ts";
```

Inside `createDdbContainer`, before `PipelineRunnerFeature.register(container)`:

```typescript
container.registerInstance(DroppedRecordLog, new MockDroppedRecordLog());
```

- [ ] **Step 6: Register `MockDroppedRecordLog` in `os.ts` container**

In `__tests__/containers/os.ts`, add the same two imports as Step 5 (adjusting relative paths):

```typescript
import { DroppedRecordLog } from "../../src/features/DroppedRecordLog/abstractions/DroppedRecordLog.ts";
import { MockDroppedRecordLog } from "../features/DroppedRecordLog/MockDroppedRecordLog.ts";
```

Inside `createOsContainer`, before `PipelineRunnerFeature.register(container)`:

```typescript
container.registerInstance(DroppedRecordLog, new MockDroppedRecordLog());
```

- [ ] **Step 7: Run the new dropped-log tests to confirm green**

```bash
yarn test __tests__/features/PipelineRunner/PipelineRunner.droppedLog.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 8: Run the full suite to confirm no regressions**

```bash
yarn test
```

Expected: all tests that passed before still pass (pre-existing S3 failure excepted).

- [ ] **Step 9: Commit**

```bash
git add src/features/PipelineRunner/PipelineRunner.ts \
        __tests__/features/DroppedRecordLog/MockDroppedRecordLog.ts \
        __tests__/containers/ddb.ts \
        __tests__/containers/os.ts \
        __tests__/features/PipelineRunner/PipelineRunner.droppedLog.test.ts
git commit -m "feat(pipeline-runner): log dropped records via DroppedRecordLog"
```

---

### Task 4: Register in `bootstrap.ts` and `integrationContainer.ts`

**Files:**
- Modify: `src/bootstrap.ts`
- Modify: `__tests__/integration/integrationContainer.ts`

- [ ] **Step 1: Add to `bootstrap.ts`**

In `src/bootstrap.ts`, add the import after the existing feature imports (e.g. after `TouchedIndexesFeature`):

```typescript
import { DroppedRecordLogFeature } from "~/features/DroppedRecordLog/index.ts";
```

In the `bootstrap` function body, add the registration alongside the other pipeline features (e.g. after `SnapshotWriterFeature.register(container)`):

```typescript
DroppedRecordLogFeature.register(container);
```

- [ ] **Step 2: Add to `integrationContainer.ts`**

In `__tests__/integration/integrationContainer.ts`, add the import:

```typescript
import { DroppedRecordLogFeature } from "../../src/features/DroppedRecordLog/index.ts";
```

Inside `createDdbIntegrationContainer`, add the registration alongside the other features (e.g. after `SnapshotWriterFeature.register(container)`):

```typescript
DroppedRecordLogFeature.register(container);
```

- [ ] **Step 3: Run the full suite**

```bash
yarn test
```

Expected: same pass/fail as Task 3 (pre-existing S3 failure excepted; the integration test uses `useRealS3Client: true` with the broken mock — unrelated to this feature).

- [ ] **Step 4: Commit**

```bash
git add src/bootstrap.ts \
        __tests__/integration/integrationContainer.ts
git commit -m "feat(bootstrap): register DroppedRecordLogFeature"
```
