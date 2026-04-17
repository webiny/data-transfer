interface ProcessOsSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
}

export async function handler(_argv: ProcessOsSegmentArgs): Promise<void> {
    throw new Error(
        "process-os-segment handler is temporarily disabled. " +
            "The legacy worker loop relied on PipelineRunner.processRecord() which was removed " +
            "during the runner-integration refactor (2026-04-17). " +
            "Re-enable as part of the worker-integration plan, which will rewrite this " +
            "handler around runner.runShard(mergeGroupId, shard) once that method lands."
    );
}
