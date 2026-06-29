import type { Container } from "@webiny/di";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import type { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/abstractions/PipelineBuilderFactory.ts";

/**
 * Context passed to `MigrationPreset.configure(...)`. Exposes:
 *
 * - `runner` — the `PipelineRunner` to register built pipelines against.
 * - `pipelineBuilderFactory` — typed `PipelineBuilder` factory; call
 *   `.create({ name, scanner, processors })` to start a new builder.
 * - `container` — the DI container, for advanced presets that need to
 *   resolve custom services registered via `config.register` or `setup.ts`.
 */
export interface PresetConfigureContext {
    runner: PipelineRunner.Interface;
    pipelineBuilderFactory: PipelineBuilderFactory.Interface;
    container: Container;
}

/**
 * A migration preset defines a collection of transformation pipelines
 * to register on the pipeline runner.
 */
export interface MigrationPreset {
    readonly name: string;
    readonly description: string;
    configure(ctx: PresetConfigureContext): void | Promise<void>;
}
