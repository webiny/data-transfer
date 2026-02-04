import { MigrationRunner } from "../core/runner.ts";
import { TransformPipeline } from "../core/pipeline.ts";

// Import transformers
import { wrapInData } from "../transformers/global/wrap-in-data.ts";
import { addGsiTenant } from "../transformers/global/add-gsi-tenant.ts";
import { removeLocale } from "../transformers/global/remove-locale.ts";
import { fixCmePk } from "../transformers/cms/fix-cme-pk.ts";
import { updateModelIds } from "../transformers/cms/update-model-ids.ts";
import { removeFolderRevision } from "../transformers/cms/remove-folder-revision.ts";
import { updateFlpIds } from "../transformers/folders/update-flp-ids.ts";
import { migrateFileManagerSettings } from "../transformers/file-manager/migrate-settings.ts";
import { createFileMetadata } from "../transformers/file-manager/create-metadata.ts";
import { updateFileLocation } from "../transformers/file-manager/update-file-location.ts";
import { migrateMailerSettings } from "../transformers/mailer/migrate-settings.ts";
import { groupsToRoles } from "../transformers/security/groups-to-roles.ts";
import { isType } from "../filters/index.ts";

// ============================================================================
// Bootstrap Migration Runner
// ============================================================================

export interface BootstrapOptions {
  targetTable: string;
}

/**
 * Bootstraps a MigrationRunner with all registered pipelines
 */
export function bootstrapMigrationRunner(
  options: BootstrapOptions
): MigrationRunner {
  const runner = new MigrationRunner();
  const targetTable = options.targetTable;

  // Pipeline for File Manager Settings
  const fmSettingsPipeline = new TransformPipeline(targetTable)
    .filter(isType("fm.settings"))
    .use(migrateFileManagerSettings);

  // Pipeline for Mailer Settings
  const mailerSettingsPipeline = new TransformPipeline(targetTable)
    .filter(record => record.SK === "L" && record.modelId === "mailerSettings")
    .use(migrateMailerSettings);

  // Pipeline for Security Groups -> Roles
  const securityGroupsPipeline = new TransformPipeline(targetTable)
    .filter(isType("security.group"))
    .use(addGsiTenant)
    .use(removeLocale)
    .use(groupsToRoles)
    .use(wrapInData);

  // Pipeline for CMS Entries (including files)
  const cmsEntriesPipeline = new TransformPipeline(targetTable)
    .filter(isType("cms.entry.l"))
    .use(addGsiTenant)
    .use(removeLocale)
    .use(fixCmePk)
    .use(updateModelIds)
    .use(removeFolderRevision)
    .use(wrapInData)
    .use(createFileMetadata)
    .use(updateFileLocation);

  // Pipeline for FLP records (folders)
  const flpPipeline = new TransformPipeline(targetTable)
    .filter(
      record => typeof record.PK === "string" && record.PK.includes("#FLP#")
    )
    .use(addGsiTenant)
    .use(removeLocale)
    .use(wrapInData)
    .use(updateFlpIds);

  // Register all pipelines
  runner
    .register(fmSettingsPipeline)
    .register(mailerSettingsPipeline)
    .register(securityGroupsPipeline)
    .register(cmsEntriesPipeline)
    .register(flpPipeline);

  return runner;
}
