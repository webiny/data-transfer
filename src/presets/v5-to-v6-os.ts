import { createTransferPreset } from "~/utils/createTransferPreset.js";
import { OsScanner } from "~/features/OsScanner/index.js";
import { OsProcessor } from "~/features/OsProcessor/index.js";
import { MigrationConfig } from "~/features/MigrationConfig/index.js";
import { createFilter } from "~/domain/pipeline/Filter.js";
import {
    isAcoSearchRecord,
    isCmsEntry,
    isFmFile,
    isOsBackgroundTask,
    isOsMailerSettings
} from "~/domain/transform/filters.js";
import { addLiveField, osCmsEntryTransformers, replaceFileUrls } from "~/transformers/index.js";

export default createTransferPreset({
    name: "v5-to-v6-os",
    description: "Webiny v5 to v6 migration — OpenSearch DDB table.",
    async configure({ runner, pipelineBuilderFactory: factory, container }) {
        const config = container.resolve(MigrationConfig);
        const acoSearchRecords = await factory
            .create({
                name: "AcoSearchRecords",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isAcoSearchRecord))
            .blackhole()
            .build();
        // ========================================================================
        // Background Tasks — blackhole
        // IMPORTANT: Must be registered BEFORE CmsEntries — background tasks are
        // CMS entries in the OS table and would be written by the catch-all pipeline.
        // ========================================================================
        const backgroundTasks = await factory
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
        const mailerSettings = await factory
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
        const fileManagerFiles = await factory
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
        const cmsEntries = await factory
            .create({
                name: "CmsEntries",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .filter(createFilter(isCmsEntry))
            .use(osCmsEntryTransformers)
            .use(addLiveField)
            .use(replaceFileUrls(config))
            .build();

        // ========================================================================
        // Register — order is load-bearing (first-match-wins)
        // ========================================================================
        runner
            .register(acoSearchRecords)
            .register(backgroundTasks)
            .register(mailerSettings)
            .register(fileManagerFiles)
            .register(cmsEntries);
    }
});
