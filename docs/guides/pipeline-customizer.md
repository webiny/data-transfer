# Extending Built-in Presets with PipelineCustomizer

Built-in presets (`v5-to-v6-ddb`, `copy-ddb`, etc.) define a fixed set of
pipelines. **PipelineCustomizer** lets you extend any pipeline by name —
add filters to narrow which records it processes, add transformers for
custom post-processing — without forking the preset.

## Quick start

Create a class that implements `PipelineCustomizer.Interface`, wire it
with `createImplementation`, and register it in your `setup.ts`.

```typescript
// projects/my-project/setup.ts
import {
    initDataTransfer,
    PipelineCustomizer,
    createFilter,
    createDdbTransformer
} from "@webiny/data-transfer";

class SkipUnwantedModels implements PipelineCustomizer.Interface {
    public readonly name = "SkipUnwantedModels";

    public canUse(pipelineName: string): boolean {
        return pipelineName === "CmsEntries";
    }

    public configure(builder: PipelineCustomizer.Builder): void {
        builder.filter(
            createFilter(record => record.modelId !== "unwantedModel")
        );
    }
}

const SkipUnwantedModelsCustomizer = PipelineCustomizer.createImplementation({
    implementation: SkipUnwantedModels,
    dependencies: []
});

export default initDataTransfer(async ({ container }) => {
    container.register(SkipUnwantedModelsCustomizer);
});
```

Now, every time the `v5-to-v6-ddb` preset processes the `CmsEntries` pipeline,
records with `modelId === "unwantedModel"` are filtered out.

## Targeting multiple pipelines

`canUse()` receives the pipeline name. Return `true` for as many as you need:

```typescript
public canUse(pipelineName: string): boolean {
    return pipelineName === "CmsEntries" || pipelineName === "FileManagerFiles";
}
```

## Adding transformers

Use `.use()` on the builder to append transformers after the preset's own:

```typescript
public configure(builder: PipelineCustomizer.Builder): void {
    builder.use(
        createDdbTransformer("injectCustomField", async (ctx) => {
            // Custom post-processing after all preset transformers run
            ctx.record.data.values.customField = "injected";
        })
    );
}
```

Transformers have full access to the transform context — `ctx.querySourceRecord`,
`ctx.queryTargetRecord`, `ctx.copyFile`, `ctx.blackhole()`, etc. — depending on
which processors the pipeline uses. Do not call `ctx.putRecord()` manually —
the processor's `onEnd` hook already calls it automatically after transformers
complete; calling it from a transformer would result in a double write.

## Per-record blackholing with `ctx.blackhole()`

Sometimes you need to decide per-record — based on async lookups — whether
a record should be written to the target. Call `ctx.blackhole()` inside a
transformer to suppress all writes for that record:

```typescript
public configure(builder: PipelineCustomizer.Builder): void {
    builder.use(
        createDdbTransformer("skipExisting", async (ctx) => {
            const existing = await ctx.queryTargetRecord(
                ctx.record.PK,
                ctx.record.SK
            );
            if (existing.length > 0) {
                // Record already exists in target — skip the write
                ctx.blackhole();
            }
        })
    );
}
```

Semantics:
- Remaining transformers and `onEnd` hooks still run (side effects are preserved).
- All commands for this record are discarded — nothing is written to the target.
- The record appears in the blackholed logs and snapshot output.
- Irreversible — once called, the record is blackholed for this pass.

## Ordering

- **Filters:** your filters are AND'd after the preset's filters. The preset's
  filters run first; if they reject the record, your filters never execute.
- **Transformers:** your transformers run after the preset's transformers. The
  record has already been through `wrapInData`, `addGsiTenant`, etc. by the
  time your transformer sees it.
- **Multiple customizers:** if you register more than one customizer targeting
  the same pipeline, they apply in registration order.

## Unmatched pipeline warning

If your customizer's `canUse()` never matches any pipeline in the running
preset, a warning is logged using the customizer's `name` property:

```
PipelineCustomizer "SkipUnwantedModels" did not match any registered pipeline
```

This catches typos (e.g., `"CmsEntry"` instead of `"CmsEntries"`). The
transfer still proceeds. Choose a descriptive `name` so the warning is easy
to trace back to the right customizer class.

## Available pipeline names

### `v5-to-v6-ddb`

| Pipeline name        | Description                              |
|---------------------|------------------------------------------|
| MigrationRecords    | Migration metadata — blackholed          |
| AuditLogs           | Audit log entries                        |
| AcoSearchRecordsPage| ACO search records — blackholed          |
| ContentModelGroups  | CMS content model groups                 |
| BackgroundTasks     | Background task records — blackholed     |
| FileManagerSettings | File Manager settings                    |
| FileManagerFiles    | File Manager files (DDB + S3)            |
| MailerSettings      | Mailer settings                          |
| SecurityGroups      | Security groups → roles                  |
| SecurityTeams       | Security teams                           |
| CmsModels           | CMS model definitions                    |
| FolderPermissions   | FLP records                              |
| CmsEntries          | CMS entries (catch-all)                  |
| AdminUsers          | Admin user records                       |
| FormBuilderRecords  | Form Builder records — blackholed        |

### `v5-to-v6-os`

Consult `src/presets/v5-to-v6-os.ts` for current pipeline names.

### `copy-ddb`, `copy-os`, `copy-files`

Each has a single catch-all pipeline. Consult the respective preset file.

## Limitations

The customizer cannot change:

- **Scanner or processors** — these define pipeline identity.
- **Hooks** — `beforeExecuteCommands` / `afterExecuteCommands`.
- **Pipeline-level blackhole** — use a custom preset if you need to blackhole
  an entire pipeline.
- **Registration order** — pipelines are registered by the preset; first-match-wins
  order is preset-controlled.

For any of these, write a custom preset instead.
