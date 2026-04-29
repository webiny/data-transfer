# OS Index Prefix — Design Spec

**Date:** 2026-04-23
**Branch:** bruno/feat/os-transfer

---

## Problem

OpenSearch index names are prefixed via `OPENSEARCH_INDEX_PREFIX` (and its aliases) read by
`getOpenSearchIndexPrefix()` from `@webiny/api-opensearch`. When transferring to a target cluster
that uses a different prefix, the `updateOsIndex` transformer calls `configurations.es()` which
internally reads that env var — so the generated target index name will be wrong unless the env var
reflects the target prefix before any records are processed.

Currently the OS transfer config has no field for the target index prefix, and nothing sets the env
var during the transfer run.

---

## Decision

Add a required `indexPrefix` field to `target.opensearch` in the OS config schema. A new
`OsIndexPrefixHook` implementing `BeforeTransferHook` writes the value to
`process.env.OPENSEARCH_INDEX_PREFIX` before workers are spawned. Workers inherit the env via
standard process inheritance.

Only the target prefix is needed. The source prefix is irrelevant because `updateOsIndex`
regenerates `record.index` from scratch via `configurations.es()` — the original source index name
is never reused.

---

## Architecture

### Config schema (`os.schema.ts`)

`osTargetAccountConfigSchema.opensearch` gains one new required field:

```typescript
indexPrefix: trimmedString()  // empty string = no prefix
```

Empty string is valid and means no prefix. The field must be present; omitting it is a validation
error so users are forced to be explicit.

### `OsIndexPrefixHook`

New file: `src/features/OsProcessor/OsIndexPrefixHook.ts`

Implements `BeforeTransferHook.Interface`. Resolves `MigrationConfig`, guards on
`config.storage === "os"` (no-op otherwise), then writes:

```typescript
process.env.OPENSEARCH_INDEX_PREFIX = config.target.opensearch.indexPrefix;
```

Registered in `OsProcessorFeature` alongside `OsProcessor`.

### Execution order

```
orchestrator: BeforeTransferHook.execute()   ← OsIndexPrefixHook sets env var
orchestrator: spawnWorker(segment 0)         ← execa inherits process.env
orchestrator: spawnWorker(segment 1)
...
worker:       updateOsIndex transformer      ← configurations.es() reads OPENSEARCH_INDEX_PREFIX ✓
```

`BeforeTransferHook` runs at line 73 of `handler.ts`; `spawnWorker` at line 75 — the env var is
always set before any worker process is forked.

### No changes needed

- `updateOsIndex` transformer — already calls `configurations.es()` which reads the env var
- `OsProcessor` — no changes
- `bootstrap.ts` — no changes

---

## Files to change

| File | Change |
|------|--------|
| `src/features/MigrationConfig/schemas/os.schema.ts` | Add `indexPrefix: trimmedString()` to `osTargetAccountConfigSchema.opensearch` |
| `src/features/OsProcessor/OsIndexPrefixHook.ts` | New — `BeforeTransferHook` impl |
| `src/features/OsProcessor/feature.ts` | Register `OsIndexPrefixHook` as `BeforeTransferHook` |
| `templates/projects/example/os.transfer.config.ts` | Add `indexPrefix: ""` to `target.opensearch` |
| `projects/v5-to-v6/os.transfer.config.ts` | Add `indexPrefix: ""` to `target.opensearch` |
| `src/features/MigrationConfig/createOsTransfer.ts` | Update JSDoc example |

---

## Out of scope

- Source index prefix stripping — not needed; target index is always regenerated from scratch
- DDB transfer — unaffected
- Filter refactor — separate initiative
