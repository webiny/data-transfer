# Fix Live Field Reconciler & CLI Command Menu — Design

**Status:** Approved 2026-09-04 (revised after review). Plans: `docs/superpowers/plans/2026-09-04-fix-live-reconciler.md`, `docs/superpowers/plans/2026-09-04-cli-command-menu.md`.
**Date:** 2026-09-04
**Builds on:** `docs/superpowers/specs/2026-04-22-os-transfer-preset-design.md` (`addLiveField`, `OsProcessor`), `docs/superpowers/specs/2026-05-08-guided-env-setup-design.md` (`TransferWizard`, projects dir), `docs/superpowers/specs/2026-04-23-dropped-record-log-design.md` (`.transfer/<runId>/` file layout), `docs/superpowers/specs/2026-04-19-aws-retry-design.md`.

---

## Goal

Two deliverables, shipped together:

1. **`fix-live` command** — a reconciler that scans an already-migrated v6 system and makes every CMS entry's `live` field consistent with its published state. Covers the DynamoDB table always, and the OpenSearch companion table when the system has one. Dry run first, live run only after a dry run has completed.
2. **CLI command menu** — `yarn transfer` with no arguments opens a guided menu over a registry of commands. Initial entries: the existing system-to-system transfer and the new `fix-live`. Prompts move from inquirer to `@clack/prompts` behind an abstraction so commands never touch a prompt library directly.

A third, much smaller change lands first and independently: the root-cause fix in `addLiveField` so future OS migrations stop producing the damage the reconciler repairs.

---

## Background

### The bug

`live` is `{ version: number } | null` on v6 CMS entry records. It tells v6 which revision is published without reading `P`.

`addLiveField` (`src/transformers/cms/addLiveField.ts`) computes it during migration. For records that are not themselves the published revision it calls `ctx.querySourceRecord(PK, "P")` and reads `published.version` from the **root** of the returned record.

- **DDB preset:** the source is the v5 main table. `version` is at the root. Correct.
- **OS preset:** the source is the v5 Elasticsearch companion table. `OsProcessor.querySourceRecord` (`src/features/OsProcessor/OsProcessor.ts:89-95`) returns the raw row: `{ PK, SK, index, data: { compression: "gzip", value }, _ct, _et, _md }`. `version` is inside the gzipped blob. The read returns `undefined`, so `data.live = { version: undefined }`, which JSON serialisation turns into `live: {}`. The entry is not live in the target OS index.

The exact scenario is an entry whose latest revision is a draft on top of an older published revision. The `P` document is correct (short-circuit path), the `L` document, which v6 lists, is wrong. Side effect: `undefined` is never cached (truthiness check on `cache.get`), so every affected record re-queries the source.

### What v6 actually maintains

Verified in `webiny-js-next`:

- `live` is declared entry-level: "Is this CMS Entry live (no matter the revision)" (`packages/api-headless-cms/src/types/types.ts:447`).
- **Publish** sets `live: { version }` on the record being published (`CreatePublishEntryDataFactory.ts:66`). The DDB storage operation writes it to that revision's `REV#` and to `P`, and, when publishing an older revision, rewrites `L` and the latest `REV#` with the entry-level meta fields (`api-headless-cms-ddb/src/operations/entry/index.ts:1140-1215`). The previously published `REV#` is rewritten with `status: unpublished` but keeps its **old** `live`.
- **Unpublish** sets `live: null` (`CreateUnpublishEntryDataFactory.ts:33`) and deletes `P`.
- **New revision / update** copies `live: originalEntry.live` (`CreateEntryRevisionFromDataFactory.ts:199`, `UpdateEntryDataFactory.ts:125`).

So the invariant v6 keeps is: **`L`, `P`, and the published `REV#` carry `live: { version: published }`**. Every other `REV#` carries a best-effort copy that v6 itself leaves stale. The reconciler enforces exactly the maintained invariant and does not touch the other `REV#` records, because there is no authoritative value to write there.

Confirmed facts from the discussion:

- The status value is `"published"`.
- An `L` record **may** legitimately carry `status: "published"`. The admin UI reads `L` only and needs to know.
- File Manager has no publishing. FM records never get `live`. That is correct behaviour, not a gap.

---

## Scope

### In scope

