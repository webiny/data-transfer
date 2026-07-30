import { createTransformer } from "~/transformers/createTransformer.js";
import type { DdbCoreTransformContext } from "~/features/TransformContext/abstractions/contextAliases.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";

const getLocale = (record: BaseRecord): string => {
    // Try to get locale from record attributes
    if (typeof record.locale === "string" && !!record.locale) {
        return record.locale;
    }
    // Fallback to default locale
    return "en-US";
};
/**
 * Transforms CMS model records:
 * NOTE: This transformer expects wrapInData to run FIRST, so group is in data.group.
 * - Replaces group object with group slug (resolves group ID to slug)
 */
export const transformModelGroup = createTransformer<DdbCoreTransformContext.Interface<BaseRecord>>(
    "transformModelGroup",
    async ctx => {
        const { record, original } = ctx;

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

        const locale = getLocale(original);

        // Extract tenant for group lookup
        const tenant = data.tenant || "root";

        // Look up the group record to get its slug
        const groupRecord = await ctx.querySourceRecord(
            `T#${tenant}#L#${locale}#CMS#CMG`,
            group.id
        );

        if (groupRecord && groupRecord.slug) {
            // Replace group object with slug string
            data.group = groupRecord.slug;
        } else {
            // Fallback: use lowercase name if group not found
            ctx.logger.warn(
                `[transformModelGroup] Group ${group.id} not found, using name as fallback`
            );
            data.group = group.name
                ? (group.name as string).toLowerCase().replace(/\s+/g, "-")
                : "ungrouped";
        }
    }
);
