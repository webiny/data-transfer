import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";

/**
 * A migration preset defines a collection of transformation pipelines
 * to register on the pipeline runner.
 */
export interface MigrationPreset {
    name: string;
    description: string;
    configure(runner: PipelineRunner.Interface): void;
}