- **Transformer fix.** `addLiveField` reads `version` from the decompressed source record when the source is OS-shaped. Cache check no longer relies on truthiness. New OS-shaped fixture and a draft-over-published test.
- **`LiveFieldReconciler`** — pure decision logic over all records of one PK. Exhaustively unit tested.
- **`FixLiveCommand`** — the guided flow: project → system → v6 guard → metadata confirm → dry-run/live choice → run → summary.
- **DDB runner** — parallel segment scan for `L` records, one `queryAll(PK)` per entry, conditional `UpdateItem` writes.
- **OS runner** — same shape over the OS companion table, with decompress → patch → recompress.
- **Dry-run state** under `.transfer/state/`, and a JSONL change report per run under `.transfer/<runId>/`.
- **Command registry + clack menu**, `Prompts` and `UI` abstractions with stub implementations, existing `TransferWizard` moved under the registry. Existing `yarn transfer --config --preset` and `yarn transfer <folder>` invocations keep working.
- **`IDynamoDbClient` additions:** `updateAttribute` (conditional `UpdateItem`), `ScanOptions.limit`, `ScanOptions.sortKeyEquals`.
- Guides updated: `commands.md`, `troubleshooting.md`.

### Out of scope

- Reconciling `live` on `REV#` records other than the published one (see "What v6 actually maintains").
- Reconciling anything other than `live`, or any record that is not a CMS entry. FM, ACO, Form Builder untouched.
- Fixing the v6 OpenSearch **index** directly. The OS companion table is the write path; v6's indexer picks up table changes through its stream. See open question 2.
- Multi-process worker orchestration. Single process, parallel segments.
- Replacing inquirer inside `init` / `initProject`. They keep working and can migrate to `Prompts` later.
- Rollback. Every write is idempotent; re-running is the recovery path.

---

## Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | Detect v6 on the DDB table and refuse otherwise. Marker: CMS entry `L` record has a `data` object at the root. v5 keeps fields flat at the root. The OS table cannot be independently verified (v5 and v6 companion rows share the same outer and inner shape), so the OS runner runs only after the DDB guard passed for the same system. | Only v6 has `live`. Running against v5 would inject a foreign field. |
| 2 | OS table is patched in place, self-contained. `P` is looked up in the OS table, not derived from DDB. | Keeps each table's run independent. |
| 3 | Reconcile `L`, `P`, and the published `REV#` in both directions: fill missing, clear stale, correct wrong version. A clean dry run means those three records are in sync for every entry. Other `REV#` records are never written. | Matches the invariant v6 maintains. Writing anything else would exceed what the system of record guarantees. |
| 4 | Write only when certain. Any ambiguity is a `skipped` line with a reason, never a write. | Repair tool. A wrong "fix" is worse than no fix. |
| 5 | Live run recomputes from scratch. Dry run is a review gate, not a plan to replay. Soft warning when counts differ. No expiry. | Data may change between runs. |
| 6 | Console: spinner + summary counts only. JSONL report: every change and skip. | Tens of thousands of records. Console must stay readable. |
| 7 | Single process. Parallel DynamoDB scan segments from `pipeline.segments` in the project config, bounded by `--concurrency`. One report writer. | Repair tool does not need worker plumbing. |
| 8 | Only `data.live` changes. Writes use `UpdateItem` with a path expression, never a whole-record `PutItem`. | The document client is built with `convertEmptyValues: true` (`DynamoDbClient.ts:63-67`); a `PutItem` round-trip would turn every `""` into `NULL` and re-encode numbers. `UpdateItem` leaves untouched attributes byte-identical by DynamoDB's own guarantee. |
| 9 | Scan for `L` records only, then `queryAll(PK)` per entry to build the authoritative group. No reliance on scan ordering or PK locality. | DynamoDB does not document scan ordering. One query per entry is a bounded, predictable cost and removes an entire class of "group was incomplete" errors. |
| 10 | Condition every write on `_md` being unchanged since the read. `ConditionalCheckFailedException` is reported as `changed-during-run`, never retried. | Editors may publish during a run. Never overwrite a fresher record. |
| 11 | System selection shows region, DDB table, OS table, and account id, then a separate confirm. Source systems have no OS endpoint in the config schema (`unified.schema.ts:11-13`), so the endpoint is shown only for target. | A project can have two v6 systems (prod → dev copy). The v6 guard alone does not catch picking the wrong v6. |
| 12 | Unit tests on the pure decision function plus one dynalite integration test per table type. | Query grouping, conditional updates, and OS recompression cannot be covered by unit tests. |
| 13 | Command shape from `dependency-upgrader`, prompt abstractions from `prijevodi-online`. Yargs stays for flags. Exit 130 on cancel. | Non-interactive use must keep working for CI. |

