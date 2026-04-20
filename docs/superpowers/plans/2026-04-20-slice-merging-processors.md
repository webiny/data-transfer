# Slice-Merging Processors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace today's god-processors with per-command-type processors that compose via a `processors: NonEmptyArray<...>` array on each pipeline. Each processor contributes a context "slice" of helpers, owns its terminal `onEnd` hook, and drains its own commands.

**Architecture:** Pipeline construction takes a typed list of Implementation classes; runner builds the per-record context by spreading each processor's `extendContext(base)` slice over a slim `BaseTransformContext`. Slice-key collision rejected at compile time via `DisjointKeys<>`. After the transformer chain runs, processors' `onEnd` hooks run sequentially in array order; at shard end, `execute()` runs sequentially in array order. Unhandled-command warnings surface via `Commands.unclaimedKeys()`. User-side custom DI via a sibling `setup.ts`.

**Tech Stack:** TypeScript (variadic tuples + conditional types), `@webiny/di`, Vitest, oxfmt.

**Spec:** `docs/superpowers/specs/2026-04-20-slice-merging-processors-design.md`.

---

## Migration Strategy

This is a **big-bang refactor** of the Processor + TransformContext layer. Tasks are sequenced so:

- **Phase 1 (Tasks 1–4)** is fully additive: each task lands cleanly, tests stay green.
- **Phase 2 (Tasks 5–10)** rewrites the core. **Each task in this phase WILL leave ts-check errors** that subsequent phase-2 tasks clear. Implementers are told the expected error count after each task; the suite only returns to green at the end of phase 2.
- **Phase 3 (Tasks 11–14)** is cleanup, doc updates, and final verification.

Each task lists the expected ts-check error count after its commit. If a task's verification reports MORE errors than expected, the implementer reports it (and the controller decides whether to continue or fix in-task).

Test-suite green is verified at end of Task 10 (after the runner refactor lands). Tests that depended on the old Processor / TransformContext shapes are rewritten in Task 11.

---

## File Structure

**Modify:**

- `src/domain/transform/commands/Commands.ts` — add `claimedKeys: Set<string>`; mutate from `get()`; expose `unclaimedKeys(): string[]`.
- `src/features/TransformContext/abstractions/BaseTransformContext.ts` — slim to `{ record, original, addCommand, modelProvider, cache, replace, queryRecord<T> }`. Drop `commands` from public ctx (still exists internally for processor `execute(commands)`).
- `src/features/TransformContext/BaseTransformContextFactory.ts` — factory creates the base ctx; bag is internal; `addCommand` is exposed; `queryRecord<T>` generic.
- `src/features/PutDynamoDbRecordExecutor/` → renamed to `src/features/DdbExecutor/`.
- `src/domain/pipeline/abstractions/Processor.ts` — new interface: `extendContext?`, `onEnd?`, `execute`, `getShardState`. Drop `createContext`.
- `src/features/DdbProcessor/DdbProcessor.ts` — rewrite: `extendContext` returns `{ putRecord }`; `onEnd` calls `ctx.putRecord(ctx.record)`; `execute` drains PutRecord via `DdbExecutor`. No more S3 dispatch.
- `src/features/S3CopyExecutor/` → rename to `src/features/S3Processor/` and rewrite as a Processor with `extendContext` returning `{ copyFile, getFile }`; `execute` drains S3Copy. **No `onEnd`** (S3 has no derivable per-record default).
- `src/features/PutOsDynamoDbRecordExecutor/` and `src/features/OsProcessor/` → merged into `src/features/OsProcessor/`. New shape: `extendContext` returns `{ putRecord }`; `onEnd` calls `ctx.putRecord(ctx.record)`; `execute` runs ensureIndex + gzip + delegates to `DdbExecutor`. `getShardState` returns `{ touchedIndexes }`.
- `src/features/PipelineRunner/abstractions/PipelineRunner.ts` — `pipeline()` signature: `processors: NonEmptyArray<DisjointKeys<...>>`; returns builder typed `EffectiveContext`. `register(...)` unchanged.
- `src/features/PipelineRunner/PipelineRunner.ts` — per-record slice merge; sequential `onEnd`; sequential `execute`; unclaimed-keys warn; per-pipeline aggregated `getShardState` keyed by abstraction-token name.
- `src/domain/pipeline/PipelineBuilder.ts` — `.build()` takes no args; types against `EffectiveContext`.
- `src/domain/pipeline/Pipeline.ts` — adds `processors: readonly Processor.Interface<...>[]` field; drops `transformerFns` / `accepts` if subsumed by the new shape (or keeps with adapted internals).
- `src/bootstrap.ts` — register `BaseTransformContextFactory`, `DdbExecutor`, `DdbProcessor`, `S3Processor` in DDB mode; `BaseTransformContextFactory`, `DdbExecutor`, `OsProcessor`, `TouchedIndexes` in OS mode.
- `src/cli.ts` (or wherever the CLI bootstraps) — load sibling `setup.ts` if present, await its default export with `{ container }` BEFORE `preset.configure(runner)`.
- `src/index.ts` — drop `BaseTransformContext`/`DdbTransformContext`/`OsTransformContext` per-mode re-exports; add `Processor` (abstraction + namespace types `Interface`, `SliceOf`), `BaseTransformContext` (the slim base), `initDataTransfer` + `InitDataTransferContext`, `NonEmptyArray` (utility type).
- `src/presets/example.ts` — rewrite to new processors[] shape.
- `templates/presets/example.ts` — same.
- `templates/projects/example/` — add `setup.ts` scaffold (commented-out placeholder).
- `templates/README.md` — document `setup.ts`, the new processors[] shape.
- `AGENTS.md` — Section 2 (Public API), Section 3 (project tree), Section 4 (Scanner/Processor/Executor description), Section 6 (hard-won decisions).
- All affected tests rewritten (see Task 11).

**Create:**

- `__tests__/domain/pipeline/PipelineBuilder.slices.test.ts` — type-test fixture (vitest type tests).

**Delete:**

