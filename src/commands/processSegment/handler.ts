import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { bootstrap } from "~/bootstrap.js";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.js";
import { Logger } from "~/tools/Logger/index.js";
import { PipelineRunner } from "~/features/PipelineRunner/index.js";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.js";
import { PresetLoader } from "~/features/PresetLoader/index.js";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.js";
import { BeforeLoadPresetHook, AfterLoadPresetHook } from "~/features/PresetLifecycle/index.js";
import { loadUserSetup } from "~/utils/loadUserSetup.js";
import { formatError } from "~/base/index.js";

export interface ProcessSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
    preset: string;
    logLevel?: string;
    dryRun?: boolean;
}

export async function handler(argv: ProcessSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    const resolvedLogLevel = (argv.logLevel ?? config.debug?.logLevel) as
        | "debug"
        | "info"
        | "warn"
        | "error"
        | undefined;
    const container = bootstrap({ config, runId: argv.runId, logLevel: resolvedLogLevel });
    container.registerInstance(TransferContext, { runId: argv.runId, dryRun: argv.dryRun });

    const logger = container.resolve(Logger).child(`[segment ${argv.segment}]`);
    const runner = container.resolve(PipelineRunner);
    const presetLoader = container.resolve(PresetLoader);

    await loadUserSetup(argv.config, container, logger);

    if (config.register) {
        await config.register(container);
    }

    const beforeLoadPreset = container.resolve(BeforeLoadPresetHook);
    await beforeLoadPreset.execute(config);

    const preset = await presetLoader.load(argv.preset);
    const pipelineBuilderFactory = container.resolve(PipelineBuilderFactory);
    await preset.configure({
        runner,
        pipelineBuilderFactory,
        container
    });
    pipelineBuilderFactory.warnUnmatchedCustomizers(logger);

    const afterLoadPreset = container.resolve(AfterLoadPresetHook);
    await afterLoadPreset.execute(config, preset);

    logger.info(
        `Processing shard ${argv.segment + 1}/${argv.total}${argv.dryRun ? " (DRY RUN)" : ""}...`
    );

    try {
        await runner.run({ segment: argv.segment, totalSegments: argv.total });
    } catch (error) {
        logger.error(
            `Shard ${argv.segment} failed: ${formatError(error, (resolvedLogLevel ?? "debug") === "debug")}`
        );
        process.exit(1);
    }

    const stats = runner.getShardStats();
    if (stats) {
        const statsDir = join(process.cwd(), ".transfer", argv.runId, "stats");
        await mkdir(statsDir, { recursive: true });
        await writeFile(
            join(statsDir, `segment-${argv.segment}.json`),
            JSON.stringify(stats),
            "utf8"
        );
    }

    logger.info("Shard complete.");
}
