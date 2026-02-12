import { TransformPipeline, RecordFilter } from "./core/pipeline.ts";
import { Transformer } from "./core/transformer.ts";

// Import global transformers
import { wrapInData } from "./transformers/global/wrap-in-data.ts";
import { addGsiTenant } from "./transformers/global/add-gsi-tenant.ts";
import { removeLocale } from "./transformers/global/remove-locale.ts";
import { removeAttributes } from "./transformers/global/remove-attributes.ts";

// Import CMS transformers
import { fixCmePk } from "./transformers/cms/fix-cme-pk.ts";
import { fixBrokenStorageKeys } from "./transformers/cms/fix-broken-storage-keys.ts";
import { transformRichText } from "./transformers/cms/transform-rich-text.ts";
import { updateModelIds } from "./transformers/cms/update-model-ids.ts";
import { removeFolderRevision } from "./transformers/cms/remove-folder-revision.ts";
import { transformModelGroup } from "./transformers/cms/transform-model-group.ts";

// Import File Manager transformers
import { migrateFileManagerSettings } from "./transformers/file-manager/migrate-settings.ts";
import { createFileMetadata } from "./transformers/file-manager/create-metadata.ts";

// Import Folder transformers
import { updateFlpIds } from "./transformers/folders/update-flp-ids.ts";

// Import Mailer transformers
import { migrateMailerSettings } from "./transformers/mailer/migrate-settings.ts";

// Import Security transformers
import { groupsToRoles } from "./transformers/security/groups-to-roles.ts";
import { transformPermissions } from "./transformers/security/transform-permissions.ts";

// Import filters
import { isType } from "./filters/index.ts";

// ============================================================================
// Base Configured Pipeline
// ============================================================================

/**
 * Base class for pre-configured pipelines.
 * Handles core transformations and provides a fluent API for customization.
 */
abstract class ConfiguredPipeline<
  TInput extends Record<string, unknown> = Record<string, unknown>
> {
  protected pipeline: TransformPipeline<TInput>;

  constructor() {
    this.pipeline = new TransformPipeline<TInput>();
    this.configureDefaults();
  }

  /**
   * Configure default filters and transformers.
   * Subclasses must implement this to set up core transformations.
   */
  protected abstract configureDefaults(): void;

  /**
   * Add a custom filter to narrow down which records are processed.
   * Records must pass ALL filters to be processed.
   */
  filter(predicate: RecordFilter<TInput>): this {
    this.pipeline.filter(predicate);
    return this;
  }

  /**
   * Add a custom transformer to the pipeline.
   * Custom transformers run AFTER all core transformers.
   */
  use<T>(transformer: Transformer<T>): this {
    this.pipeline.use(transformer);
    return this;
  }

  /**
   * Get the underlying TransformPipeline for registration with MigrationRunner.
   */
  build(): TransformPipeline<TInput> {
    return this.pipeline;
  }
}

// ============================================================================
// CMS Pipelines
// ============================================================================

/**
 * Pre-configured pipeline for CMS Models.
 * Applies all necessary transformations for migrating CMS models to v6.
 *
 * Default filters: cms.model type
 * Core transformers: addGsiTenant, removeLocale, transformModelGroup, removeAttributes, wrapInData
 */
export class CmsModelPipeline extends ConfiguredPipeline {
  protected configureDefaults(): void {
    this.pipeline
      .filter(isType("cms.model"))
      .use(addGsiTenant)
      .use(removeLocale)
      .use(transformModelGroup)
      .use(removeAttributes)
      .use(wrapInData);
  }
}

/**
 * Pre-configured pipeline for CMS Entries.
 * Applies all necessary transformations for migrating CMS entries to v6.
 *
 * Default filters: cms.entry* type (excluding cms.entry.flp)
 * Core transformers: addGsiTenant, removeLocale, fixCmePk, fixBrokenStorageKeys,
 *                    transformRichText, updateModelIds, removeFolderRevision,
 *                    removeAttributes, wrapInData
 *
 * IMPORTANT: Register FmFilePipeline BEFORE CmsEntryPipeline in your preset.
 * Due to "first-match-wins" behavior, FmFilePipeline will catch fmFile records first,
 * and CmsEntryPipeline will handle all other CMS entries.
 */
export class CmsEntryPipeline extends ConfiguredPipeline {
  protected configureDefaults(): void {
    this.pipeline
      .filter(record => {
        const type = record.TYPE as string;
        return Boolean(type && type.startsWith("cms.entry"));
      })
      .use(addGsiTenant)
      .use(removeLocale)
      .use(fixCmePk)
      .use(fixBrokenStorageKeys)
      .use(transformRichText)
      .use(updateModelIds)
      .use(removeFolderRevision)
      .use(removeAttributes)
      .use(wrapInData);
  }
}

