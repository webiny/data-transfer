import { createTransferPreset } from "~/utils/createTransferPreset.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { S3Processor } from "~/features/S3Processor/index.ts";
import { AuditLogProcessor } from "~/features/AuditLogProcessor/index.ts";
import { MigrationConfig } from "~/features/MigrationConfig/index.ts";
import { createFilter } from "~/domain/pipeline/Filter.ts";
import {
    byType,
    isAcoSearchRecord,
    isAuditLogEntry,
    isBackgroundTask,
    isBuiltInSecurityRole,
    isCmsEntry,
    isCmsGroup,
    isCmsModel,
    isFlpRecord,
    isFmFile,
    isSecurityTeam
} from "~/domain/transform/filters.ts";
import {
    addGsiTenant,
    addLiveField,
    auditLogTransformers,
    cmsEntryTransformers,
    createMetadata,
    extractImageMetadata,
    groupsToRoles,
    migrateFileManagerSettings,
    migrateMailerSettings,
    removeAttributes,
    removeLocale,
    renameFieldAttributes,
    transformModelGroup,
    transformPermissions,
    updateFlpIds,
    wrapInData
} from "~/transformers/index.ts";
// ============================================================================
// Webiny v5 to v6 Migration Preset
// ============================================================================

/**
 * Preset for migrating all Webiny v5 data to v6 format.
 * This includes:
 * - File Manager settings and files
 * - Mailer settings
 * - Security groups → roles
 * - Security teams
 * - CMS models
 * - CMS entries
 * - FLP records
 *
 * Uses pre-configured pipelines for consistent, well-tested transformations.
 */

export default createTransferPreset({
    name: "v5-to-v6-ddb",
    description: "Webiny v5 to v6 migration with all necessary transformations - DynamoDB only.",
    configure({ runner, pipelineBuilderFactory: factory, container }): void {
        // ========================================================================
        // Audit Logs
        // IMPORTANT: Must be registered before AcoSearchRecordsPage and CmsEntries
        // because audit log records share the acoSearchRecord modelId prefix.
        // When auditLog.dynamodb.tableName is null the pipeline is blackholed —
        // records are consumed but not written.
        // ========================================================================
        const config = container.resolve(MigrationConfig);
        const auditLogs = factory
            .create({
                name: "AuditLogs",
                scanner: DdbScanner,
                processors: [AuditLogProcessor]
            })
            .filter(createFilter(isAuditLogEntry))
            .use(auditLogTransformers)
            .blackhole(
                () => config.storage !== "ddb" || !config.target.auditLog?.dynamodb?.tableName
            )
            .build();

        const acoSearchRecordsPage = factory
            .create({
                name: "AcoSearchRecordsPage",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(isAcoSearchRecord))
            .blackhole()
            .build();
        // ========================================================================
        // Content Model Groups
        // ========================================================================
        const contentModelGroups = factory
            .create({
                name: "ContentModelGroups",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(isCmsGroup))
            .use(wrapInData)
            .use(addGsiTenant)
            .use(removeLocale)
            .use(removeAttributes)
            .build();
        // ========================================================================
        // Background Tasks
        // ========================================================================
        const backgroundTasks = factory
            .create({
                name: "BackgroundTasks",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(isBackgroundTask))
            .blackhole()
            .build();
        // ========================================================================
        // File Manager Settings
        // ========================================================================
        const fmSettings = factory
            .create({
                name: "FileManagerSettings",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(byType("fm.settings")))
            .use(wrapInData)
            .use(migrateFileManagerSettings)
            .use(removeAttributes)
            .build();

        // ========================================================================
        // File Manager Files
        // IMPORTANT: Must be registered BEFORE CmsEntryPipeline due to first-match-wins
        // ========================================================================
        const fmFiles = factory
            .create({
                name: "FileManagerFiles",
                scanner: DdbScanner,
                processors: [DdbProcessor, S3Processor]
            })
            .filter(createFilter(isFmFile))
            .use(cmsEntryTransformers)
            // File Manager-specific transformers (append pipeline-specific tail here)
            .use(createMetadata)
            .use(extractImageMetadata)
            // TODO we dont want to copy files from S3, so discard all commands produced in this pipeline.
            // .blackhole()
            .build();

        // ========================================================================
        // Mailer Settings
        // ========================================================================
        const mailerSettings = factory
            .create({
                name: "MailerSettings",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(
                createFilter(record => {
                    return record.SK === "L" && record.modelId === "mailerSettings";
                })
            )
            .use(wrapInData)
            .use(migrateMailerSettings)
            .use(removeAttributes)
            .build();

        // ========================================================================
        // Security Groups → Roles
        // ========================================================================
        const securityGroups = factory
            .create({
                name: "SecurityGroups",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(
                createFilter(r => {
                    return r.TYPE === "security.group" && !isBuiltInSecurityRole(r);
                })
            )
            .use(wrapInData)
            .use(addGsiTenant)
            .use(groupsToRoles)
            .use(transformPermissions)
            .use(removeAttributes)
            .build();

        // ========================================================================
        // Security Teams
        // ========================================================================
        const securityTeams = factory
            .create({
                name: "SecurityTeams",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(isSecurityTeam))
            .use(wrapInData)
            .use(addGsiTenant)
            .use(removeAttributes)
            .build();

        // ========================================================================
        // CMS Models
        // ========================================================================
        const cmsModels = factory
            .create({
                name: "CmsModels",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(isCmsModel))
            .use(wrapInData)
            .use(addGsiTenant)
            .use(removeLocale)
            .use(transformModelGroup)
            .use(renameFieldAttributes)
            .use(removeAttributes)
            .build();

        // ========================================================================
        // Folder Permissions (FLP records)
        // ========================================================================
        const folderPermissions = factory
            .create({
                name: "FolderPermissions",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(isFlpRecord))
            .use(wrapInData)
            .use(addGsiTenant)
            .use(removeLocale)
            .use(removeAttributes)
            .use(updateFlpIds)
            .build();

        // ========================================================================
        // CMS Entries (catch-all for remaining CMS entries)
        // IMPORTANT: Must be registered AFTER FmFilePipeline
        // ========================================================================
        const cmsEntries = factory
            .create({
                name: "CmsEntries",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .filter(createFilter(isCmsEntry))
            .use(cmsEntryTransformers)
            .use(addLiveField)
            .build();

        // ========================================================================
        // Register pipelines with runner
        // IMPORTANT: Order matters due to first-match-wins behavior
        // ========================================================================
        runner
            .register(auditLogs)
            .register(acoSearchRecordsPage)
            .register(contentModelGroups)
            .register(backgroundTasks)
            .register(fmSettings)
            .register(fmFiles) // Before cmsEntries
            .register(mailerSettings)
            .register(securityGroups)
            .register(securityTeams)
            .register(cmsModels)
            .register(folderPermissions)
            .register(cmsEntries); // After fmFiles
    }
});
