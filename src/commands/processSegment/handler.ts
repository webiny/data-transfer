import { bootstrap } from "~/bootstrap.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import { TenantLocales } from "~/features/TenantLocales/index.ts";
import { ModelProvider } from "~/features/ModelProvider/index.ts";
import { loadUserSetup } from "~/utils/loadUserSetup.ts";

export interface ProcessSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

export async function handler(argv: ProcessSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    const container = bootstrap({ config, runId: argv.runId });
    container.registerInstance(TransferContext, { runId: argv.runId });

    const logger = container.resolve(Logger).child(`[segment ${argv.segment}]`);
    const runner = container.resolve(PipelineRunner);
    const presetLoader = container.resolve(PresetLoader);

    await loadUserSetup(argv.config, container, logger);

    const preset = await presetLoader.load(config.pipeline.preset);
    await preset.configure({
        runner,
        pipelineBuilderFactory: container.resolve(PipelineBuilderFactory),
        container
    });

    const tenantLocales = container.resolve(TenantLocales);
    await tenantLocales.preload();
    await container.resolve(ModelProvider).preloadModels(tenantLocales.getMap());

    logger.info(`Processing shard ${argv.segment + 1}/${argv.total}...`);

    await runner.run({ segment: argv.segment, totalSegments: argv.total });

    logger.info("Shard complete.");
}
