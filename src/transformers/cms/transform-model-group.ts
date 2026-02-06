import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Transforms CMS model records:
 * - Replaces group object with group slug (resolves group ID to slug)
 */
export const transformModelGroup: Transformer = {
  name: "transformModelGroup",
  async transform(ctx: TransformContext) {
    const { record } = ctx;

    // Check if model has a group object
    if (!record.group || typeof record.group !== "object") {
      return;
    }

    const group = record.group as { id?: string; name?: string };

    // If no group ID, skip
    if (!group.id) {
      return;
    }

    // Extract tenant for group lookup (before it gets removed)
    const tenant = record.tenant || "root";

    // Look up the group record to get its slug
    const groupRecord = await ctx.queryRecord(`T#${tenant}#GROUP#${group.id}`, "A");

    if (groupRecord && groupRecord.slug) {
      // Replace group object with slug string
      record.group = groupRecord.slug;
    } else {
      // Fallback: use lowercase name if group not found
      console.warn(`[transformModelGroup] Group ${group.id} not found, using name as fallback`);
      record.group = group.name
        ? (group.name as string).toLowerCase().replace(/\s+/g, "-")
        : "ungrouped";
    }
  }
};
