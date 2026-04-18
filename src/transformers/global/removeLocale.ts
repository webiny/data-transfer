import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

/**
 * Removes locale codes (e.g., L#en-US#) from PK, SK, and GSI keys,
 * and removes the locale field from the record.
 */
export const removeLocale = createTransformer<BaseTransformContext.Interface>(
    "removeLocale",
    ctx => {
        const { record } = ctx;

        // Keys that might contain locale codes
        const keysToClean = ["PK", "SK", "GSI1_PK", "GSI1_SK", "GSI2_PK", "GSI2_SK"];

        for (const key of keysToClean) {
            if (typeof record[key] === "string") {
                record[key] = removeLocaleFromKey(record[key] as string);
            }
        }

        // Remove locale field
        delete record.locale;
        if (record.data && typeof record.data === "object") {
            delete (record.data as Record<string, unknown>).locale;
        }
    }
);

function removeLocaleFromKey(key: string): string {
    // Remove patterns like #L#en-US# from keys
    // Match: #L#{locale}# (must have # before L and after locale code)
    return key.replace(/#L#[^#]+#/g, "#");
}
