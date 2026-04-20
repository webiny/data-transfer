import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { S3Processor } from "~/features/S3Processor/index.ts";
import { createFilter } from "~/domain/pipeline/Filter.ts";
import { byType, byTypePrefix, isCmsEntry, isFmFile } from "~/domain/transform/filters.ts";
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

/**
 * Canonical reference preset — demonstrates
 * `pipelineBuilderFactory.create({...})` composition under the slice-merging
 * processor model.
 *
 * Two pipelines are registered:
 *
 * 1. `FileSettings` — a single-processor pipeline (`[DdbProcessor]`) that
 *    transforms `fm.settings` records into the new KeyValueStore shape and
 *    cleans up every remaining `fm.*` record.
 *
 * 2. `Files` — a multi-processor pipeline (`[DdbProcessor, S3Processor]`) that
 *    migrates File Manager file entries. It uses the S3 slice (`ctx.copyFile`,
 *    `ctx.getFile`) via the `createMetadata` + `extractImageMetadata`
 *    transformers, hence the S3Processor in `processors: [...]`.
 *
 * Note: transformers created with `createDdbTransformer` expect the full
 * DDB + S3 slice (`DdbTransformContext`). Keep `S3Processor` in the pipeline
 * whenever you .use() those transformers; pipelines with only the DDB slice
 * are free to .use() plain `createTransformer<BaseTransformContext>` ones.
 */
export const example: MigrationPreset = {
    name: "example",
    description:
        "Canonical reference preset — demonstrates pipelineBuilderFactory.create({...processors}) composition.",
    configure({ runner, pipelineBuilderFactory }) {
        const fileSettingsPipeline = pipelineBuilderFactory
            .create({
                name: "FileSettings",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(byType("fm.settings")))
            .use(wrapInData)
            .use(migrateFileManagerSettings)
            // illustrate that .filter() can be interleaved after .use() calls
            .filter(createFilter(byTypePrefix("fm.")))
            .use(removeAttributes)
            .build();

        const filePipeline = pipelineBuilderFactory
            .create({
                name: "Files",
                scanner: DdbScanner,
                processors: [DdbProcessor, S3Processor]
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

export default example;