- `src/features/PutDynamoDbRecordExecutor/` (renamed).
- `src/features/PutOsDynamoDbRecordExecutor/` (merged into OsProcessor).
- `src/features/S3CopyExecutor/` (merged into S3Processor).
- `src/features/TransformContext/DdbTransformContextFactory.ts` (helpers move to processor slices).
- `src/features/TransformContext/OsTransformContextFactory.ts` (same).
- `src/features/TransformContext/abstractions/DdbTransformContext.ts` (replaced by base + slice intersection).
- `src/features/TransformContext/abstractions/OsTransformContext.ts` (same).
- `__tests__/features/PutDynamoDbRecordExecutor/`, `__tests__/features/PutOsDynamoDbRecordExecutor/`, `__tests__/features/S3CopyExecutor/` (coverage moves to per-processor test dirs).

---

## Phase 1 — Additive prep (suite stays green)

### Task 1: `Commands.unclaimedKeys()` + claim tracking

**Files:**
- Modify: `src/domain/transform/commands/Commands.ts`
- Modify: `__tests__/domain/transform/commands/Commands.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `__tests__/domain/transform/commands/Commands.test.ts`:

```typescript
describe("unclaimedKeys", () => {
    it("returns empty when all keys with commands have been .get()'d", () => {
        const cmds = new Commands();
        cmds.add(PutRecord.create({ table: "t", record: { PK: "1", SK: "1" } }));
        cmds.add(S3Copy.create({ sourceBucket: "s", sourceKey: "k", targetBucket: "tb", targetKey: "tk" }));
        cmds.get<PutRecord>(PutRecord.key);
        cmds.get<S3Copy>(S3Copy.key);
        expect(cmds.unclaimedKeys()).toEqual([]);
    });

    it("returns keys with commands that nothing claimed via .get()", () => {
        const cmds = new Commands();
        cmds.add(PutRecord.create({ table: "t", record: { PK: "1", SK: "1" } }));
        cmds.add(S3Copy.create({ sourceBucket: "s", sourceKey: "k", targetBucket: "tb", targetKey: "tk" }));
        cmds.get<PutRecord>(PutRecord.key); // only PutRecord drained
        expect(cmds.unclaimedKeys()).toEqual([S3Copy.key]);
    });

    it("does NOT report keys with empty buckets even if not claimed", () => {
        const cmds = new Commands();
        // No commands added — nothing pending.
        expect(cmds.unclaimedKeys()).toEqual([]);
    });

    it("treats a .get() of a key with zero commands as a claim — no false warning", () => {
        const cmds = new Commands();
        cmds.add(PutRecord.create({ table: "t", record: { PK: "1", SK: "1" } }));
        cmds.get<S3Copy>(S3Copy.key);  // claimed but no S3 commands ever added
        cmds.get<PutRecord>(PutRecord.key);
        expect(cmds.unclaimedKeys()).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `yarn test __tests__/domain/transform/commands/Commands.test.ts`
Expected: 4 new tests fail (`unclaimedKeys` doesn't exist).

- [ ] **Step 3: Implement claim-tracking + `unclaimedKeys()` in `src/domain/transform/commands/Commands.ts`**

Add a private `claimedKeys: Set<string>` field. Mutate it from inside `get()`. Add the public method:

```typescript
public get<TCommand extends Command = Command>(key: string): TCommand[] {
    this.claimedKeys.add(key);
    return (this.buckets.get(key) ?? []) as TCommand[];
}

public unclaimedKeys(): string[] {
    const result: string[] = [];
    for (const [key, bucket] of this.buckets) {
        if (bucket.length > 0 && !this.claimedKeys.has(key)) {
            result.push(key);
        }
    }
    return result;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `yarn test __tests__/domain/transform/commands/Commands.test.ts`
Expected: all green.

- [ ] **Step 5: Format + ts-check + full suite**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # expect 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

- [ ] **Step 6: Commit**

```bash
git add src/domain/transform/commands/Commands.ts __tests__/domain/transform/commands/Commands.test.ts
git commit -m "$(cat <<'EOF'
feat(commands): track claim via .get(); expose unclaimedKeys()

Implicit detection of unhandled commands — when a processor's execute()
calls commands.get(key), key is marked "claimed". After all processors
run, unclaimedKeys() returns keys whose buckets are non-empty AND no
processor claimed them. Used by the runner to warn-once on commands a
pipeline emitted but no processor drained.

Additive — no caller change yet. Will be consumed by the runner once
the per-processor refactor lands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `addCommand(cmd)` on `BaseTransformContext`

**Files:**
- Modify: `src/features/TransformContext/abstractions/BaseTransformContext.ts`
- Modify: `src/features/TransformContext/BaseTransformContextFactory.ts` (impl) — verify the factory builds an instance with addCommand.
- Modify: `__tests__/features/TransformContext/BaseTransformContext.test.ts` (or wherever the existing base ctx tests live).

- [ ] **Step 1: Add `addCommand(cmd: Command): void` to the interface**

In `src/features/TransformContext/abstractions/BaseTransformContext.ts`, add to the interface:

```typescript
import type { Command } from "~/domain/transform/commands/Command.ts";

interface IBaseTransformContext<TRecord> {
    // ... existing fields
    addCommand(cmd: Command): void;
}
```

(The `commands` field stays for now — it's removed in Task 5 / Task 8 when public ctx is slimmed. This task only ADDS `addCommand` so consumers can adopt it.)

- [ ] **Step 2: Implement `addCommand` in the factory**

In `BaseTransformContextFactory.ts`:

```typescript
addCommand(cmd: Command) {
    commands.add(cmd);
}
```

- [ ] **Step 3: Add a test verifying the new method**

Append to the existing test file:

```typescript
it("addCommand pushes to the underlying commands bag", () => {
    const ctx = factory.create({ record: { PK: "1", SK: "1" } });
    const cmd = PutRecord.create({ table: "t", record: { PK: "1", SK: "1" } });
    ctx.addCommand(cmd);
    expect(ctx.commands.get<PutRecord>(PutRecord.key)).toEqual([cmd]);
});
```

- [ ] **Step 4: Verify**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

- [ ] **Step 5: Commit**

```bash
git add -A src/features/TransformContext __tests__/features/TransformContext
git commit -m "$(cat <<'EOF'
feat(base-ctx): expose addCommand(cmd) primitive

addCommand is sugar over the internal commands.add(cmd). Slice helpers
(in the upcoming refactor) will use it instead of accessing the bag
directly. Transformers reach for addCommand when they need to push a
custom command type no slice helper provides.

The raw `commands` bag stays exposed for now; the public ctx surface
is slimmed in the Processor refactor (Task 5/8) where the bag becomes
internal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rename `PutDynamoDbRecordExecutor` → `DdbExecutor`

**Files:**
- Rename: `src/features/PutDynamoDbRecordExecutor/` → `src/features/DdbExecutor/`.
- Rename: `__tests__/features/PutDynamoDbRecordExecutor/` → `__tests__/features/DdbExecutor/`.
- Rename: `PutDynamoDbRecordExecutor` → `DdbExecutor` (token + namespace + class) inside the moved files.
- Update: `src/features/DdbProcessor/DdbProcessor.ts` (consumer).
- Update: `src/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.ts` (consumer).
- Update: `src/bootstrap.ts` (registration).
- Update: any other consumer (grep).

- [ ] **Step 1: Move directories**

```bash
git mv src/features/PutDynamoDbRecordExecutor src/features/DdbExecutor
git mv __tests__/features/PutDynamoDbRecordExecutor __tests__/features/DdbExecutor
```

Inside the moved dirs, rename the file `PutDynamoDbRecordExecutor.ts` → `DdbExecutor.ts` (both source + abstraction).

- [ ] **Step 2: Rename symbols globally inside the moved files**

In every renamed file: `PutDynamoDbRecordExecutor` → `DdbExecutor` (class, abstraction const, namespace, feature name). Update the abstraction token string from `"Core/PutDynamoDbRecordExecutor"` to `"Core/DdbExecutor"`.

- [ ] **Step 3: Update consumers**

Grep `PutDynamoDbRecordExecutor` in `src/` and `__tests__/`. Update import paths and identifiers. Specifically:

- `src/features/DdbProcessor/DdbProcessor.ts` — uses it as a constructor dep.
- `src/features/PutOsDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor.ts` — uses it as a delegate.
- `src/bootstrap.ts` — registration line.
- `__tests__/containers/ddb.ts` and `__tests__/containers/os.ts` — feature registration.

- [ ] **Step 4: Verify**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: rename PutDynamoDbRecordExecutor → DdbExecutor

Pure rename ahead of the per-command-processor refactor. The executor
isn't tied to "put records" specifically — it's the generic "DDB write"
primitive that DdbProcessor and OsProcessor will both compose. Naming
reflects that.

No behavior change; no test rewrites; consumers updated to reference
the new name.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `initDataTransfer` helper + CLI setup-file loading

**Files:**
- Create: `src/features/SetupLoader/abstractions/SetupLoader.ts` (or just a function helper — see Step 1).
- Modify: `src/index.ts` — export `initDataTransfer` + `InitDataTransferContext`.
- Modify: `src/cli.ts` (or `src/commands/run/handler.ts`) — load + execute sibling `setup.ts` after bootstrap.
- Create: `__tests__/cli/setup-loading.test.ts` — verifies setup.ts is discovered, imported, executed before preset.

- [ ] **Step 1: Add the typed identity helper to `src/index.ts`**

```typescript
import type { Container } from "@webiny/di";

export interface InitDataTransferContext {
    container: Container;
}

export function initDataTransfer(
    fn: (ctx: InitDataTransferContext) => void | Promise<void>
): typeof fn {
    return fn;
}
```

(May live in `src/utils/initDataTransfer.ts` and be re-exported from `src/index.ts` — adapt as fits.)

- [ ] **Step 2: CLI loads setup.ts if present**

In the CLI run handler (find via `src/commands/run/`):

```typescript
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const configDir = dirname(resolve(argv.config));
const setupPath = join(configDir, "setup.ts");

if (existsSync(setupPath)) {
    const mod = await import(pathToFileURL(setupPath).href);
    const setupFn = mod.default;
    if (typeof setupFn !== "function") {
        throw new Error(
            `setup.ts at ${setupPath} must export a function as default. ` +
            `Use the initDataTransfer() helper to type it.`
        );
    }
    logger.info(`Running setup from ${setupPath}`);
    await setupFn({ container });
}

// THEN load preset, run preset.configure(runner), etc.
```

(Adapt the exact location based on the existing CLI/handler structure — `setup.ts` discovery happens after container bootstrap, before preset.configure.)

- [ ] **Step 3: Test setup loading**

`__tests__/cli/setup-loading.test.ts` — small focused test using a tmp dir + a stub config + a stub setup.ts that registers a marker. Verify the marker is registered in the container.

- [ ] **Step 4: Verify**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

- [ ] **Step 5: Commit**

```bash
git add -A src/cli.ts src/commands src/index.ts src/utils __tests__/cli
git commit -m "$(cat <<'EOF'
feat(cli): load sibling setup.ts before preset.configure

Adds the user-side custom DI hook discussed in the spec. CLI looks
for setup.ts next to the config file; if present, dynamic-imports its
default export and awaits await fn({ container }) BEFORE running
preset.configure(runner).

initDataTransfer() is a typed identity helper exported from the public
API so users get autocomplete for the { container } argument.

Optional file — pure-config users skip it entirely.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Big-bang refactor (suite breaks; restored at end of phase)

### Task 5: New `Processor` abstraction (interface change)

**Files:**
- Modify: `src/domain/pipeline/abstractions/Processor.ts`

- [ ] **Step 1: Replace the interface body**

```typescript
import { createAbstraction } from "~/base/index.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface IProcessor<TBaseContext extends BaseTransformContext.Interface<unknown>, TSlice = {}> {
    extendContext?(base: TBaseContext): TSlice;
    onEnd?(ctx: TBaseContext & TSlice): void | Promise<void>;
    execute(commands: Commands): Promise<void>;
    getShardState(): unknown;
}

export const Processor = createAbstraction<IProcessor<any, any>>("Core/Processor");

export namespace Processor {
    export type Interface<
        TBaseContext extends BaseTransformContext.Interface<unknown>,
        TSlice = {}
    > = IProcessor<TBaseContext, TSlice>;
    export type SliceOf<P> = P extends { extendContext(base: any): infer S } ? S : {};
}
```

- [ ] **Step 2: Verify ts-check (expect MANY errors)**

```
yarn format:fix
yarn ts-check 2>&1 | grep "error TS" | wc -l
```

Expected: a substantial number of errors — DdbProcessor, OsProcessor, S3CopyExecutor (as a Processor), Pipeline / PipelineBuilder / PipelineRunner all break. Note the count.

**Do NOT fix the cascading errors here.** Tasks 6, 7, 8, 9 clear them.

- [ ] **Step 3: Commit**

```bash
git add src/domain/pipeline/abstractions/Processor.ts
git commit -m "$(cat <<'EOF'
refactor(processor): new interface — extendContext + onEnd + execute

Drops the old createContext-based shape. New shape:
- extendContext?(base) → slice (per-record helper contribution)
- onEnd?(ctx) → terminal hook (replaces magic auto-put)
- execute(commands) → drains the bag (unchanged)
- getShardState() → per-shard state (unchanged)

Per spec/2026-04-20-slice-merging-processors-design.md.

This commit deliberately leaves the existing implementations broken;
DdbProcessor, OsProcessor, S3CopyExecutor will be rewritten in
subsequent tasks (and S3CopyExecutor renamed to S3Processor). The
test suite will not return to green until end of phase 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewrite `DdbProcessor`

**Files:**
- Modify: `src/features/DdbProcessor/DdbProcessor.ts`

- [ ] **Step 1: Rewrite to new shape**

```typescript
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface DdbProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
}

class DdbProcessorImpl implements Processor.Interface<BaseTransformContext.Interface<unknown>, DdbProcessorSlice> {
    public constructor(
        private readonly executor: DdbExecutor.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): DdbProcessorSlice {
        if (this.config.storage !== "ddb") {
            throw new Error("DdbProcessor can only be used in ddb mode");
        }
        const targetTable = this.config.target.dynamodb.tableName;
        return {
            putRecord(record: Record<string, unknown>) {
                base.addCommand(PutRecord.create({ table: targetTable, record }));
            }
        };
    }

    public onEnd(ctx: BaseTransformContext.Interface<unknown> & DdbProcessorSlice): void {
        ctx.putRecord(ctx.record as Record<string, unknown>);
    }

    public async execute(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        await this.executor.execute(puts);
    }

    public getShardState(): unknown {
        return {};
    }
}

export const DdbProcessor = Processor.createImplementation({
    implementation: DdbProcessorImpl,
    dependencies: [DdbExecutor, MigrationConfig]
});
```

- [ ] **Step 2: Verify (errors should drop)**

```
yarn ts-check 2>&1 | grep "error TS" | wc -l
```

Note the count — should be lower than Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/features/DdbProcessor
git commit -m "$(cat <<'EOF'
refactor(ddb-processor): new shape — slice + onEnd + execute

DdbProcessor:
- extendContext returns { putRecord } slice (closes over target DDB table).
- onEnd does ctx.putRecord(ctx.record) — replaces the legacy auto-put.
- execute drains PutRecord via DdbExecutor.

S3 dispatch is GONE — that moves to S3Processor in a subsequent task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Rewrite + rename `S3CopyExecutor` → `S3Processor`

**Files:**
- Rename: `src/features/S3CopyExecutor/` → `src/features/S3Processor/`.
- Rename: `__tests__/features/S3CopyExecutor/` → `__tests__/features/S3Processor/` (test rewrite happens in Task 11).
- Rewrite: as a Processor implementation.

- [ ] **Step 1: Move + rename**

```bash
git mv src/features/S3CopyExecutor src/features/S3Processor
git mv __tests__/features/S3CopyExecutor __tests__/features/S3Processor
# Inside the moved dir, rename file: S3CopyExecutor.ts → S3Processor.ts (both src + abstractions).
```

- [ ] **Step 2: Rewrite the implementation**

```typescript
// src/features/S3Processor/S3Processor.ts
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { SourceS3Client, TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface S3ProcessorSlice {
    copyFile(sourceKey: string, targetKey: string): void;
    getFile(key: string): Promise<Buffer | null>;
}

class S3ProcessorImpl implements Processor.Interface<BaseTransformContext.Interface<unknown>, S3ProcessorSlice> {
    public constructor(
        private readonly sourceS3: SourceS3Client.Interface,
        private readonly targetS3: TargetS3Client.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): S3ProcessorSlice {
        if (this.config.storage !== "ddb") {
            throw new Error("S3Processor can only be used in ddb mode");
        }
        const sourceBucket = this.config.source.s3.bucket;
        const targetBucket = this.config.target.s3.bucket;
        const sourceS3 = this.sourceS3;
        return {
            copyFile(sourceKey: string, targetKey: string) {
                base.addCommand(S3Copy.create({ sourceBucket, sourceKey, targetBucket, targetKey }));
            },
            async getFile(key: string): Promise<Buffer | null> {
                return sourceS3.getObject(sourceBucket, key);
            }
        };
    }

    // No onEnd — S3 has no derivable per-record default.

    public async execute(commands: Commands): Promise<void> {
        const copies = commands.get<S3Copy>(S3Copy.key);
        if (copies.length === 0) {
            return;
        }
        await this.targetS3.batchCopy(
            copies.map(c => ({
                sourceBucket: c.sourceBucket, sourceKey: c.sourceKey,
                targetBucket: c.targetBucket, targetKey: c.targetKey
            }))
        );
    }

    public getShardState(): unknown {
        return {};
    }
}

export const S3Processor = Processor.createImplementation({
    implementation: S3ProcessorImpl,
    dependencies: [SourceS3Client, TargetS3Client, MigrationConfig]
});
```

Update the abstraction file's identifier names + token: `Core/S3Processor`. Update `feature.ts` const `S3ProcessorFeature`.

- [ ] **Step 3: Verify (errors should drop further)**

```
yarn ts-check 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: S3CopyExecutor → S3Processor (slice + execute, no onEnd)

S3Processor:
- extendContext returns { copyFile, getFile } slice. copyFile pushes
  S3Copy commands; getFile is async (network read).
- No onEnd — S3 has no derivable per-record default. Transformers
  call ctx.copyFile(...) explicitly when they want to emit a copy.
- execute drains S3Copy via TargetS3Client.batchCopy (unchanged).

Both source + target S3 clients still injected (source for getFile,
target for copy execution).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Merge + rewrite `OsProcessor` (subsumes `PutOsDynamoDbRecordExecutor`)

**Files:**
- Modify: `src/features/OsProcessor/OsProcessor.ts` — combine with `PutOsDynamoDbRecordExecutor`'s logic; new shape.
- Modify: `src/features/OsProcessor/abstractions/OsProcessor.ts` — `OsShardState` keyed by `touchedIndexes` stays.
- Delete: `src/features/PutOsDynamoDbRecordExecutor/`.
- Delete: `__tests__/features/PutOsDynamoDbRecordExecutor/` (test rewrite in Task 11).

- [ ] **Step 1: Rewrite `src/features/OsProcessor/OsProcessor.ts`**

```typescript
import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration";
import { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import { DdbExecutor } from "~/features/DdbExecutor/abstractions/DdbExecutor.ts";
import { OpenSearchClient } from "~/services/OpenSearchClient/abstractions/OpenSearchClient.ts";
import { GzipCompression } from "~/tools/GzipCompression/abstractions/GzipCompression.ts";
import { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { PutRecord } from "~/domain/transform/commands/PutRecord.ts";
import { isRetryableAwsError } from "~/base/index.ts";
import type { Commands } from "~/domain/transform/commands/Commands.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

const DEFAULT_RETRY_SCHEDULE = [5000, 10000, 20000, 30000, 30000];
const DEFAULT_REFRESH_INTERVAL = "1s";
const DISABLED_REFRESH_INTERVAL = "-1";
const DEFAULT_GZIP_CONCURRENCY = 16;

interface OsProcessorSlice {
    putRecord(record: Record<string, unknown>): void;
}

class OsProcessorImpl implements Processor.Interface<BaseTransformContext.Interface<unknown>, OsProcessorSlice> {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly ddbExecutor: DdbExecutor.Interface,
        private readonly osClient: OpenSearchClient.Interface,
        private readonly gzip: GzipCompression.Interface,
        private readonly touchedIndexes: TouchedIndexes.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public extendContext(base: BaseTransformContext.Interface<unknown>): OsProcessorSlice {
        if (this.config.storage !== "os") {
            throw new Error("OsProcessor can only be used in os mode");
        }
        const targetTable = this.config.target.opensearch.tableName;
        return {
            putRecord(record: Record<string, unknown>) {
                base.addCommand(PutRecord.create({ table: targetTable, record }));
            }
        };
    }

    public onEnd(ctx: BaseTransformContext.Interface<unknown> & OsProcessorSlice): void {
        ctx.putRecord(ctx.record as Record<string, unknown>);
    }

    public async execute(commands: Commands): Promise<void> {
        const puts = commands.get<PutRecord>(PutRecord.key);
        if (puts.length === 0) {
            return;
        }
        const gzippedPuts = await this.buildGzippedPuts(puts);
        const uniqueIndexes = new Set(puts.map(p => p.record.index as string));
        for (const indexName of uniqueIndexes) {
            await this.ensureIndex(indexName);
        }
        await this.ddbExecutor.execute(gzippedPuts);
    }

    public getShardState(): { touchedIndexes: TouchedIndexes.Item[] } {
        return { touchedIndexes: this.touchedIndexes.all() };
    }

    // Port from PutOsDynamoDbRecordExecutor verbatim:
    private async buildGzippedPuts(puts: PutRecord[]): Promise<PutRecord[]> { /* ... gzip with concurrency cap ... */ }
    private async ensureIndex(indexName: string): Promise<void> { /* ... touchedIndexes guard + withRetry ... */ }
    private async disableRefreshOnExisting(indexName: string): Promise<void> { /* ... */ }
    private async createNewIndex(indexName: string): Promise<void> { /* ... */ }
    private async withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> { /* ... classifier-gated ... */ }
    private isAlreadyExistsError(err: unknown): boolean { /* ... */ }
    private get retrySchedule(): number[] { /* ... config.tuning.os.retryScheduleMs ?? DEFAULT_RETRY_SCHEDULE ... */ }
    private get gzipConcurrency(): number { /* ... config.tuning.os.gzipConcurrency ?? DEFAULT_GZIP_CONCURRENCY ... */ }
}

export const OsProcessor = Processor.createImplementation({
    implementation: OsProcessorImpl,
    dependencies: [Logger, DdbExecutor, OpenSearchClient, GzipCompression, TouchedIndexes, MigrationConfig]
});
```

(Port the private methods from the current `PutOsDynamoDbRecordExecutor.ts` verbatim — they don't change.)

- [ ] **Step 2: Delete the old executor**

```bash
rm -rf src/features/PutOsDynamoDbRecordExecutor
rm -rf __tests__/features/PutOsDynamoDbRecordExecutor
```

- [ ] **Step 3: Verify**

```
yarn ts-check 2>&1 | grep "error TS" | wc -l
```

Errors should keep dropping.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: merge PutOsDynamoDbRecordExecutor into OsProcessor

OsProcessor now combines:
- The legacy OsProcessor's role (Processor for OS pipelines).
- The legacy PutOsDynamoDbRecordExecutor's logic (gzip + ensureIndex
  + delegate to DdbExecutor for the actual write).

Slice contributes { putRecord } (closes over OS DDB target table).
onEnd calls ctx.putRecord(ctx.record). execute does the heavy lifting:
gzip with concurrency cap → sequential ensureIndex → DdbExecutor.

PutOsDynamoDbRecordExecutor and its tests deleted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Slim `BaseTransformContext` + delete per-mode TransformContexts

**Files:**
- Modify: `src/features/TransformContext/abstractions/BaseTransformContext.ts` — drop `commands` from public ctx; keep `addCommand`, `record`, `original`, `replace`, `queryRecord<T>`, `modelProvider`, `cache`.
- Modify: `src/features/TransformContext/BaseTransformContextFactory.ts` — implement the slimmed interface; `commands` stays internal.
- Delete: `src/features/TransformContext/abstractions/DdbTransformContext.ts`.
- Delete: `src/features/TransformContext/abstractions/OsTransformContext.ts`.
- Delete: `src/features/TransformContext/DdbTransformContextFactory.ts`.
- Delete: `src/features/TransformContext/OsTransformContextFactory.ts`.

- [ ] **Step 1: Slim `BaseTransformContext.Interface`**

Drop `commands: Commands` from the public interface. Make `queryRecord` generic. Keep the Commands import internal.

- [ ] **Step 2: Update `BaseTransformContextFactory.create()`**

The factory still creates a `Commands` instance internally; it's kept inside the factory, only `addCommand` is exposed on the returned ctx. The runner accesses the internal bag via a side-channel (e.g., the factory returns `{ ctx, commands }` instead of just `ctx`).

Sketch:
```typescript
public create(params): { ctx: BaseTransformContext.Interface<TRecord>; commands: Commands } {
    const commands = new Commands();
    const ctx = {
        record: structuredClone(params.record),
        original: Object.freeze(structuredClone(params.record)),
        modelProvider: this.modelProvider,
        cache: this.cache,
        replace(newRecord) { ctx.record = newRecord; },
        addCommand(cmd: Command) { commands.add(cmd); },
        queryRecord: async <T>(pk: string, sk?: string): Promise<T | null> => {
            const results = await this.sourceDb.query(this.config.source.dynamodb.tableName, pk, sk);
            return (results.length > 0 ? results[0] : null) as T | null;
        }
    };
    return { ctx, commands };
}
```

The runner uses `commands` to drive processor.execute() at shard end + Commands.unclaimedKeys() for the warning.

- [ ] **Step 3: Delete the per-mode files**

```bash
rm src/features/TransformContext/abstractions/DdbTransformContext.ts
rm src/features/TransformContext/abstractions/OsTransformContext.ts
rm src/features/TransformContext/DdbTransformContextFactory.ts
rm src/features/TransformContext/OsTransformContextFactory.ts
```

- [ ] **Step 4: Verify**

```
yarn ts-check 2>&1 | grep "error TS" | wc -l
```

Note: errors will shift to PipelineRunner / PipelineBuilder / consumer code that referenced DdbTransformContext / OsTransformContext.

- [ ] **Step 5: Commit**

```bash
git add -A src/features/TransformContext
git commit -m "$(cat <<'EOF'
refactor(transform-context): single slim BaseTransformContext

Drops the per-mode DdbTransformContext / OsTransformContext interfaces
and their factories. The base ctx's public surface is:
{ record, original, addCommand, replace, queryRecord<T>, modelProvider,
  cache }

The raw commands bag is hidden — addCommand is the only public push.
The factory returns { ctx, commands } so the runner can still drive
processor.execute(commands) + Commands.unclaimedKeys().

Per-mode helpers (putRecord, copyFile, getFile) move to processor
slices in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: PipelineRunner + PipelineBuilder + Pipeline rewrite

**Files:**
- Modify: `src/features/PipelineRunner/abstractions/PipelineRunner.ts`
- Modify: `src/features/PipelineRunner/PipelineRunner.ts`
- Modify: `src/domain/pipeline/PipelineBuilder.ts`
- Modify: `src/domain/pipeline/Pipeline.ts`
- Create: `__tests__/domain/pipeline/PipelineBuilder.slices.test.ts` (type-test fixture).

- [ ] **Step 1: Add `NonEmptyArray` + helper types in PipelineRunner abstraction**

In `src/features/PipelineRunner/abstractions/PipelineRunner.ts`:

```typescript
export type NonEmptyArray<T> = readonly [T, ...T[]];

type ScannerImpl<TRecord, TShard> = ... // existing
type ProcessorImpl<TBase, TSlice> = Constructor<Processor.Interface<TBase, TSlice>> & { __abstraction: Abstraction<unknown> };

type SliceOf<P> = P extends ProcessorImpl<any, infer S> ? S : never;
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type MergeSlices<T extends readonly unknown[]> = UnionToIntersection<{ [K in keyof T]: SliceOf<T[K]> }[number]>;

type HasDuplicateSliceKeys<T extends readonly unknown[]> = ... // recursive check
type DisjointKeys<T extends readonly unknown[]> = HasDuplicateSliceKeys<T> extends true ? never : T;

type EffectiveContext<TRecord, TProcessors extends readonly unknown[]> =
    BaseTransformContext.Interface<TRecord> & MergeSlices<TProcessors>;

interface IPipelineRunner {
    pipeline<
        TRecord,
        TShard,
        TProcessors extends NonEmptyArray<ProcessorImpl<BaseTransformContext.Interface<TRecord>, any>>
    >(input: {
        name: string;
        scanner: ScannerImpl<TRecord, TShard>;
        processors: DisjointKeys<TProcessors>;
    }): PipelineBuilder<TRecord, EffectiveContext<TRecord, TProcessors>, TShard>;

    register(...pipelines: Pipeline<any, any, any>[]): this;
    run(opts?: RunOptions): Promise<void>;
    getProcessors(): Processor.Interface<BaseTransformContext.Interface<unknown>, any>[];
}
```

- [ ] **Step 2: Update `PipelineRunner.pipeline()` impl**

Resolve scanner + processors from impl classes via `Metadata.getAbstraction(impl)`. Build the `PipelineBuilder` with abstraction tokens internally. Run a sample `extendContext({} as Base)` per processor at build time? — NO, slice-collision detection is TS-only per spec. Skip runtime check.

- [ ] **Step 3: Per-record orchestration in runShard**

Sketch (PipelineRunner.runShard, simplified):

```typescript
for await (const record of scanner.scan(shard)) {
    const matched = false;
    for (const pipeline of mergeGroup.pipelines) {
        if (!pipeline.acceptsRecord(record)) { continue; }
        matched = true;
        const { ctx, commands } = baseContextFactory.create({ record });
        // Resolve processor instances + spread their slices over ctx
        const procInstances = pipeline.processors.map(t => container.resolve(t));
        const merged = procInstances.reduce<Record<string, unknown>>((acc, p) => {
            return p.extendContext ? { ...acc, ...p.extendContext(acc as any) } : acc;
        }, ctx as Record<string, unknown>);
        // Run filters (operate on record) — already passed via acceptsRecord above
        // Run transformers
        for (const t of pipeline.transformers) {
            await t(merged);
        }
        // Run onEnd hooks sequentially in array order
        for (const p of procInstances) {
            if (p.onEnd) { await p.onEnd(merged); }
        }
        break; // first-match-wins
    }
    if (!matched) { /* unmatched record metric */ }
}

// At shard end:
for (const p of allProcessorsInShard) {
    await p.execute(commandsBagForThatPipelineShard);
}
const unclaimed = commandsBag.unclaimedKeys();
if (unclaimed.length > 0) {
    logger.warn(`Pipeline "${pipeline.name}" emitted commands of types [${unclaimed}] but no processor drained them.`);
}
```

(Adapt to actual runner internals — sketch is intentional.)

- [ ] **Step 4: PipelineBuilder.build() takes no args**

In `src/domain/pipeline/PipelineBuilder.ts`:
- `.use(transformer)` types `transformer: (ctx: TCtx) => void | Promise<void>` where `TCtx = EffectiveContext<...>`.
- `.build()` no args; snapshots filters + transformers + processors into `Pipeline`.

- [ ] **Step 5: Pipeline holds `processors` field**

In `src/domain/pipeline/Pipeline.ts`:
- Add `readonly processors: readonly ProcessorImpl<...>[]`.
- Existing fields preserved.

- [ ] **Step 6: Type-test fixture**

`__tests__/domain/pipeline/PipelineBuilder.slices.test.ts` — see spec section "Type-test fixture":
- Single-processor pipeline → ctx has its slice.
- Multi-processor pipeline → ctx has union of slices.
- Missing processor → transformer using the missing helper fails to compile (`@ts-expect-error`).
- Two processors with same slice key → fails to compile (`@ts-expect-error`).
- Mismatched scanner/processor record types → fails.

- [ ] **Step 7: Verify (suite expected to be largely red but ts-check should pass)**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"
```

Goal: ts-check at 0 errors. (Tests are still broken because they call old shapes — fixed in Task 11.)

If ts-check has errors, walk through and fix in this task — runner/builder/pipeline must compile.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(runner+builder): NonEmptyArray + slice merging + sequential exec

PipelineRunner.pipeline({ name, scanner, processors }) accepts a
NonEmptyArray of processor Impl classes. Type system catches:
- empty array (NonEmptyArray<...>)
- slice-key collisions (DisjointKeys<...>)
- mismatched scanner/processor record types

EffectiveContext = BaseContext & MergeSlices<TProcessors> flows to
.filter() / .use() — transformers see the union of slice helpers.

Runtime per record: spread each processor's extendContext slice over
the base ctx; apply filter+transformers; run each processor's onEnd
sequentially in array order. At shard end: run each processor's
execute() sequentially in array order; check Commands.unclaimedKeys()
for warn.

PipelineBuilder.build() takes no args (terminal logic comes from
processor.onEnd).

Pipeline carries processors[] alongside filters/transformers.

Type-test fixture added.

Test suite still broken — tests rewritten in Task 11.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Restoration + cleanup

### Task 11: Bootstrap rewire + test rewrite

**Files:**
- Modify: `src/bootstrap.ts` — register the new processor set per mode.
- Modify: `__tests__/containers/ddb.ts`, `__tests__/containers/os.ts` — match bootstrap.
- Rewrite: tests for DdbProcessor, OsProcessor, S3Processor, BaseTransformContext, PipelineRunner integration.
- Rewrite: any test that referenced `DdbTransformContext` / `OsTransformContext` types.

This is a big task. Likely worth splitting into:
- 11a: Bootstrap + containers.
- 11b: Per-processor test rewrite (DdbProcessor, OsProcessor, S3Processor, TransformContext).
- 11c: PipelineRunner.test, PipelineBuilder.test, integration test.

After Task 11c, full suite returns to green.

(Implementer: report status after each sub-task; full re-verification at end.)

- [ ] **Step 1: bootstrap.ts**

DDB mode container registers (in this order, to keep DI clean):
- BaseTransformContextFactoryFeature, MigrationConfigFeature, LoggerFeature, etc.
- DdbExecutorFeature
- DdbProcessorFeature
- S3ProcessorFeature
- (no per-mode TransformContext factories anymore)

OS mode container registers:
- BaseTransformContextFactoryFeature, MigrationConfigFeature, LoggerFeature, etc.
- DdbExecutorFeature
- TouchedIndexesFeature
- OsProcessorFeature

- [ ] **Step 2: Update test containers** mirroring bootstrap.

- [ ] **Step 3: Rewrite per-processor unit tests**

Each processor's test file resolves the processor from a container, exercises:
- `extendContext(stubBase)` returns the right slice with the right closures (call helpers, assert command emitted via spy on addCommand).
- `onEnd(ctx)` (where applicable) emits the expected command.
- `execute(commands)` drains the right keys + delegates correctly.
- `getShardState()` returns the right shape.

- [ ] **Step 4: Rewrite PipelineRunner / PipelineBuilder tests**

Cover slice merge per record, sequential onEnd, sequential execute, unclaimedKeys warn, register dedup, etc.

- [ ] **Step 5: Rewrite integration test**

`__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` exercises a multi-processor pipeline end-to-end (DdbProcessor + S3Processor): assert both DDB writes AND S3 copies happen for a single fake record.

- [ ] **Step 6: Verify**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

Suite should be fully green here.

- [ ] **Step 7: Commit (or split into 3 commits per sub-task)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test+chore: rewire bootstrap + rewrite tests for new processor shape

Bootstrap registers the new per-command processors per mode:
- DDB: DdbExecutor + DdbProcessor + S3Processor.
- OS: DdbExecutor + OsProcessor + TouchedIndexes.

Test containers mirror bootstrap. All processor unit tests rewritten
against the new shape (extendContext, onEnd, execute). Runner +
builder tests cover slice merge, sequential onEnd/execute,
unclaimedKeys warn, dedup. Integration test exercises a multi-processor
DDB pipeline end-to-end.

Suite restored to green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Update `src/index.ts` + example.ts + templates

**Files:**
- Modify: `src/index.ts` — drop `BaseTransformContext` re-export was already there; drop `DdbTransformContext` + `OsTransformContext` re-exports (they're deleted); add `Processor` (with namespace), `BaseTransformContext`, `NonEmptyArray`, `initDataTransfer` + `InitDataTransferContext`.
- Modify: `src/presets/example.ts` — new processors[] shape, processors imported from `@webiny/data-transfer`.
- Modify: `templates/presets/example.ts` — same.
- Modify: `templates/projects/example/setup.ts` — new scaffold (commented placeholder).
- Modify: `templates/README.md` — document setup.ts + new processors[] shape.

- [ ] **Step 1: Public API delta**

`src/index.ts`:
```typescript
// Drop:
// export type { DdbTransformContext } from "...";
// export type { OsTransformContext } from "...";

// Add / keep:
export type { BaseTransformContext } from "./features/TransformContext/abstractions/BaseTransformContext.ts";
export { Processor } from "./domain/pipeline/abstractions/Processor.ts";
export type { NonEmptyArray } from "./features/PipelineRunner/abstractions/PipelineRunner.ts";
export { initDataTransfer, type InitDataTransferContext } from "./utils/initDataTransfer.ts";

// Per-processor exports stay:
export { DdbProcessor } from "./features/DdbProcessor/index.ts";
export { OsProcessor } from "./features/OsProcessor/index.ts";
export { S3Processor } from "./features/S3Processor/index.ts";
// scanner tokens stay
```

- [ ] **Step 2: Rewrite `src/presets/example.ts`**

```typescript
import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { S3Processor } from "~/features/S3Processor/index.ts";
import { createFilter } from "~/domain/pipeline/Filter.ts";
import { byType, isCmsEntry, isFmFile } from "~/domain/transform/filters.ts";
import { /* transformers */ } from "~/transformers/index.ts";

export const example: MigrationPreset = {
    name: "example",
    description: "Demonstrates per-pipeline processor composition.",
    configure(runner) {
        const fileSettings = runner
            .pipeline({ name: "FileSettings", scanner: DdbScanner, processors: [DdbProcessor] })
            .filter(createFilter(byType("fm.settings")))
            .use(/* ... */)
            .build();

        const files = runner
            .pipeline({ name: "Files", scanner: DdbScanner, processors: [DdbProcessor, S3Processor] })
            .filter(createFilter(isCmsEntry))
            .filter(createFilter(isFmFile))
            .use(/* ... */)
            .build();

        runner.register(fileSettings, files);
    }
};

export default example;
```

- [ ] **Step 3: Update template preset to mirror.**

- [ ] **Step 4: Add a setup.ts scaffold**

`templates/projects/example/setup.ts`:
```typescript
import { initDataTransfer } from "@webiny/data-transfer";

export default initDataTransfer(async ({ container }) => {
    // Register any custom processors / features here:
    //   container.register(MyCustomProcessor);
    //   container.register(MyCustomFeature);
    //
    // This file is OPTIONAL — delete it if you don't need custom DI wiring.
});
```

- [ ] **Step 5: Update `templates/README.md`** — add a "Custom processors" subsection explaining setup.ts + the slice contract.

- [ ] **Step 6: Verify**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(public-api): export Processor + BaseTransformContext + NonEmptyArray + initDataTransfer

- src/index.ts: drop deleted DdbTransformContext / OsTransformContext
  re-exports; add Processor (abstraction + namespace types),
  BaseTransformContext (slim), NonEmptyArray, initDataTransfer +
  InitDataTransferContext.
- src/presets/example.ts: rewrite to processors[] shape (DdbProcessor
  alone for FileSettings, [DdbProcessor, S3Processor] for Files).
- templates/presets/example.ts: mirror.
- templates/projects/example/setup.ts: new scaffold (commented).
- templates/README.md: document setup.ts + slice contract briefly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Section 2 (Public API)**

- Drop references to `DdbTransformContext` / `OsTransformContext`.
- Add `Processor`, `BaseTransformContext`, `NonEmptyArray`, `initDataTransfer` to the surface list.
- Note "user-side custom DI lives in setup.ts" with one sentence.

- [ ] **Step 2: Section 3 (project structure)**

- Drop `PutDynamoDbRecordExecutor/`, `PutOsDynamoDbRecordExecutor/`, `S3CopyExecutor/`, `DdbTransformContextFactory.ts`, `OsTransformContextFactory.ts` from the tree.
- Add `DdbExecutor/`, `S3Processor/`, updated `OsProcessor/` (now contains gzip/ensureIndex), and the `setup.ts` scaffold under `templates/`.

- [ ] **Step 3: Section 4 (Scanner/Processor/Executor description)**

Rewrite the Processor + Executor bullets:
- Processor = per-command-type unit. Has `extendContext` (optional), `onEnd` (optional), `execute`, `getShardState`.
- DdbProcessor / S3Processor / OsProcessor are the three concrete processors. DdbExecutor is shared infrastructure both DdbProcessor and OsProcessor compose.

- [ ] **Step 4: Section 6 (hard-won decisions)**

Add: "**Processors are per-command-type, slice-merged into the per-record context.**" Brief: cross-link the spec.

- [ ] **Step 5: Format + verify + commit**

```
yarn format:fix
yarn ts-check 2>&1 | grep -c "error TS"   # 0
yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3   # all green
```

```bash
git add AGENTS.md
git commit -m "$(cat <<'EOF'
docs(agents): reflect slice-merging processor architecture

- Section 2: drop DdbTransformContext/OsTransformContext from surface;
  add Processor, BaseTransformContext, NonEmptyArray, initDataTransfer.
  Note setup.ts as the user-side custom DI hook.
- Section 3: drop PutDynamoDbRecordExecutor/PutOsDynamoDbRecordExecutor/
  S3CopyExecutor; add DdbExecutor + S3Processor; update OsProcessor
  scope (now includes gzip+ensureIndex).
- Section 4: rewrite Processor description for the per-command-type
  shape; describe extendContext/onEnd/execute roles.
- Section 6: add the slice-merging-processors decision.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Format**

`yarn format:fix` — expect no pending changes after prior commits.

- [ ] **Step 2: ts-check clean**

`yarn ts-check 2>&1 | grep -c "error TS"` — expect `0`.

- [ ] **Step 3: Full test suite**

`yarn test 2>&1 | grep -E "Test Files|^\s+Tests " | tail -3` — expect all green.

- [ ] **Step 4: Smoke greps**

```
Grep "createContext"            in src __tests__   # only in scanner / preset config code, NOT on Processor
Grep "DdbTransformContext"       in src __tests__   # 0 hits
Grep "OsTransformContext"        in src __tests__   # 0 hits
Grep "PutDynamoDbRecordExecutor" in src __tests__   # 0 hits
Grep "PutOsDynamoDbRecordExecutor" in src __tests__ # 0 hits
Grep "S3CopyExecutor"            in src __tests__   # 0 hits
Grep "extendContext"             in src/features    # at least 3 hits (Ddb, Os, S3 Processors)
Grep "Processor.Interface"       in src             # used by all 3 processors
Grep "NonEmptyArray"             in src             # used in PipelineRunner abstraction
Grep "initDataTransfer"          in src             # used in src/index.ts + the cli loader
```

- [ ] **Step 5: Commit log review**

`git log --oneline -16` — expect 14 task commits + the spec + this plan.

No commit in this task.
