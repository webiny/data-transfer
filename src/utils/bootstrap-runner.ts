import { MigrationRunner } from "../core/runner.ts";
import { TransformPipeline } from "../core/pipeline.ts";
import { MigrationConfig } from "../core/types.ts";
import { DatabaseClient } from "../database/interface.ts";

// Import transformers
import { wrapInData } from "../transformers/global/wrap-in-data.ts";
import { addGsiTenant } from "../transformers/global/add-gsi-tenant.ts";
import { removeLocale } from "../transformers/global/remove-locale.ts";
import { removeAttributes } from "../transformers/global/remove-attributes.ts";
import { fixCmePk } from "../transformers/cms/fix-cme-pk.ts";
import { fixBrokenStorageKeys } from "../transformers/cms/fix-broken-storage-keys.ts";
import { transformRichText } from "../transformers/cms/transform-rich-text.ts";
import { updateModelIds } from "../transformers/cms/update-model-ids.ts";
import { removeFolderRevision } from "../transformers/cms/remove-folder-revision.ts";
import { transformModelGroup } from "../transformers/cms/transform-model-group.ts";
import { updateFlpIds } from "../transformers/folders/update-flp-ids.ts";
import { migrateFileManagerSettings } from "../transformers/file-manager/migrate-settings.ts";
import { createFileMetadata } from "../transformers/file-manager/create-metadata.ts";
import { updateFileLocation } from "../transformers/file-manager/update-file-location.ts";
import { migrateMailerSettings } from "../transformers/mailer/migrate-settings.ts";
import { groupsToRoles } from "../transformers/security/groups-to-roles.ts";
import { transformPermissions } from "../transformers/security/transform-permissions.ts";
import { isType } from "../filters/index.ts";

// ============================================================================
// Bootstrap Migration Runner
// ============================================================================

/**
 * Bootstraps a MigrationRunner with all registered pipelines
 */
export function bootstrapMigrationRunner(
  config: MigrationConfig,
  database: DatabaseClient
): MigrationRunner {
  const runner = new MigrationRunner(config, database);

  // Pipeline for File Manager Settings
  const fmSettingsPipeline = new TransformPipeline()
    .filter(isType("fm.settings"))
    .use(migrateFileManagerSettings)
    .use(removeAttributes);

  // Pipeline for Mailer Settings
  const mailerSettingsPipeline = new TransformPipeline()
    .filter(record => record.SK === "L" && record.modelId === "mailerSettings")
    .use(migrateMailerSettings)
    .use(removeAttributes);

  // Pipeline for Security Groups -> Roles
  const securityGroupsPipeline = new TransformPipeline()
    .filter(isType("security.group"))
    .filter(record => {
      const slug = record.slug || record.GSI1_SK;
      return slug !== "full-access" && slug !== "anonymous";
    })
    .use(addGsiTenant)
    .use(groupsToRoles)
    .use(transformPermissions)
    .use(removeAttributes)
    .use(wrapInData);

  // Pipeline for Security Teams
  const securityTeamsPipeline = new TransformPipeline()
    .filter(isType("security.team"))
    .use(addGsiTenant)
    .use(removeAttributes)
    .use(wrapInData);

  // Pipeline for CMS Models
  const cmsModelsPipeline = new TransformPipeline()
    .filter(isType("cms.model"))
    .use(addGsiTenant)
    .use(removeLocale)
    .use(transformModelGroup)
    .use(removeAttributes)
    .use(wrapInData);

  // Pipeline for CMS Entries (including files, but excluding FLP)
  const cmsEntriesPipeline = new TransformPipeline()
    .filter(record => {
      const type = record.TYPE as string;
      // Match cms.entry* but exclude cms.entry.flp (handled by FLP pipeline)
      return Boolean(type && type.startsWith("cms.entry") && type !== "cms.entry.flp");
    })
    .use(addGsiTenant)
    .use(removeLocale)
    .use(fixCmePk)
    .use(fixBrokenStorageKeys)
    .use(transformRichText)
    .use(updateModelIds)
    .use(removeFolderRevision)
    .use(removeAttributes)
    .use(wrapInData)
    .use(createFileMetadata)
    .use(updateFileLocation);

  // Pipeline for FLP records (folders)
  const flpPipeline = new TransformPipeline()
    .filter(record => typeof record.PK === "string" && record.PK.includes("#FLP#"))
    .use(addGsiTenant)
    .use(removeLocale)
    .use(removeAttributes)
    .use(wrapInData)
    .use(updateFlpIds);

  // Register all pipelines
  runner
    .register(fmSettingsPipeline)
    .register(mailerSettingsPipeline)
    .register(securityGroupsPipeline)
    .register(securityTeamsPipeline)
    .register(cmsModelsPipeline)
    .register(cmsEntriesPipeline)
    .register(flpPipeline);

  return runner;
}
