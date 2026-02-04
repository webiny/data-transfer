import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Transforms security role permissions to v6 format:
 * - Removes content.i18n permission
 * - Flattens cms.contentModel models from locale object to array
 * - Transforms cms.contentModelGroup groups from IDs to slugs
 */
export const transformPermissions: Transformer = {
  name: "transformPermissions",
  async transform(ctx: TransformContext) {
    const { record } = ctx;

    if (!Array.isArray(record.permissions)) {
      return;
    }

    // Extract tenant for group lookups (before it gets removed)
    const tenant = record.tenant || "root";

    // Extract default locale from PK pattern
    const defaultLocale = extractDefaultLocale(record.PK as string);

    // Filter and transform permissions
    const transformedPermissions = [];

    for (const permission of record.permissions) {
      // Remove content.i18n permission
      if (permission.name === "content.i18n") {
        continue;
      }

      const transformed = { ...permission };

      // Transform cms.contentModel permission
      if (permission.name === "cms.contentModel" && permission.models) {
        if (
          typeof permission.models === "object" &&
          !Array.isArray(permission.models)
        ) {
          // Flatten: { "en-US": ["article"] } → ["article"]
          transformed.models = permission.models[defaultLocale] || [];
        }
      }

      // Transform cms.contentModelGroup permission
      if (permission.name === "cms.contentModelGroup" && permission.groups) {
        if (
          typeof permission.groups === "object" &&
          !Array.isArray(permission.groups)
        ) {
          // Get group IDs from default locale
          const groupIds = permission.groups[defaultLocale] || [];

          // Look up each group and get its slug
          const groupSlugs = [];
          for (const groupId of groupIds) {
            const groupRecord = await ctx.queryRecord(
              `T#${tenant}#GROUP#${groupId}`,
              "A"
            );
            if (groupRecord && groupRecord.slug) {
              groupSlugs.push(groupRecord.slug);
            }
          }

          transformed.groups = groupSlugs;
        }
      }

      transformedPermissions.push(transformed);
    }

    record.permissions = transformedPermissions;
  }
};

function extractDefaultLocale(pk: string): string {
  // Extract locale from PK like "T#root#L#en-US#GROUP#..."
  const match = pk.match(/#L#([^#]+)#/);
  return match ? match[1] : "en-US";
}
