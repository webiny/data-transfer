import type { MigrationPreset } from "@webiny/data-transfer";
import { DdbScanner, DdbProcessor } from "@webiny/data-transfer";
import { stampMigratedAt } from "../transformers/stampMigratedAt.ts";

/**
 * Example custom preset.
 *
 * A preset is an object with `{ name, description, configure(runner) }`.
 * `configure` builds pipelines via `runner.pipeline({...})` and registers
 * them with `runner.register(...)`.
 *
 * This preset registers ONE pipeline that accepts every scanned record and
 * stamps it with `migratedAt`. No `.filter()` = accept all. Plus one
 * transformer.
 *
 * Swap in your own pipelines / transformers to build a real transfer.
 * For pure data copy (zero transformers), just omit the `.use(...)` call.
 */
const preset: MigrationPreset = {
    name: "example",
    description: "Copy every record from source to target, stamping migratedAt on the way.",
    configure(runner) {
        const stampAll = runner
            .pipeline({ name: "stamp-all", scanner: DdbScanner, processors: [DdbProcessor] })
            .use(stampMigratedAt)
            .build();

        runner.register(stampAll);
    }
};

export default preset;
