import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Removes locale codes (e.g., L#en-US#) from PK, SK, and GSI keys
 */
export const removeLocale: Transformer = {
  name: "removeLocale",
  transform(ctx: TransformContext) {
    const { record } = ctx;

    // Keys that might contain locale codes
    const keysToClean = ["PK", "SK", "GSI1_PK", "GSI1_SK", "GSI2_PK", "GSI2_SK"];

    for (const key of keysToClean) {
      if (typeof record[key] === "string") {
        record[key] = removeLocaleFromKey(record[key] as string);
      }
    }
  }
};

function removeLocaleFromKey(key: string): string {
  // Remove patterns like #L#en-US# from keys
  // Match: #L#{locale}# (must have # before L and after locale code)
  return key.replace(/#L#[^#]+#/g, "#");
}