---

## Part 1 — Transformer fix

### `addLiveField`

Preferred: make `OsProcessor.querySourceRecord` return the **decompressed** record (via the already-injected `OsRecordDecompressor`) so every OS-lane transformer sees the same shape a DDB-lane transformer would. `addLiveField` then only needs an integer guard on `published.version`.

Fallback, if changing the processor contract is judged too invasive: inside `addLiveField`, detect the compressed shape (`published.data?.compression`) and decompress with `ctx.compressionHandler.decompress` (available on `BaseTransformContext`, `BaseTransformContext.ts:19`) before reading `version`. Note that `published.data?.version` does **not** work as a fallback on its own, because `data` is `{ compression, value }` on the raw row.

In both variants `resolvePublishedVersion` accepts only a positive integer. Anything else logs at `warn` with the PK, caches `NO_PUBLISHED_REVISION`, and yields `live: null`. The transformer never emits `{ version: undefined }`.

Cache: replace `if (cached)` with `if (cached !== undefined)` (`Cache.get` returns `T | undefined`, `src/tools/Cache/abstractions/Cache.ts:4`). Update the "sentinel must be truthy" entry in `docs/hard-won-decisions.md` accordingly.

### Tests

- `__tests__/transformers/cms/addLiveField.test.ts`: OS-shaped source mock (gzipped `data`, no root `version`) for an `L` draft with `P` at version 2 → `live.version === 2`.
- Assert `live.version` is a number whenever `live` is non-null.
- Add a `status: "unpublished"` `L` case.
- Integration: `v5-to-v6-os` end to end with an `L` draft + `P` pair; expected OS document has `live: { version: 2 }`. Extend the golden expectation in `pipeline.preset.test.ts` or a sibling.

---

## Part 2 — `fix-live` reconciler

### 2.1 Record model

DDB table, within one PK:

| SK | Meaning | Present when |
| --- | --- | --- |
| `L` | Latest revision, what the admin UI lists | Always |
| `P` | Published revision | Entry is published |
| `REV#NNNN` | One per revision, `NNNN` = `String(version).padStart(4, "0")` (v6 `zeroPad`, so version 10000 → `REV#10000`) | One per revision |

`data.version` is a positive integer on every record. `data.status` on `L` is `"draft"`, `"unpublished"`, or `"published"`.

OS companion table: only `L` and `P`, each `{ PK, SK, index, data: { compression, value }, _ct, _et, _md }`. There is no root `TYPE`; it is inside the blob. `value` gzips the same `data` object the DDB record carries.

**CMS entry detection.** `isCmsEntry` (`src/domain/transform/filters.ts:40`) also matches File Manager rows (PK `#CMS#CME#`, modelId `fmFile` / `wbyFmFile`). The reconciler applies the same exclusion `addLiveField` uses (`INTERNAL_MODELS`, `addLiveField.ts:7`). Everything else `isCmsEntry` matches (ACO search records, background tasks stored as CMS entries, mailer settings) is a regular CMS entry in v6 that received `live` during migration, and is reconciled like any other.

### 2.2 `LiveFieldReconciler` (pure)

```ts
export interface ILiveFieldReconciler {
    decide(group: LiveFieldReconciler.Group): LiveFieldReconciler.Decision;
}

export const LiveFieldReconciler = createAbstraction<ILiveFieldReconciler>("FixLive/Reconciler");

export namespace LiveFieldReconciler {
    export type Interface = ILiveFieldReconciler;

    export interface Group {
        pk: string;
        table: "ddb" | "os";
        records: Map<string, BaseRecord>; // keyed by SK; OS records already decompressed
    }

    export interface LiveValue {
        version: number;
    }

    export interface Change {
        pk: string;
        sk: string;
        before: unknown; // current data.live, verbatim
        after: LiveValue | null;
        reason: ChangeReason;
        expectedMd: string; // _md at read time, for the write condition
    }

    export interface Skip {
        pk: string;
        sk?: string;
        reason: SkipReason;
        detail?: string;
    }

    export interface Decision {
        changes: Change[];
        skips: Skip[];
    }

    export type ChangeReason = "missing-live" | "empty-live" | "wrong-version" | "stale-live";

    export type SkipReason =
        | "no-latest-record"
        | "invalid-version"
        | "revision-record-missing"
        | "revision-version-mismatch"
        | "latest-status-contradicts-published"
        | "latest-status-contradicts-unpublished"
        | "decompress-failed"
        | "changed-during-run"; // emitted by the writer, not by decide()
}
```

