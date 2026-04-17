import type { Transformer } from "~/domain/transform/Transformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

/**
 * Transforms CMS model records:
 * NOTE: This transformer expects wrapInData to run FIRST, so group is in data.group.
 * - Replaces group object with group slug (resolves group ID to slug)
 */
export const transformModelGroup: Transformer = {
    name: "transformModelGroup",
    async transform(ctx: BaseTransformContext.Interface) {
        const { record } = ctx;

        // Extract data envelope
        const data = record.data as Record<string, unknown> | undefined;
        if (!data) {
            return; // No data envelope
        }

        // Check if model has a group object
        if (!data.group || typeof data.group !== "object") {
            return;
        }

        const group = data.group as { id?: string; name?: string };

        // If no group ID, skip
        if (!group.id) {
            return;
        }

        // Extract tenant for group lookup
        const tenant = data.tenant || "root";

        // Look up the group record to get its slug
        const groupRecord = await ctx.queryRecord(`T#${tenant}#GROUP#${group.id}`, "A");

        if (groupRecord && groupRecord.slug) {
            // Replace group object with slug string
            data.group = groupRecord.slug;
        } else {
            // Fallback: use lowercase name if group not found
            console.warn(
                `[transformModelGroup] Group ${group.id} not found, using name as fallback`
            );
            data.group = group.name
                ? (group.name as string).toLowerCase().replace(/\s+/g, "-")
                : "ungrouped";
        }
    }
};
