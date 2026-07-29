import { createTransferPreset, DdbScanner, DdbProcessor } from "@webiny/data-transfer";
import { stampMigratedAt } from "../transformers/stampMigratedAt.ts";

/**
 * Example custom preset.
 *
 * A preset is an object with `{ name, description, configure(ctx) }`.
 * `configure` receives `{ runner, pipelineBuilderFactory, container }` and
 * builds pipelines via `pipelineBuilderFactory.create({...})`, then registers
 * them with `runner.register(...)`.
 *
 * This preset registers ONE pipeline that accepts every scanned record and
 * stamps it with `migratedAt`. No `.filter()` = accept all. Plus one
 * transformer.
 *
 * Swap in your own pipelines / transformers to build a real transfer.
 * For pure data copy (zero transformers), just omit the `.use(...)` call.
 *
 * `container` is available if you need to `container.resolve(...)` any
 * custom service registered via `config.register` or `setup.ts`.
 */
export default createTransferPreset({
  name: "example",
  description: "Copy every record from source to target, stamping migratedAt on the way.",
  async configure({ runner, pipelineBuilderFactory }) {
    const stampAll = await pipelineBuilderFactory
      .create({ name: "stamp-all", scanner: DdbScanner, processors: [DdbProcessor] })
      .use(stampMigratedAt)
      .build();

    runner.register(stampAll);
  }
});
