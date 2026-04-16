import { loadConfig } from "../features/MigrationConfig/loadConfig.ts";
import { processOsSegment } from "../process-os-segment.ts";

interface ProcessOsSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

export async function runProcessOsSegment(argv: ProcessOsSegmentArgs): Promise<void> {
    const config = await loadConfig(argv.config);
    if (config.storage !== "os") {
        throw new Error(`process-os-segment requires storage: "os". Got: "${config.storage}"`);
    }
    await processOsSegment({
        runId: argv.runId,
        segment: argv.segment,
        total: argv.total,
        config
    });
}
