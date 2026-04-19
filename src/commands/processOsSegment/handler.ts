import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bootstrap } from "~/bootstrap.ts";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { PresetLoader } from "~/features/PresetLoader/index.ts";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.ts";

export interface ProcessOsSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

interface OsShardStateShape {
    touchedIndexes: Record<string, string>;
}

export async function handler(argv: ProcessOsSegmentArgs): Promise<void> {
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

    // Collect touchedIndexes from OS processor(s) and write the
    // <segment>-indexes.json file that EnableRefreshHook already reads.
    const processors = runner.getProcessors();
    const merged: Record<string, string> = {};
    for (const processor of processors) {
        const state = (processor as { getShardState(): OsShardStateShape }).getShardState();
        if (state && typeof state === "object" && "touchedIndexes" in state) {
            for (const [indexName, refresh] of Object.entries(state.touchedIndexes)) {
                if (!(indexName in merged)) {
                    merged[indexName] = refresh;
                }
            }
        }
    }

    const transferDir = join(process.cwd(), ".transfer", argv.runId);
    await mkdir(transferDir, { recursive: true });
    const stateFile = join(transferDir, `${argv.segment}-indexes.json`);
    await writeFile(stateFile, JSON.stringify(merged), "utf-8");

    logger.info("Shard complete.");
}
