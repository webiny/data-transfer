# Writing a preset

A preset is the bridge between your config file and the DI container. It tells the runner which pipelines to register, which scanners + processors to use, and which transformers + filters to apply.

### Preset shape

A preset is an object with `{ name, description, configure }` exported as `default`. Use `createTransferPreset` for typed inference:

```typescript
import {
  createTransferPreset,
  DdbScanner,
  DdbProcessor,
  S3Processor,
  createFilter
} from "@webiny/data-transfer";
import { stampMigratedAt } from "./transformers/stampMigratedAt.ts";

export default createTransferPreset({
  name: "my-preset",
  description: "One-line description shown in CLI output.",
  configure({ runner, pipelineBuilderFactory }) {
    const pipeline = pipelineBuilderFactory
      .create({ name: "my-pipeline", scanner: DdbScanner, processors: [DdbProcessor, S3Processor] })
      .filter(createFilter(r => r.TYPE === "cms.entry"))
      .use(stampMigratedAt)
      .build();

    runner.register(pipeline);
  }
});
```

Drop the file in your `presets/` directory. The wizard will offer it by name alongside built-ins.

### `pipelineBuilderFactory.create({ name, scanner, processors })`

- **`name`** — unique string; the runner throws on duplicate names.
- **`scanner`** — `DdbScanner` or `OsScanner`. Determines which table is scanned and what `TRecord` shape flows through the chain.
- **`processors`** — `NonEmptyArray` of processor classes. Each processor contributes a **slice** of helpers onto the transformer context (see [Processor slices](#processor-slices) below). TS rejects empty arrays and processors whose slice keys collide (e.g. `DdbProcessor` + `OsProcessor` both contribute `putRecord`).

### Builder methods

| Method                         | Description                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.filter(f)`                   | Add a filter. Multiple calls AND-compose in evaluation order. Records that fail any filter are skipped.                                                                                                 |
| `.use(t)`                      | Add a transformer. Execution order matches registration order.                                                                                                                                          |
| `.blackhole()`                 | Observe-only mode — filters + transformers + `onEnd` still run but every emitted command is discarded. Nothing lands in the target. Pair with `debug.snapshot` to inspect what WOULD have been written. |
| `.beforeExecuteCommands(hook)` | Run a hook once per merge group before any shard runs.                                                                                                                                                  |
| `.afterExecuteCommands(hook)`  | Run a hook once after all shards in the merge group succeed. Skipped on shard failure.                                                                                                                  |
| `.build()`                     | Snapshot into an immutable `Pipeline`. Required before `runner.register()`.                                                                                                                             |

`runner.register(p1, p2, ...)` is variadic and chainable.

### Filters

`createFilter` wraps a predicate into a typed `Filter`. Write one inline or use a built-in predicate:

```typescript
import {
  createFilter,
  isFmFile,
  isCmsEntry,
  byType,
  byIncludesModelId
} from "@webiny/data-transfer";

// Built-in predicates — handle both raw v5 and post-wrapInData record shapes
.filter(createFilter(isFmFile))                           // file manager files
.filter(createFilter(isCmsEntry))                         // any CMS entry
.filter(createFilter(byType("cms.model")))                // exact TYPE match
.filter(createFilter(byIncludesModelId("article")))       // modelId contains "article"

// Inline predicate for anything custom
.filter(createFilter(r => r.TYPE === "cms.entry" && r.modelId === "article"))
```

**All built-in filter predicates** (import from `@webiny/data-transfer`):

| Predicate                   | Matches                                            |
| --------------------------- | -------------------------------------------------- |
| `byType(type)`              | `record.TYPE === type`                             |
| `byTypePrefix(prefix)`      | `record.TYPE.startsWith(prefix)`                   |
| `isCmsGroup`                | CMS group records                                  |
| `isCmsModel`                | CMS model records                                  |
| `isCmsEntry`                | CMS entry records                                  |
| `byIncludesModelId(target)` | `modelId` contains `target` (case-insensitive)     |
| `isAcoSearchRecord`         | ACO search records                                 |
| `isBackgroundTask`          | Webiny background task records                     |
| `isFmFile`                  | File manager file records                          |
| `isFlpRecord`               | Folder location permission records                 |
| `isBuiltInSecurityRole`     | Built-in roles (`full-access`, `anonymous`)        |
| `isSecurityTeam`            | Security team records                              |
| `isOsBackgroundTask`        | OS background task records (checks `data.modelId`) |
| `isOsMailerSettings`        | OS mailer settings records                         |
| `isAuditLogEntry`           | Audit log entry records                            |
| `isMigrationRecord`         | Migration tracking records                         |
| `isFormBuilderRecord`       | Form Builder records (forms + submissions)         |

Multiple `.filter()` calls on the same pipeline AND-compose — a record must pass all of them. Register more-specific filters before catch-alls.

### Multiple pipelines and first-match-wins

Pipelines sharing the same scanner run as a **merge group**. Within a group, the first pipeline whose filters all pass "wins" that record — subsequent pipelines skip it. Registration order is semantically significant.

```typescript
configure({ runner, pipelineBuilderFactory }) {
  // High-value entries: custom transformer chain
  const articles = pipelineBuilderFactory
    .create({ name: "articles", scanner: DdbScanner, processors: [DdbProcessor] })
    .filter(createFilter(r => r.TYPE === "cms.entry" && r.modelId === "article"))
    .use(migrateArticle)
    .build();

  // Everything else: verbatim copy
  const rest = pipelineBuilderFactory
    .create({ name: "rest", scanner: DdbScanner, processors: [DdbProcessor] })
    .build();

  runner.register(articles, rest); // order matters: articles checked first
}
```

Records that match no pipeline are dropped (see [Unmatched records](pipeline-runtime.md)).

### Zero-transformer preset (pure data copy)

```typescript
export default createTransferPreset({
  name: "copy",
  description: "Copy every record verbatim.",
  configure({ runner, pipelineBuilderFactory }) {
    const copyAll = pipelineBuilderFactory
      .create({ name: "copy-all", scanner: DdbScanner, processors: [DdbProcessor] })
      .build(); // no .filter → accepts all; no .use → no transformations

    runner.register(copyAll);
  }
});
```

`DdbProcessor.onEnd` emits a `PutRecord` for `ctx.record` at the end of each record — pure-passthrough pipelines still produce writes.

### Built-in presets

Select by name when the wizard asks "Which preset do you want to run?":

- **`"v5-to-v6-ddb"`** — full Webiny v5 → v6 migration of the primary DynamoDB table (CMS entries, file manager, security, mailer, folder permissions, etc.).
- **`"v5-to-v6-os"`** — migration of the OpenSearch companion DynamoDB table. Run **after** `v5-to-v6-ddb`.
- **`"copy-ddb"`** — verbatim DynamoDB + S3 copy (no transformations).
- **`"copy-os"`** — verbatim OpenSearch companion table copy (no transformations).
- **`"copy-files"`** — S3-only file copy.

Custom presets placed in your `presetsDir` are listed alongside built-ins.