// ============================================================================
// File Manager Pipelines
// ============================================================================

/**
 * Pre-configured pipeline for File Manager Settings.
 * Applies all necessary transformations for migrating FM settings to v6.
 *
 * Default filters: fm.settings type
 * Core transformers: migrateFileManagerSettings, removeAttributes
 */
export class FmSettingsPipeline extends ConfiguredPipeline {
  protected configureDefaults(): void {
    this.pipeline
      .filter(isType("fm.settings"))
      .use(migrateFileManagerSettings)
      .use(removeAttributes);
  }
}

/**
 * Pre-configured pipeline for File Manager Files.
 * Uses the same core transformers as CmsEntryPipeline, plus File Manager-specific ones.
 *
 * Default filters: fmFile or wbyFmFile modelId
 * Core transformers: Same as CmsEntryPipeline (all CMS entry transformers)
 * Additional transformers: createFileMetadata, updateFileLocation
 *
 * IMPORTANT: This pipeline MUST be registered BEFORE CmsEntryPipeline in your preset.
 * Due to "first-match-wins" behavior, FmFilePipeline will catch fmFile records first,
 * and CmsEntryPipeline will handle all other CMS entries.
 *
 * Example registration order:
 *   runner
 *     .register(new FmFilePipeline().build())      // Register first
 *     .register(new CmsEntryPipeline().build())    // Register after
 */
export class FmFilePipeline extends ConfiguredPipeline {
  protected configureDefaults(): void {
    this.pipeline
      .filter(record => {
        const modelId = record.modelId as string;
        return modelId === "fmFile" || modelId === "wbyFmFile";
      })
      // All standard CMS entry transformers
      .use(addGsiTenant)
      .use(removeLocale)
      .use(fixCmePk)
      .use(fixBrokenStorageKeys)
      .use(updateModelIds)
      .use(removeFolderRevision)
      .use(removeAttributes)
      .use(wrapInData)
      // File Manager-specific transformers
      .use(createFileMetadata);
  }
}

/**
 * Pre-configured pipeline for Folders (FLP records).
 * Applies all necessary transformations for migrating folders to v6.
 *
 * Default filters: PK contains "#FLP#"
 * Core transformers: addGsiTenant, removeLocale, removeAttributes, wrapInData, updateFlpIds
 */
export class FolderPermissionsPipeline extends ConfiguredPipeline {
  protected configureDefaults(): void {
    this.pipeline
      .filter(record => typeof record.PK === "string" && record.PK.includes("#FLP#"))
      .use(addGsiTenant)
      .use(removeLocale)
      .use(removeAttributes)
      .use(wrapInData)
      .use(updateFlpIds);
  }
}

// ============================================================================
// Security Pipelines
// ============================================================================

/**
 * Pre-configured pipeline for Security Groups -> Roles transformation.
 * Applies all necessary transformations for migrating security groups to v6 roles.
 *
 * Default filters: security.group type, excludes full-access and anonymous
 * Core transformers: addGsiTenant, groupsToRoles, transformPermissions, removeAttributes, wrapInData
 */
export class SecurityGroupPipeline extends ConfiguredPipeline {
  protected configureDefaults(): void {
    this.pipeline
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
  }
}

/**
 * Pre-configured pipeline for Security Teams.
 * Applies all necessary transformations for migrating security teams to v6.
 *
 * Default filters: security.team type
 * Core transformers: addGsiTenant, removeAttributes, wrapInData
 */
export class SecurityTeamPipeline extends ConfiguredPipeline {
  protected configureDefaults(): void {
    this.pipeline
      .filter(isType("security.team"))
      .use(addGsiTenant)
      .use(removeAttributes)
      .use(wrapInData);
  }
}

// ============================================================================
// Mailer Pipeline
// ============================================================================

/**
 * Pre-configured pipeline for Mailer Settings.
 * Applies all necessary transformations for migrating mailer settings to v6.
 *
 * Default filters: SK === "L" and modelId === "mailerSettings"
 * Core transformers: migrateMailerSettings, removeAttributes
 */
export class MailerSettingsPipeline extends ConfiguredPipeline {
  protected configureDefaults(): void {
    this.pipeline
      .filter(record => record.SK === "L" && record.modelId === "mailerSettings")
      .use(migrateMailerSettings)
      .use(removeAttributes);
  }
}
