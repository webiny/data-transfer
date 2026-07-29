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
declare const _default: import("../index.ts").MigrationPreset;
export default _default;
//# sourceMappingURL=v5-to-v6-ddb.d.ts.map
