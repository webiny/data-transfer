import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";
import { getCorrectStorageId } from "../../models/field-utils.ts";
import { visitFields } from "../../utils/field-visitor.ts";

// ============================================================================
// Fix Broken Storage Keys Transformer
// ============================================================================

/**
 * Fixes broken storage keys in CMS entry values.
 * NOTE: This transformer expects wrapInData to run FIRST, so values is in data.values.
 *
 * Issues fixed:
 * 1. Corrupt storageId prefix (e.g., "text@foo" when type is "dynamicZone")
 * 2. Using fieldId as key instead of storageId (bug in object→dynamicZone chains)
 *
 * The transformer uses the model definition as source of truth and recursively
 * fixes all field keys throughout the entry values structure.
 */
export const fixBrokenStorageKeys: Transformer = {
  name: "fixBrokenStorageKeys",
  async transform(ctx: TransformContext) {
    if (!ctx.modelProvider) {
      throw new Error("ModelProvider is required for fixBrokenStorageKeys");
    }

    // Extract data envelope
    const data = ctx.record.data as Record<string, unknown> | undefined;
    if (!data) {
      return; // No data envelope
    }

    const modelId = data.modelId;
    if (!modelId) {
      return; // No model ID, skip
    }

    const model = ctx.modelProvider.getModel(modelId as string);
    if (!model) {
      // console.warn(`[fixBrokenStorageKeys] Model ${modelId} not found, skipping`);
      return;
    }

    const values = data.values;
    if (!values || typeof values !== "object") {
      return; // No values to fix
    }

    // Fix all keys recursively using field visitor
    await fixAllKeys(values as Record<string, unknown>, model.fields);
  }
};

/**
 * Recursively fixes storage keys in entry values based on model field definitions
 */
async function fixAllKeys(values: Record<string, unknown>, modelFields: any[]): Promise<void> {
  await visitFields(values, modelFields, (values, field, value) => {
    const correctKey = getCorrectStorageId(field);
    const declaredKey = field.storageId; // What model says (may be corrupt)
    const fieldIdKey = field.fieldId; // Another possible wrong key

    // Build set of possible wrong keys
    const wrongKeys = new Set<string>();
    if (declaredKey !== correctKey) {
      wrongKeys.add(declaredKey);
    }
    if (fieldIdKey !== correctKey) {
      wrongKeys.add(fieldIdKey);
    }

    // Check if entry uses correct key or any wrong key
    let foundValue: unknown = values[correctKey];
    let wrongKeyUsed: string | null = null;

    if (foundValue === undefined) {
      // Try to find value under wrong keys
      for (const wrongKey of wrongKeys) {
        if (wrongKey in values) {
          foundValue = values[wrongKey];
          wrongKeyUsed = wrongKey;
          break;
        }
      }
    }

    // Rename if needed
    if (wrongKeyUsed) {
      values[correctKey] = foundValue;
      delete values[wrongKeyUsed];
      console.log(`[fixBrokenStorageKeys] Fixed key: ${wrongKeyUsed} → ${correctKey}`);
    }
  });
}