`decide` is deterministic, synchronous, and performs no I/O. The runner guarantees the group is complete (see 2.3) before calling it.

#### Decision algorithm

```
L = records["L"]; P = records["P"]
if no L                                        → skip no-latest-record

if no P:
    if L.data.status === "published"           → skip latest-status-contradicts-unpublished
    expected = null
    reconcile(L, expected)                     # only L; REV# records untouched
else:
    v = P.data.version
    if v not a positive integer                → skip invalid-version
    if L.data.status === "published" and L.data.version !== v
                                               → skip latest-status-contradicts-published
    if L.data.version === v and L.data.status !== "published"
                                               → skip latest-status-contradicts-published
    if table === "ddb":
        rev = records["REV#" + pad(v)]
        if no rev                              → skip revision-record-missing
        if rev.data.version !== v              → skip revision-version-mismatch
    expected = { version: v }
    reconcile(L, expected); reconcile(P, expected)
    if table === "ddb": reconcile(rev, expected)

reconcile(record, expected):
    live = record.data.live
    if expected === null:
        if live is undefined or null           → no change
        else                                   → change stale-live (after = null)   # covers {} and {version}
    else:
        if live is undefined or null           → change missing-live
        if live is not an object with an integer version
                                               → change empty-live
        if live.version !== expected.version   → change wrong-version
        else                                   → no change
```

A skip aborts the whole group: no partial writes for a PK.

Only `data.live` is ever changed. Every `Change` carries `expectedMd` from the record as read so the writer can build its condition.

### 2.3 Runners

One abstraction, two implementations:

```ts
export interface ILiveFieldRunner {
    run(options: LiveFieldRunner.Options): Promise<LiveFieldRunner.Stats>;
}

export namespace LiveFieldRunner {
    export type Interface = ILiveFieldRunner;
    export type Mode = "dry-run" | "live";

    export interface Options {
        mode: Mode;
        report: ChangeReport.Interface;
        onProgress(stats: Stats): void;
    }

    export interface Stats {
        scanned: number;
        entries: number;
        changes: Record<LiveFieldReconciler.ChangeReason, number>;
        skips: Record<LiveFieldReconciler.SkipReason, number>;
        written: number;
        conditionFailed: number;
    }
}
```

| Runner | Table | Read | Write |
| --- | --- | --- | --- |
| `DdbLiveFieldRunner` | `<system>.dynamodb.tableName` | Scan `L` rows per segment, `queryAll(PK)` per entry | `updateAttribute` per change |
| `OsLiveFieldRunner` | `<system>.opensearch.tableName` | Same, then decompress `data` on every record | Recompress, `updateAttribute` per change |

The runner receives the `IDynamoDbClient` instance for the chosen system. Bootstrap already binds `SourceDynamoDbClient` and `TargetDynamoDbClient`; `FixLiveCommand` resolves the one matching `--system` and passes it in. Project config is loaded the same way `run/handler.ts` does today: `discoverConfig` → `loadConfig` → `bootstrap({ config, runId })`.

#### Read path

Per segment, with `--concurrency` segments in flight (default 4):

1. `client.scan(table, { segment, totalSegments, sortKeyEquals: "L" })`. The filter is server-side (`FilterExpression SK = :l`); it does not reduce consumed read capacity but does cut transfer and per-item work.
2. Skip rows where `!isCmsEntry(row)` or the modelId is in `INTERNAL_MODELS`. Count as `scanned`, not as `entries`.
3. `client.queryAll(table, row.PK)` → the authoritative group. Count as `entries`.
4. OS only: decompress `data` on every record in the group. Any failure → `skip decompress-failed` for the whole PK.
5. `reconciler.decide(group)`. Append every `Change` and `Skip` to the report. In `live` mode hand changes to the writer.

Memory is bounded by the largest single group, which is one entry's revision count.

#### Write path

New method on `IDynamoDbClient`:

