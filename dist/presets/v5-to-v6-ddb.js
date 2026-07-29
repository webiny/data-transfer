import { createTransferPreset } from "../utils/createTransferPreset.js";
import { DdbScanner } from "../features/DdbScanner/index.js";
import { DdbProcessor } from "../features/DdbProcessor/index.js";
import { S3Processor } from "../features/S3Processor/index.js";
import { AuditLogProcessor } from "../features/AuditLogProcessor/index.js";
import { MigrationConfig } from "../features/MigrationConfig/index.js";
import { createFilter } from "../domain/pipeline/Filter.js";
import {
  byType,
  isAcoSearchRecord,
  isAdminUser,
  isAuditLogEntry,
  isBackgroundTask,
  isBuiltInSecurityRole,
  isCmsEntry,
  isCmsGroup,
  isCmsModel,
  isFlpRecord,
  isFmFile,
  isFormBuilderRecord,
  isMigrationRecord,
  isSecurityTeam
} from "../domain/transform/filters.js";
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
  replaceFileUrls,
  transformModelGroup,
  transformPermissions,
  updateFlpIds,
  wrapInData
} from "../transformers/index.js";
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
  description:
    "Webiny v5 to v6 migration with all necessary transformations - Regular DynamoDb table.",
  async configure({ runner, pipelineBuilderFactory: factory, container }) {
    // ========================================================================
    // Migration records — blackhole all PKs starting with "MIGRATION"
    // ========================================================================
    const migrationRecords = await factory
      .create({
        name: "MigrationRecords",
        scanner: DdbScanner,
        processors: [DdbProcessor]
      })
      .filter(createFilter(isMigrationRecord))
      .blackhole()
      .build();
    // ========================================================================
    // Audit Logs
    // IMPORTANT: Must be registered before AcoSearchRecordsPage and CmsEntries
    // because audit log records share the acoSearchRecord modelId prefix.
    // NOTE: set target.auditLog.dynamodb.tableName to null (or omit auditLog
    // entirely) to skip audit log transfer — records will be blackholed.
    // ========================================================================
    const config = container.resolve(MigrationConfig);
    const auditLogs = await factory
      .create({
        name: "AuditLogs",
        scanner: DdbScanner,
        processors: [AuditLogProcessor]
      })
      .filter(createFilter(isAuditLogEntry))
      .use(auditLogTransformers)
      .blackhole(() => {
        return !config.target.auditLog?.dynamodb?.tableName;
      })
      .build();
    const acoSearchRecordsPage = await factory
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
    const contentModelGroups = await factory
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
    const backgroundTasks = await factory
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
    const fmSettings = await factory
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
    const fmFiles = await factory
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
    const mailerSettings = await factory
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
    const securityGroups = await factory
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
    const securityTeams = await factory
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
    const cmsModels = await factory
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
    const folderPermissions = await factory
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
    const cmsEntries = await factory
      .create({
        name: "CmsEntries",
        scanner: DdbScanner,
        processors: [DdbProcessor]
      })
      .filter(createFilter(isCmsEntry))
      .use(cmsEntryTransformers)
      .use(addLiveField)
      .use(replaceFileUrls(config))
      .build();
    // ========================================================================
    // Form Builder — blackhole (no v6 migration path yet)
    // Matches by PK (#FB# segment) first, then TYPE prefix fb.form.* and
    // the standalone fb.formSubmission type.
    // IMPORTANT: Must be registered AFTER CmsEntries because FB forms are
    // CMS entries and would otherwise be claimed first.
    // ========================================================================
    const formBuilderRecords = await factory
      .create({
        name: "FormBuilderRecords",
        scanner: DdbScanner,
        processors: [DdbProcessor]
      })
      .filter(createFilter(isFormBuilderRecord))
      .blackhole()
      .build();
    const adminUsers = await factory
      .create({
        name: "AdminUsers",
        scanner: DdbScanner,
        processors: [DdbProcessor]
      })
      .filter(createFilter(isAdminUser))
      .build();
    // ========================================================================
    // Register pipelines with runner
    // IMPORTANT: Order matters due to first-match-wins behavior
    // ========================================================================
    runner
      .register(migrationRecords)
      .register(auditLogs)
      .register(acoSearchRecordsPage)
      .register(contentModelGroups)
      .register(backgroundTasks)
      .register(fmSettings)
      .register(fmFiles)
      .register(mailerSettings)
      .register(securityGroups)
      .register(securityTeams)
      .register(cmsModels)
      .register(folderPermissions)
      .register(cmsEntries)
      .register(adminUsers)
      .register(formBuilderRecords);
  }
});
//# sourceMappingURL=v5-to-v6-ddb.js.map
