import { join } from "node:path";
import { bootstrap } from "~/bootstrap.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";
import type { TouchedIndexes } from "~/features/TouchedIndexes/abstractions/TouchedIndexes.ts";
import { loadUserSetup } from "~/utils/loadUserSetup.ts";

export interface ProcessOsSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

interface OsShardStateShape {
    touchedIndexes: TouchedIndexes.Item[];
}

export async function handler(argv: ProcessOsSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    const container = bootstrap({ config });
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

    logger.info(`Processing shard ${argv.segment + 1}/${argv.total}...`);

    await runner.run({ segment: argv.segment, totalSegments: argv.total });

    // Collect touchedIndexes from OS processor(s) and write the
    // <segment>-indexes.json file that EnableRefreshHook already reads.
    const processors = runner.getProcessors();
    const merged = new Map<string, string>();
    for (const processor of processors) {
        const state = (processor as { getShardState(): OsShardStateShape }).getShardState();
        if (state && typeof state === "object" && Array.isArray(state.touchedIndexes)) {
            for (const item of state.touchedIndexes) {
                if (!merged.has(item.indexName)) {
                    merged.set(item.indexName, item.originalRefresh);
                }
            }
        }
    }

    const payload: TouchedIndexes.Item[] = Array.from(merged, ([indexName, originalRefresh]) => ({
        indexName,
        originalRefresh
    }));

    const transferDir = join(process.cwd(), ".transfer", argv.runId);
    container.resolve(DirectoryTool).create(transferDir);
    const stateFile = join(transferDir, `${argv.segment}-indexes.json`);
    container.resolve(FileTool).writeFileOrThrow(stateFile, JSON.stringify(payload));

    logger.info("Shard complete.");
}
