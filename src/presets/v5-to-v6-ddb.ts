import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { fmSettingsPipeline } from "./v5-to-v6/pipelines/fmSettings.ts";
import { fmFilePipeline } from "./v5-to-v6/pipelines/fmFile.ts";
import { mailerSettingsPipeline } from "./v5-to-v6/pipelines/mailerSettings.ts";
import { securityGroupsPipeline } from "./v5-to-v6/pipelines/securityGroups.ts";
import { securityTeamsPipeline } from "./v5-to-v6/pipelines/securityTeams.ts";
import { cmsModelPipeline } from "./v5-to-v6/pipelines/cmsModel.ts";
import { folderPermissionsPipeline } from "./v5-to-v6/pipelines/folderPermissions.ts";
import { cmsEntryPipeline } from "./v5-to-v6/pipelines/cmsEntry.ts";

export const v5ToV6Preset: MigrationPreset = {
    name: "v5-to-v6",
    description: "Webiny v5 to v6 migration with all necessary transformations",
    configure(runner: PipelineRunner.Interface): void {
        fmSettingsPipeline.register(runner, DdbScanner, DdbProcessor);
        fmFilePipeline.register(runner, DdbScanner, DdbProcessor);
        mailerSettingsPipeline.register(runner, DdbScanner, DdbProcessor);
        securityGroupsPipeline.register(runner, DdbScanner, DdbProcessor);
        securityTeamsPipeline.register(runner, DdbScanner, DdbProcessor);
        cmsModelPipeline.register(runner, DdbScanner, DdbProcessor);
        folderPermissionsPipeline.register(runner, DdbScanner, DdbProcessor);
        cmsEntryPipeline.register(runner, DdbScanner, DdbProcessor);
    }
};

export default v5ToV6Preset;
