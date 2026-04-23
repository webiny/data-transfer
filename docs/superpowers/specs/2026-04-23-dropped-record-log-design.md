# Dropped Record Log — Design Spec

**Date:** 2026-04-23
**Branch:** bruno/feat/os-transfer

---

## Problem

Records that don't match any pipeline and records that are routed through a blackhole pipeline
are silently discarded. The drop count appears in the shard-end log line, but there is no
persistent file listing which records were dropped and why. When debugging a transfer, operators
have no way to inspect what was dropped without enabling the full snapshot mode.

---

## Decision

Add an always-on `DroppedRecordLog` DI service that accumulates dropped records during a shard
scan and flushes a human-readable `.log` file at shard end. Two drop reasons are tracked:
`UNMATCHED` (no pipeline accepted the record) and `BLACKHOLED` (a blackhole pipeline accepted
it and discarded its commands). Files are only created for shards that actually had drops.

---

## Architecture

### `RecordDisposition` (`src/domain/pipeline/RecordDisposition.ts`)

Discriminated result classes returned by `PipelineRunner.runRecord`. Replaces the current
`void` return — a boolean would tell you nothing; these classes are self-documenting and
extensible (e.g. `Errored` can be added later without touching call sites).

```typescript
export namespace RecordDisposition {
    export class Processed {}

    export class Blackholed {
        public constructor(readonly pipelineName: string) {}
    }

    export class Unmatched {}
}
```

Exported from `src/domain/pipeline/index.ts`.

### `DroppedRecordLog` (`src/features/DroppedRecordLog/`)

New DI service. Accumulates formatted lines per shard; flushes to disk on demand.

**Abstraction:**

```typescript
interface IDroppedRecordLog {
    add(record: unknown, disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched): void;
    flush(segment: number): void;
}
```

**Implementation:**

- `add` formats the line immediately and pushes to an internal `string[]` buffer.
- `flush(segment)` writes `.transfer/<runId>/segment-{n}-dropped.log`, then clears the buffer.
  No-op (no file created) if the buffer is empty.
- Dependencies: `TransferContext`, `DirectoryTool`, `FileTool`.

**Line format:**

```
[UNMATCHED] [fmFile] T#root#FM#F#abc : L : cms.entry.l
[BLACKHOLED] [webinyTask] T#root#TASK#123 : L : webinyTask
[UNMATCHED] [cms.group] T#root#CMS#CMG#xyz : A
```

Format rules:
- Tag: `[UNMATCHED]` or `[BLACKHOLED]`
- If record has `modelId` (top-level or nested under `data`): `[modelId] PK : SK : TYPE`
- If no `modelId`: `[TYPE] PK : SK`

**Format function:**

```typescript
function formatLine(
    record: unknown,
    disposition: RecordDisposition.Blackholed | RecordDisposition.Unmatched
): string {
    const r = record as Record<string, unknown>;
    const data = r.data as Record<string, unknown> | undefined;
    const modelId = (r.modelId ?? data?.modelId) as string | undefined;
    const pk = (r.PK ?? "") as string;
    const sk = (r.SK ?? "") as string;
    const type = (r.TYPE ?? "?") as string;
    const tag = disposition instanceof RecordDisposition.Blackholed ? "BLACKHOLED" : "UNMATCHED";
    const body = modelId
        ? `[${modelId}] ${pk} : ${sk} : ${type}`
        : `[${type}] ${pk} : ${sk}`;
    return `[${tag}] ${body}`;
}
```

**File path:** `.transfer/<runId>/segment-{n}-dropped.log`

### `PipelineRunner` changes

`runRecord` currently returns `Promise<void>`. Change to
`Promise<RecordDisposition.Processed | RecordDisposition.Blackholed>`:

- Returns `new RecordDisposition.Processed()` on the normal path.
- Returns `new RecordDisposition.Blackholed(pipeline.name)` when `pipeline.isBlackhole`.

The caller (`runShard`) handles logging:

```typescript
// inside the pipeline-match loop:
const result = await this.runRecord(pipeline, processors, record, shardCommands, shardCtx);
if (result instanceof RecordDisposition.Blackholed) {
    this.droppedLog.add(record, result);   // original pre-transform record
}

// outside the loop, !matched branch:
if (!matched) {
    droppedCount++;
    this.droppedLog.add(record, new RecordDisposition.Unmatched());
}

// at shard end, after warnUnclaimedKeys:
this.droppedLog.flush(shardCtx.segment);
```

Key: the **original** `record` (pre-transform) is passed to `add` in both cases, so the log
reflects the source data not the transformer output.

`DroppedRecordLog` is injected into `PipelineRunner` as a constructor dependency.

---

## Files to create / modify

| File | Change |
|------|--------|
| `src/domain/pipeline/RecordDisposition.ts` | New — `Processed`, `Blackholed`, `Unmatched` classes |
| `src/domain/pipeline/index.ts` | Export `RecordDisposition` |
| `src/features/DroppedRecordLog/abstractions/DroppedRecordLog.ts` | New — abstraction |
| `src/features/DroppedRecordLog/abstractions/index.ts` | New — barrel |
| `src/features/DroppedRecordLog/DroppedRecordLog.ts` | New — implementation |
| `src/features/DroppedRecordLog/feature.ts` | New — feature registration |
| `src/features/DroppedRecordLog/index.ts` | New — barrel |
| `src/features/PipelineRunner/PipelineRunner.ts` | Add dep, change `runRecord` return, add log calls + flush |
| `src/features/PipelineRunner/feature.ts` | Add `DroppedRecordLog` to dependencies |
| `src/bootstrap.ts` | Register `DroppedRecordLogFeature` |
| `__tests__/containers/ddb.ts` | Add `DroppedRecordLogFeature` |
| `__tests__/containers/os.ts` | Add `DroppedRecordLogFeature` |
| `__tests__/integration/integrationContainer.ts` | Add `DroppedRecordLogFeature` |

---

## Relationship to existing snapshot writer

`PipelineRunner` already calls `snapshotWriter.write('dropped/segment-{n}.jsonl', record)` for
unmatched records, but this is gated on `config.debug.snapshot` and writes full JSON. That call
is preserved as-is — the two mechanisms serve different purposes: snapshot is full-fidelity
debug output; the dropped log is a lightweight always-on operational record.

---

## Out of scope

- Log rotation or size limits
- Merging per-segment files into a single file by the orchestrator
- Logging transformer errors (a separate `Errored` disposition can be added later)
- `Processed` records (no log entry — only drops are recorded)
