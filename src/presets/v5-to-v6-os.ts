import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";
import { cmsEntryOsPipeline } from "./v5-to-v6/pipelines/cmsEntryOs.ts";

export const v5ToV6OsPreset: MigrationPreset = {
    name: "v5-to-v6-os",
    description: "Webiny v5 to v6 OpenSearch migration — CMS entries",
    configure(runner: PipelineRunner.Interface): void {
        cmsEntryOsPipeline.register(runner, OsScanner, OsProcessor);
    }
};

export default v5ToV6OsPreset;
