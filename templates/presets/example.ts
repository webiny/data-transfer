import type { MigrationPreset } from "@webiny/data-transfer";
import { createDdbPipeline, DdbScanner, DdbProcessor } from "@webiny/data-transfer";
import { stampMigratedAt } from "../transformers/stampMigratedAt.ts";

/**
 * Example custom preset.
 *
 * A preset is an object with `{ name, description, configure(runner) }`.
 * `configure` registers pipelines with the runner — each pipeline composes
 * a filter (optional) + a chain of transformers (optional).
 *
 * This preset registers ONE pipeline that accepts every scanned record and
 * stamps it with `migratedAt`. No filter = accept all. Plus one transformer.
 *
 * Swap in your own pipelines / transformers to build a real transfer.
 * For pure data copy (zero transformers), just omit the `.use(...)` call.
 */
const stampAll = createDdbPipeline("stamp-all", builder => {
    builder.use(stampMigratedAt);
});

const preset: MigrationPreset = {
    name: "example",
    description: "Copy every record from source to target, stamping migratedAt on the way.",
    configure(runner) {
        stampAll.register(runner, DdbScanner, DdbProcessor);
    }
};

export default preset;
