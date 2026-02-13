import { MigrationRunner } from "../core/runner.ts";
import { MigrationConfig, MigrationPreset } from "../core/types.ts";
import { DatabaseClient } from "../database/interface.ts";

// Import pre-configured pipelines
import {
  CmsModelPipeline,
  CmsEntryPipeline,
  FmSettingsPipeline,
  FmFilePipeline,
  FolderPermissionsPipeline,
  SecurityGroupPipeline,
  SecurityTeamPipeline,
  MailerSettingsPipeline
} from "../pipelines.ts";

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
 * - CMS entries (excluding files - handled separately)
 * - Folders (FLP records)
 *
 * Uses pre-configured pipelines for consistent, well-tested transformations.
 */
export const v5ToV6Preset: MigrationPreset = {
  name: "v5-to-v6",
  description: "Webiny v5 to v6 migration with all necessary transformations",
  configure(runner: MigrationRunner, config: MigrationConfig, database: DatabaseClient): void {
    // Register all pre-configured pipelines
    // IMPORTANT: Order matters! FmFilePipeline must be registered before CmsEntryPipeline
    // due to "first-match-wins" behavior. FmFilePipeline catches fmFile records,
    // CmsEntryPipeline catches all other CMS entries.
    runner
      .register(new FmSettingsPipeline().build())
      .register(new FmFilePipeline().build()) // Must be before CmsEntryPipeline
      .register(new MailerSettingsPipeline().build())
      .register(new SecurityGroupPipeline().build())
      .register(new SecurityTeamPipeline().build())
      .register(new CmsModelPipeline().build())
      .register(new FolderPermissionsPipeline().build())
      .register(new CmsEntryPipeline().build()); // Catches remaining CMS entries
  }
};

// Export as default for easier importing
export default v5ToV6Preset;
