import { loadConfig } from "../features/MigrationConfig/loadConfig.ts";
import { processSegment } from "../process-segment.ts";

interface ProcessSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

export async function runProcessSegment(argv: ProcessSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    if (config.storage !== "ddb") {
        throw new Error(`process-segment requires storage: "ddb". Got: "${config.storage}"`);
    }
    await processSegment({
        runId: argv.runId,
        segment: argv.segment,
        total: argv.total,
        config
    });
}
