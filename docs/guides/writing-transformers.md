# Writing transformers

A transformer is a function `(ctx) => void | Promise<void>` that mutates `ctx.record`. Wrap it with a factory for a named identity:

```typescript
import { createDdbTransformer } from "@webiny/data-transfer";
import type { DdbTransformContext } from "@webiny/data-transfer";

export const stampMigratedAt = createDdbTransformer(
  "stampMigratedAt",
  (ctx: DdbTransformContext.Interface) => {
    ctx.record.migratedAt = new Date().toISOString();
  }
);
```

Factory variants:

- **`createTransformer<TContext>(name, fn)`** — generic over any context type.
- **`createDdbTransformer(name, fn)`** — binds `DdbTransformContext.Interface` (Base + DdbProcessor slice + S3Processor slice).
- **`createOsTransformer(name, fn)`** — binds `OsTransformContext.Interface` (Base + OsProcessor slice).

### Context type aliases

Use the narrowest type that covers what your transformer needs:

| Type                                | Processors in pipeline         | When to use                                                                                                        |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `BaseTransformContext.Interface`    | any                            | Transformers that only touch `ctx.record`, `ctx.cache`, `ctx.logger`, etc. — no processor-specific helpers needed. |
| `DdbCoreTransformContext.Interface` | `DdbProcessor` only            | DDB transformers that need `querySourceRecord` / `queryTargetRecord` / `putRecord` but not S3 helpers.             |
| `DdbTransformContext.Interface`     | `DdbProcessor` + `S3Processor` | Default for v5-to-v6 DDB transformers that may call `ctx.copyFile` / `ctx.getFile`.                                |
| `OsTransformContext.Interface`      | `OsProcessor`                  | OS transformers. `ctx.record.data` is the decompressed payload (always present).                                   |

### Base context API

Available on every transformer context regardless of pipeline configuration:

| Member                   | Description                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `ctx.record`             | Mutable record. Transformers mutate this.                                                                           |
| `ctx.original`           | Frozen, deep-cloned pre-transform snapshot. Always present. Use for gate-checks or audit comparisons. Never modify. |
| `ctx.replace(newRecord)` | Replace `ctx.record` wholesale.                                                                                     |
| `ctx.addCommand(cmd)`    | Push a raw command to the command bag. Rarely needed in transformers — processor slice helpers are sugar over this. |
| `ctx.modelProvider`      | Loaded CMS models (from DB + `modelsDir` JSON files if set).                                                        |
| `ctx.cache`              | Shared `Map`-like cache, persists across records within a shard. Useful for deduplication.                          |
| `ctx.logger`             | Logger bound to the current worker. Use instead of `console.*` — respects configured log level.                     |
| `ctx.compressionHandler` | Gzip compression utility. Rarely needed directly.                                                                   |
| `ctx.blackhole()`        | Per-record blackholing — suppresses all writes for this record. Remaining transformers + `onEnd` still run.         |
| `ctx.isBlackholed`       | Read-only flag; `true` after `ctx.blackhole()` is called.                                                           |

### Processor slices

Each processor in the pipeline contributes additional helpers onto the context:

**`DdbProcessor` slice** (`DdbTransformContext`, `DdbCoreTransformContext`):

| Member                              | Description                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `ctx.putRecord(record)`             | Emit an extra `PutRecord` to the DDB target (beyond the auto-put at chain end). |
| `ctx.querySourceRecord<T>(pk, sk?)` | Query the source DDB primary table. Returns `null` if not found.                |
| `ctx.queryTargetRecord<T>(pk, sk?)` | Query the target DDB primary table. Returns `null` if not found.                |

**`S3Processor` slice** (`DdbTransformContext`):

| Member                               | Description                                                   |
| ------------------------------------ | ------------------------------------------------------------- |
| `ctx.copyFile(sourceKey, targetKey)` | Emit an S3 copy command.                                      |
| `ctx.getFile(key)`                   | Read a file from the source bucket. Returns `Buffer \| null`. |

**`OsProcessor` slice** (`OsTransformContext`):

| Member                              | Description                                                 |
| ----------------------------------- | ----------------------------------------------------------- |
| `ctx.putRecord(record)`             | Emit a `PutRecord` to the OS DDB target.                    |
| `ctx.querySourceRecord<T>(pk, sk?)` | Query the source OS DDB table. Returns `null` if not found. |
| `ctx.queryTargetRecord<T>(pk, sk?)` | Query the target OS DDB table. Returns `null` if not found. |

**Auto-put**: `DdbProcessor` and `OsProcessor` include an `onEnd` hook that emits a `PutRecord` for `ctx.record` at chain end. `S3Processor` has no `onEnd` — call `ctx.copyFile(...)` explicitly in your transformers.

### Built-in transformers

Ready-made transformers exported from `@webiny/data-transfer`:

#### `copyFileToTarget`

Emits a verbatim S3 copy for a file record — source key equals target key (`ctx.copyFile(key, key)`). Reads the key from `text@key` and handles both raw v5 and post-`wrapInData` record shapes.

```typescript
import {
  createTransferPreset,
  createFilter,
  isFmFile,
  copyFileToTarget,
  DdbScanner,
  DdbProcessor,
  S3Processor
} from "@webiny/data-transfer";

export default createTransferPreset({
  name: "ddb-verbatim",
  description: "Copy all DDB records verbatim, including S3 file objects.",
  configure({ runner, pipelineBuilderFactory }) {
    // File records: copy DDB record + S3 object
    const files = pipelineBuilderFactory
      .create({ name: "files", scanner: DdbScanner, processors: [DdbProcessor, S3Processor] })
      .filter(createFilter(isFmFile))
      .use(copyFileToTarget)
      .build();

    // Everything else: verbatim DDB copy
    const everything = pipelineBuilderFactory
      .create({ name: "everything", scanner: DdbScanner, processors: [DdbProcessor] })
      .build();

    runner.register(files, everything); // files MUST be registered first (first-match-wins)
  }
});
```

**Requires:** pipeline must include `S3Processor`. **Do not use** when you need a new key path (e.g. the v5→v6 `tenants/<id>/files/<key>` migration) — use the internal `createMetadata` transformer instead.

#### `replaceFileUrls`

Rewrites file-manager URLs in CMS rich-text and long-text fields from the source domain to the target domain. Requires a `fileUrls` block in your config root:

```typescript
export default createConfig({
  // ...source, target, pipeline as usual...
  fileUrls: {
    source: "https://old-cdn.example.com",
    target: "https://new-cdn.example.com"
  }
});
```

```typescript
import { replaceFileUrls } from "@webiny/data-transfer";

// In your preset:
.use(replaceFileUrls)
```

### Built-in processors

| Processor           | Slice helpers                                         | Notes                                                                |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| `DdbProcessor`      | `putRecord`, `querySourceRecord`, `queryTargetRecord` | Primary DDB table. Auto-puts `ctx.record`.                           |
| `S3Processor`       | `copyFile`, `getFile`                                 | S3 bucket. No auto-put; emit S3Copy via `ctx.copyFile`.              |
| `OsProcessor`       | `putRecord`, `querySourceRecord`, `queryTargetRecord` | OS DDB table. Auto-puts. Gzips on write, ensuresIndex.               |
| `AuditLogProcessor` | `putAuditLog`                                         | Writes to the audit log table. No-op when `target.auditLog` is null. |