```ts
updateAttribute(tableName: string, request: UpdateAttributeRequest): Promise<UpdateAttributeResult>;

export interface UpdateAttributeRequest {
    key: { PK: string; SK: string };
    path: string[];        // e.g. ["data", "live"]
    value: unknown;        // marshalled as-is; null allowed
    condition: { attribute: string; equals: unknown };
}

export type UpdateAttributeResult = "written" | "condition-failed";
```

Implemented with `UpdateCommand`, `UpdateExpression: "SET #p0.#p1 = :v"`, `ConditionExpression: "#c = :c"`. `ConditionalCheckFailedException` returns `"condition-failed"`; every other error propagates through the existing `executeWithRetry` wrapper. `ConditionalCheckFailedException` is not in the retryable set (`isRetryableAwsError.ts`), so it is never retried.

- **DDB:** `path: ["data", "live"]`, `value: change.after`.
- **OS:** the runner re-serialises the decompressed `data` with only `live` replaced, compresses it with `CompressionHandler.compress`, and writes `path: ["data"]`, `value: <compressed>`. The whole blob is replaced because it is one attribute; its decompressed content differs from what was read only in `live`. All root attributes other than `data` are untouched.

Condition in both cases: `{ attribute: "_md", equals: change.expectedMd }`. A `"condition-failed"` result is appended as `skip changed-during-run` and counted in `conditionFailed`.

Writes run with a bounded concurrency (default 8).

### 2.4 v6 guard

Runs on the DDB table before anything else, before the system confirm so the user is not asked to confirm a system that will be refused:

1. `client.scan(table, { segment, totalSegments, sortKeyEquals: "L", limit: 100 })` across up to 4 segments; take the first `isCmsEntry` row that is not an internal model.
2. If none found, continue scanning until one is found or 5 000 rows have been read.
3. `data` is an object at the root → v6, proceed.
4. `data` absent and `modelId` present at the root → v5. Refuse: "Table `<name>` in `<region>` holds v5 records. `fix-live` only runs against migrated v6 systems."
5. Neither → refuse: "Could not find a CMS entry record to verify the schema version."

The OS runner is enabled only when this guard passed for the same system in the same invocation.

### 2.5 State and report

```
.transfer/
  state/
    fix-live/
      <project>__<system>.json
  <runId>/
    fix-live-report.jsonl
    logs/orchestrator.log
```

```ts
export namespace FixLiveState {
    export interface RunSummary {
        runId: string;
        at: string; // ISO
        changes: number;
        skips: number;
    }
    export interface LiveRunSummary extends RunSummary {
        written: number;
        conditionFailed: number;
    }
    export interface File {
        lastDryRun?: RunSummary;
        lastLiveRun?: LiveRunSummary;
    }
}
```

The state file is written only when a dry run completes without an unhandled error. The live run reads it, refuses if `lastDryRun` is absent, and after completion sets `lastLiveRun`.

`ChangeReport` appends one JSON line per event as produced, so the file is a valid audit trail even if the run is interrupted. `FileTool` currently offers only `writeFileOrThrow`; add `appendLineOrThrow` (or an append stream) as part of this work.

```json
{"kind":"change","table":"ddb","pk":"T#root#CMS#CME#abc","sk":"L","reason":"missing-live","before":null,"after":{"version":2},"result":"dry-run"}
{"kind":"change","table":"os","pk":"T#root#CMS#CME#abc","sk":"P","reason":"empty-live","before":{},"after":{"version":2},"result":"written"}
{"kind":"skip","table":"ddb","pk":"T#root#CMS#CME#def","sk":"REV#0007","reason":"revision-version-mismatch","detail":"P.version=7 REV#0007.version=6"}
{"kind":"skip","table":"ddb","pk":"T#root#CMS#CME#ghi","sk":"L","reason":"changed-during-run"}
```

`result` is `"dry-run"`, `"written"`, or `"condition-failed"`.

Console summary:

```
Fix live field — dry run (project: acme, system: target)

  DynamoDB  acme-prod-ddb (eu-central-1)
    scanned          148 203
    cms entries       31 440
    changes            2 118   missing-live 1 902 · empty-live 201 · wrong-version 9 · stale-live 6
    skips                  4   revision-version-mismatch 3 · invalid-version 1

  OpenSearch  acme-prod-os (eu-central-1)
    scanned           62 880
    cms entries       31 440
    changes            2 103   empty-live 2 094 · stale-live 9
    skips                  0

Report: .transfer/20260904-091233/fix-live-report.jsonl
State:  .transfer/state/fix-live/acme__target.json

Run again and choose "live" to apply these changes.
```

