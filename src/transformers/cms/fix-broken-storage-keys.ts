import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";
import { ModelField } from "../../models/types.ts";
import { getCorrectStorageId } from "../../models/field-utils.ts";

// ============================================================================
// Fix Broken Storage Keys Transformer
// ============================================================================

/**
 * Fixes broken storage keys in CMS entry values.
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

    const modelId = ctx.record.modelId;
    if (!modelId) {
      return; // No model ID, skip
    }

    const model = ctx.modelProvider.getModel(modelId as string);
    if (!model) {
      console.warn(
        `[fixBrokenStorageKeys] Model ${modelId} not found, skipping`
      );
      return;
    }

    const values = ctx.record.values;
    if (!values || typeof values !== "object") {
      return; // No values to fix
    }

    // Fix all keys recursively
    fixAllKeysRecursive(values as Record<string, unknown>, model.fields);
  }
};

/**
 * Recursively fixes storage keys in entry values based on model field definitions
 */
function fixAllKeysRecursive(
  values: Record<string, unknown>,
  modelFields: ModelField[]
): void {
  for (const field of modelFields) {
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
      console.log(
        `[fixBrokenStorageKeys] Fixed key: ${wrongKeyUsed} → ${correctKey}`
      );
    }

    // Now recurse into nested structures
    const value = values[correctKey];
    if (!value) continue;

    if (field.type === "object") {
      // Object field: recurse into nested fields
      const nestedFields = field.settings && field.settings.fields;
      if (!nestedFields) continue;

      if (field.multipleValues && Array.isArray(value)) {
        // Array of objects
        for (const item of value) {
          if (item && typeof item === "object") {
            fixAllKeysRecursive(item as Record<string, unknown>, nestedFields);
          }
        }
      } else if (typeof value === "object" && value !== null) {
        // Single object
        fixAllKeysRecursive(value as Record<string, unknown>, nestedFields);
      }
    } else if (field.type === "dynamicZone") {
      // Dynamic zone: recurse into template fields
      const templates = field.settings && field.settings.templates;
      if (!templates) continue;

      const items = Array.isArray(value) ? value : [value];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;

        const itemObj = item as Record<string, unknown>;
        const templateId = itemObj._templateId as string;
        const template = templates.find(t => t.id === templateId);

        if (template) {
          fixAllKeysRecursive(itemObj, template.fields);
        }
      }
    }
    // Other field types (text, rich-text, etc.) don't have nested structure
  }
}
