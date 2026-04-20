import type { MigrationPreset } from "~/domain/transform/Preset.ts";
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
} from "~/transformers/index.ts";
import { createFilter } from "~/domain/pipeline/Filter.ts";
import { byType, byTypePrefix, isCmsEntry, isFmFile } from "~/domain/transform/filters.ts";

export const v5ToV6Preset: MigrationPreset = {
    name: "example",
    description:
        "An example preset that demonstrates how to set up pipelines and filters for a migration.",
    configure(runner) {
        const fileSettingsPipeline = runner
            .pipeline({
                name: "FileSettings",
                processors: [DdbProcessor, S3Processor, CognitoUserProcessor],
                scanner: DdbScanner
            })
            // all types must be inferred from the processor and the scanner
            // so all filters and use methods must know that they will receive a DdbRecord (or whatever)
            // and that they will receive a DdbRecordContext (or whatever the context is) as the context
            .filter(createFilter(byType("fm.settings")))
            .use(wrapInData)
            .use(migrateFileManagerSettings)
            // illustrate that .filter() can be interleaved after .use() calls
            .filter(createFilter(byTypePrefix("fm.")))
            .use(removeAttributes)
            .build();

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
            .use(extractImageMetadata)
            .build();

        runner.register(fileSettingsPipeline, filePipeline);
    }
};

export default v5ToV6Preset;
