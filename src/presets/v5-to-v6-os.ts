import { createTransferPreset } from "~/utils/createTransferPreset.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";
import { createFilter } from "~/domain/pipeline/Filter.ts";
import {
    isCmsEntry,
    isFmFile,
    isOsBackgroundTask,
    isOsMailerSettings
} from "~/domain/transform/filters.ts";
import { osCmsEntryTransformers } from "~/transformers/index.ts";

export default createTransferPreset({
    name: "v5-to-v6-os",
    description: "Webiny v5 to v6 migration — OpenSearch DDB table.",
    configure({ runner, pipelineBuilderFactory: factory }): void {
        // ========================================================================
        // Background Tasks — blackhole
        // IMPORTANT: Must be registered BEFORE CmsEntries — background tasks are
        // CMS entries in the OS table and would be written by the catch-all pipeline.
        // ========================================================================
        const backgroundTasks = factory
            .create({
                name: "BackgroundTasks",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isOsBackgroundTask))
            .blackhole()
            .build();

        // ========================================================================
        // Mailer Settings — blackhole
        // v6 stores mailer settings in the KV store; the DDB preset handles
        // the actual DDB → KV migration. OS records have no v6 target.
        // IMPORTANT: Must be registered BEFORE CmsEntries.
        // ========================================================================
        const mailerSettings = factory
            .create({
                name: "MailerSettings",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isOsMailerSettings))
            .blackhole()
            .build();

        // ========================================================================
        // File Manager Files
        // IMPORTANT: Must be registered BEFORE CmsEntries (fmFile satisfies
        // isCmsEntry via TYPE prefix)
        // ========================================================================
        const fileManagerFiles = factory
            .create({
                name: "FileManagerFiles",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isFmFile))
            .use(osCmsEntryTransformers)
            .build();

        // ========================================================================
        // CMS Entries — catch-all
        // ========================================================================
        const cmsEntries = factory
            .create({
                name: "CmsEntries",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isCmsEntry))
            .use(osCmsEntryTransformers)
            .build();

        // ========================================================================
        // Register — order is load-bearing (first-match-wins)
        // ========================================================================
        runner
            .register(backgroundTasks)
            .register(mailerSettings)
            .register(fileManagerFiles)
            .register(cmsEntries);
    }
});
