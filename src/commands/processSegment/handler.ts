import { bootstrap } from "~/bootstrap.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";

export interface ProcessSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

export async function handler(argv: ProcessSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    const container = bootstrap({ config });
    container.registerInstance(TransferContext, { runId: argv.runId });

    const logger = container.resolve(Logger).child(`[segment ${argv.segment}]`);
    const runner = container.resolve(PipelineRunner);
    const presetLoader = container.resolve(PresetLoader);

    const preset = await presetLoader.load(config.pipeline.preset);
    preset.configure(runner);

    logger.info(`Processing shard ${argv.segment + 1}/${argv.total}...`);

    await runner.run({ segment: argv.segment, totalSegments: argv.total });

    logger.info("Shard complete.");
}
