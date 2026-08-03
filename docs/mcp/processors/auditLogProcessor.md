---
name: AuditLogProcessor
description: Writes audit-log entries scanned from the source table to a dedicated target audit-log table.
category: Processors
---

# AuditLogProcessor

**Import:** `import { AuditLogProcessor } from "@webiny/data-transfer";`

**What it does:** a narrow, opt-in persistence processor for Webiny's audit log records. It reads `config.target.auditLog?.dynamodb?.tableName` (nullable — audit log transfer is optional) and, when configured, queues writes to that dedicated table separately from the main `DdbProcessor` target table. `checkAccess()` returns `[]` (no check) when no audit log table is configured; otherwise it `describeTable`s the target audit log table the same way `DdbProcessor` does for its own table.

**Context slice it adds:**

- `ctx.putAuditLog(record)` — queues an `AuditLogPutRecord` command (`{ table: auditLogTableName, record }`), but only if **both** conditions hold: an audit log table name is configured, and `record.TYPE === "auditLog.log"`. If either check fails, the call is a silent no-op — this makes it safe to call unconditionally from `onEnd` without every transformer having to check record type or config first.

**Commands it handles:** `AuditLogPutRecord` (key `AUDIT_LOG_PUT_RECORD`). `execute()` returns immediately if no audit log table is configured; otherwise it maps each `AuditLogPutRecord` to a `PutRecord` (same `table`/`record`, just re-wrapped as the command type `DdbExecutor` understands) and forwards the batch to `DdbExecutor.execute()`. Note this processor does **not** respect `transferContext.dryRun` directly — the guard is purely the missing-table-name check (this differs from `DdbProcessor`/`OsProcessor`/`S3Processor`, all of which check `dryRun` explicitly).

**`onEnd` hook behavior:** automatically calls `ctx.putAuditLog(ctx.record)` after the pipeline's transformers run. Combined with the slice guard above, this means a pipeline using `AuditLogProcessor` only writes records that are still typed `auditLog.log` by the time `onEnd` fires and only if the target has an audit log table configured — otherwise the pipeline's `.blackhole(() => !config.target.auditLog?.dynamodb?.tableName)` pattern (see usage below) is the idiomatic way to make the intent explicit and avoid the runner's unclaimed-command warning when the table is absent.

**Usage in pipelineBuilderFactory.create():**

```typescript
import {
    createTransferPreset,
    DdbScanner,
    AuditLogProcessor,
    MigrationConfig,
    createFilter,
    isAuditLogEntry,
    coreFieldsTransformer,
    dataFieldsTransformer,
    storageShapeTransformer
} from "@webiny/data-transfer";

export default createTransferPreset({
    name: "my-preset-with-audit-logs",
    description: "Audit log transfer, gated on target.auditLog being configured.",
    async configure({ runner, pipelineBuilderFactory, container }) {
        const config = container.resolve(MigrationConfig);

        const auditLogs = await pipelineBuilderFactory
            .create({
                name: "AuditLogs",
                scanner: DdbScanner,
                processors: [AuditLogProcessor]
            })
            .filter(createFilter(isAuditLogEntry))
            .use(coreFieldsTransformer)
            .use(dataFieldsTransformer)
            .use(storageShapeTransformer)
            .blackhole(() => !config.target.auditLog?.dynamodb?.tableName)
            .build();

        runner.register(auditLogs);
    }
});
```

This mirrors the pattern used internally in the `v5-to-v6-ddb` preset (which composes the same three transformers as a single internal `auditLogTransformers` array, not part of the public API — the individual transformer functions above are the public equivalent). It must be registered **before** the `AcoSearchRecordsPage` and `CmsEntries` pipelines because audit log records share the same `acoSearchRecord` modelId prefix and would otherwise be claimed by those pipelines first (first-match-wins dispatch).