On a live run, if the recomputed change count differs from `lastDryRun.changes`, print a warning with both numbers before the final confirm. It does not block.

### 2.6 Guided flow

```
◆ Select a project                        projects/* via discoverProjects()
◆ Which system?                           source | target
│                                         hint: "ddb: <table> · region: <r> · os table: <name or none>"
│  Checking schema version…               spinner; refuse on v5
◇ System summary                          note(): region, DDB table, OS table, OS endpoint (target only), account id
◆ This is the system whose records will be modified. Continue?   default: no
◆ Run mode                                dry run (default) | live
│                                         live disabled with hint "run a dry run first" when no state
│  (live only) Last dry run: 2 118 changes, 2026-09-04 09:12. Proceed?   default: no
│  Scanning DynamoDB… 148 203 rows / 31 440 entries      spinner with live counter
│  Scanning OpenSearch… 62 880 rows / 31 440 entries
◇ Summary                                 as above
└ Done.
```

Non-interactive:

```
yarn transfer fix-live --project=acme --system=target --dry-run
yarn transfer fix-live --project=acme --system=target --live --yes
yarn transfer fix-live --project=acme --system=target --dry-run --table=ddb
```

`--live` without a state file exits 1 with the same message the menu shows. `--yes` skips both confirms. `--table=ddb|os` restricts to one table; default is both.

---

## Part 3 — Command menu and prompt abstractions

### 3.1 Layout

`src/cli.ts` is the bin entry (`package.json` `bin`) and must stay. A sibling `src/cli/` directory would collide with it under module resolution, so the new pieces live under the existing `src/commands/`:

```
src/commands/
  registry/
    abstractions/Command.ts          # Command token + Command.Interface
    CommandRegistry.ts
    feature.ts
  prompts/
    abstractions/Prompts.ts
    abstractions/UI.ts
    ClackPrompts.ts
    ClackUI.ts
    feature.ts
  transfer/                          # today's `run/` — TransferWizard + handler, unchanged bodies
  fixLive/
    FixLiveCommand.ts
    feature.ts
    steps/
      selectProject.ts
      selectSystem.ts
      guardV6.ts
      confirmSystem.ts
      selectMode.ts
      runTable.ts
      summarise.ts
  init/  initProject/  processSegment/  updateSkills/   # untouched
__tests__/commands/prompts/
  StubPrompts.ts, StubUI.ts
```

Step modules export functions, matching `src/commands/init/steps/*.ts`.

### 3.2 `Command`

```ts
export interface ICommand {
    readonly name: string;          // yargs command, e.g. "fix-live"
    readonly description: string;   // menu + --help
    readonly hidden?: boolean;      // processSegment: not in the menu
    configure(yargs: Argv): Argv;
    run(argv: Command.Argv): Promise<number>; // exit code
}

export const Command = createAbstraction<ICommand>("Cli/Command");

export namespace Command {
    export type Interface = ICommand;
    export type Argv = Record<string, unknown>;
}
```

Commands are implementations of the same `Command` token, collected with `[Command, { multiple: true }]`, mirroring how processors share one token elsewhere. `CommandRegistry` resolves lazily so only the chosen command's dependencies are constructed.

### 3.3 Entry and backwards compatibility

```ts
const registry = container.resolve(CommandRegistry);
let cli = yargs(hideBin(process.argv)).scriptName("transfer");
for (const command of registry.list()) {
    cli = cli.command(command.name, command.description, y => command.configure(y), async argv => {
        process.exitCode = await command.run(argv);
    });
}
cli = cli.command("$0 [folder]", false, y => transfer.configure(y), async argv => {
    if (argv.folder) {                       // `yarn transfer my-folder` → init (today's behaviour)
        process.exitCode = await registry.get("init").run(argv);
        return;
    }
    if (argv.config || argv.preset) {        // `yarn transfer --config --preset` → transfer (today's behaviour)
        process.exitCode = await registry.get("transfer").run(argv);
        return;
    }
    process.exitCode = await openMenu(container, registry);
});
await cli.strict().help().parseAsync();
```

`openMenu` shows `ui.intro`, a `prompts.select` over non-hidden commands with `hint = description`, exits 130 on cancel, and runs the chosen command with empty argv so it prompts for everything.

