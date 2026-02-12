import { MigrationPreset } from "./types.ts";
import { MigrationRunner } from "../core/runner.ts";
import { MigrationConfig } from "../core/types.ts";
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
// Full Migration Preset
// ============================================================================

/**
 * The default "full" preset that migrates all Webiny v5 data to v6.
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
export const fullPreset: MigrationPreset = {
  name: "full",
  description: "Full migration of all Webiny v5 data to v6 format",
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
export default fullPreset;
