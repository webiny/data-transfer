import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { PipelineBuilder } from "~/domain/transform/PipelineBuilder.ts";
import {
    byType,
    isBuiltInSecurityRole,
    isFlpRecord,
    isSecurityTeam
} from "~/domain/transform/filters.ts";

// Import global transformers
import { wrapInData } from "../transformers/global/wrapInData.ts";
import { addGsiTenant } from "../transformers/global/addGsiTenant.ts";
import { removeLocale } from "../transformers/global/removeLocale.ts";
import { removeAttributes } from "../transformers/global/removeAttributes.ts";

// Import File Manager transformers
import { migrateFileManagerSettings } from "../transformers/file-manager/migrateFileManagerSettings.ts";

// Import Folder transformers
import { updateFlpIds } from "../transformers/folders/updateFlpIds.ts";

// Import Mailer transformers
import { migrateMailerSettings } from "../transformers/mailer/migrateMailerSettings.ts";

// Import Security transformers
import { groupsToRoles } from "../transformers/security/groups-to-roles.ts";
import { transformPermissions } from "../transformers/security/transform-permissions.ts";
import { CmsEntryPipeline } from "./v5-to-v6/CmsEntryPipeline.ts";
import { CmsModelPipeline } from "./v5-to-v6/CmsModelPipeline.ts";
import { FmFilePipeline } from "./v5-to-v6/FmFilePipeline.ts";

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
export const v5ToV6Preset: MigrationPreset = {
    name: "v5-to-v6",
    description: "Webiny v5 to v6 migration with all necessary transformations",
    configure(runner: PipelineRunner.Interface): void {
        // ========================================================================
        // File Manager Settings
        // ========================================================================
        const fmSettings = new PipelineBuilder()
            .filter(byType("fm.settings"))
            .use(wrapInData)
            .use(migrateFileManagerSettings)
            .use(removeAttributes)
            .build();

        // ========================================================================
        // File Manager Files
        // IMPORTANT: Must be registered BEFORE CmsEntryPipeline due to first-match-wins
        // ========================================================================
        const fmFiles = new FmFilePipeline().build();

        // ========================================================================
        // Mailer Settings
        // ========================================================================
        const mailerSettings = new PipelineBuilder()
            .filter(record => {
                return record.SK === "L" && record.modelId === "mailerSettings";
            })
            .use(wrapInData)
            .use(migrateMailerSettings)
            .use(removeAttributes)
            .build();

        // ========================================================================
        // Security Groups → Roles
        // ========================================================================
        const securityGroups = new PipelineBuilder()
            .filter(r => r.TYPE === "security.group" && !isBuiltInSecurityRole(r))
            .use(wrapInData)
            .use(addGsiTenant)
            .use(groupsToRoles)
            .use(transformPermissions)
            .use(removeAttributes)
            .build();

        // ========================================================================
        // Security Teams
        // ========================================================================
        const securityTeams = new PipelineBuilder()
            .filter(isSecurityTeam)
            .use(wrapInData)
            .use(addGsiTenant)
            .use(removeAttributes)
            .build();

        // ========================================================================
        // CMS Models
        // ========================================================================
        const cmsModels = new CmsModelPipeline().build();

        // ========================================================================
        // Folder Permissions (FLP records)
        // ========================================================================
        const folderPermissions = new PipelineBuilder()
            .filter(isFlpRecord)
            .use(wrapInData)
            .use(addGsiTenant)
            .use(removeLocale)
            .use(removeAttributes)
            .use(updateFlpIds)
            .build();

        // ========================================================================
        // CMS Entries (catch-all for remaining CMS entries)
        // IMPORTANT: Must be registered AFTER FmFilePipeline
        // ==================================================v5-to-v6.ts======================
        const cmsEntries = new CmsEntryPipeline().build();

        // ========================================================================
        // Register pipelines with runner
        // IMPORTANT: Order matters due to first-match-wins behavior
        // ========================================================================
        runner
            .register(fmSettings)
            .register(fmFiles) // Before cmsEntries
            .register(mailerSettings)
            .register(securityGroups)
            .register(securityTeams)
            .register(cmsModels)
            .register(folderPermissions)
            .register(cmsEntries); // After fmFiles
    }
};

// Export as default for easier importing
export default v5ToV6Preset;