Documented invocations in `docs/guides/commands.md` (`yarn transfer --config=… --preset=…`, `yarn transfer <folder>`) continue to work unchanged.

### 3.4 Prompt abstractions

`Prompts.Interface` offers `select`, `multiselect`, `confirm`, `text`; each returns `T | null`, `null` on cancel, and never exits. `UI.Interface` offers `intro`, `outro`, `note`, `cancel`, `spinner`, and `exitOnCancel<T>(value: T | null): T`, which calls `cancel("Cancelled.")` and `process.exit(130)` on `null`. Stubs in `__tests__/commands/prompts/` queue scripted answers.

Inquirer remains a dependency until `init` and `initProject` migrate. `ExitPromptError` handling stays inside those two commands.

---

## Public API impact

None. Nothing in `src/index.ts` changes. `IDynamoDbClient` gains `updateAttribute` and `ScanOptions` gains `limit` and `sortKeyEquals`; these are internal service abstractions.

---

## Documentation

- `docs/guides/commands.md`: "Command menu" section; `fix-live` section with guided flow, flags, state file, report format, the dry-run-before-live rule, and what is and is not reconciled.
- `docs/guides/troubleshooting.md`: "Published entries not showing as live after migration" → `fix-live`; note on `changed-during-run` and the contradiction skips.
- `AGENTS.md` §1 runtime flow: mention the menu. §8 open work: inquirer removal follow-up.
- `docs/hard-won-decisions.md`: add decisions 3, 4, 8, 9, 10; amend the cache-sentinel entry.

---

## Testing strategy

### Unit

- `LiveFieldReconciler.decide`: one test per branch, every `SkipReason` and `ChangeReason`, `table: "os"` skipping the `REV#` checks, other `REV#` records never appearing in `changes`, `{}` normalised in both directions, single-revision entries, version ≥ 10000 padding.
- `addLiveField`: DDB shape, OS shape, missing, non-integer.
- `CommandRegistry`: list, get, hidden filtering, lazy resolution.
- `FixLiveCommand` with `StubPrompts` / `StubUI`: cancel at each step → 130, live refused without state, `--yes` skips confirms, `--table` restriction.
- `updateAttribute` against `MockDynamoDbClient`: written vs condition-failed. **Note:** `MockDynamoDbClient.scan` shards round-robin by index (`MockDynamoDbClient.ts:17-33`). That is fine for this design since grouping uses `queryAll`, but the mock needs `sortKeyEquals` and `limit` support.

### Integration (dynalite)

- **DDB runner:** seed entries covering every outcome. Dry run → report lines match, table unchanged. Live run → table state and `result` values match. Mutate one record's `_md` between read and write via a test hook → `condition-failed`. Assert a non-`live` attribute containing `""` survives byte-identical.
- **OS runner:** seed gzipped `L`/`P` documents, same assertions, plus the written `data` decompresses to the read object with only `live` changed.
- **v6 guard:** a v5-shaped table is refused; an OS-only run without the DDB guard is refused.

### Golden

- Extend the OS preset expectation with `live` on a draft-over-published pair.

---

## Implementation order

1. Transformer fix + tests. Own changeset (`patch`).
2. `IDynamoDbClient.updateAttribute`, `ScanOptions.limit` / `sortKeyEquals`, mock client support, `FileTool.appendLineOrThrow`.
3. `LiveFieldReconciler` + exhaustive unit tests.
4. `ChangeReport` + `FixLiveState` store.
5. `DdbLiveFieldRunner` + dynalite test.
6. `OsLiveFieldRunner` + dynalite test.
7. `Prompts`, `UI`, clack implementations, stubs.
8. `Command`, `CommandRegistry`, new entry wiring, move `run/` to `transfer/`.
9. `FixLiveCommand` and steps.
10. Guides, `AGENTS.md`, hard-won decisions. Changeset (`minor`).

Steps 1 to 6 do not depend on 7 to 9 and can be exercised through a plain yargs command before the menu exists.

---

## Open questions

1. The OS companion table update relies on v6's DynamoDB stream to propagate into the OpenSearch index. Confirm the stream handler treats a `data`-only change as an index update. If not, a follow-up "touch" mechanism is needed.
2. Whether `fix-live` should also offer to report, without writing, the stale `live` copies on non-published `REV#` records, purely as diagnostics. Not needed for correctness; skipped unless asked for.
