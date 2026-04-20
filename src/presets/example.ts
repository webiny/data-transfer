import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import {
    addGsiTenant,
    createMetadata,
    extractImageMetadata,
    fixBrokenStorageKeys,
    fixCmePk,
    migrateFileManagerSettings,
    removeAttributes,
    removeFolderRevision,
    removeLocale,
    transformRichText,
    updateModelIds,
    wrapInData
} from "~/transformers/index.js";
import { createFilter } from "@/src/index.js";
import { byType, isCmsEntry, isFmFile } from "~/domain/transform/filters.js";

export const v5ToV6Preset: MigrationPreset = {
    name: "example",
    description:
        "An example preset that demonstrates how to set up pipelines and filters for a migration.",
    configure(runner) {
        const fileSettingsPipeline = runner
            .pipeline({
                name: "FileSettings",
                processor: DdbProcessor,
                scanner: DdbScanner
            })
            // all types must be inferred from the processor and the scanner
            // so all filters and use methods must know that they will receive a DdbRecord (or whatever)
            // and that they will receive a DdbRecordContext (or whatever the context is) as the context
            .filter(createFilter(byType("fm.settings")))
            .use(wrapInData)
            .use(migrateFileManagerSettings)
            .filter(createFilter(oneMoreFilterWhichIsApplied))
            .use(removeAttributes);

        const filePipeline = runner
            .pipeline({
                name: "Files",
                // im still bothered by the fact that DdbProcessor is handling file transfers
                // any ideas?
                processor: DdbProcessor,
                scanner: DdbScanner
            })
            .filter(createFilter(isCmsEntry))
            .filter(createFilter(isFmFile))
            .use(wrapInData)
            .use(addGsiTenant)
            .use(removeLocale)
            .use(fixCmePk)
            .use(fixBrokenStorageKeys)
            .use(transformRichText)
            .use(updateModelIds)
            .use(removeFolderRevision)
            .use(removeAttributes)
            .use(createMetadata)
            .use(extractImageMetadata);

        // note that build should be executed by the runner
        // users should not be bothered with build()...
        runner.register(fileSettingsPipeline);
        runner.register(filePipeline);
    }
};

export default v5ToV6Preset;
