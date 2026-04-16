import { ModelField } from "../models/types.ts";

// ============================================================================
// Field Visitor Utility
// ============================================================================

/**
 * Callback function invoked for each field during traversal
 * @param values - The object containing the field value
 * @param field - The field definition from the model
 * @param value - The current field value
 */
export type FieldVisitorCallback = (
    values: Record<string, unknown>,
    field: ModelField,
    value: unknown
) => void | Promise<void>;

/**
 * Recursively traverses all fields in a CMS entry according to the model definition.
 * Handles nested structures including objects and dynamic zones.
 *
 * @param values - The entry values to traverse
 * @param modelFields - The model field definitions
 * @param callback - Function to call for each field
 */
export async function visitFields(
    values: Record<string, unknown>,
    modelFields: ModelField[],
    callback: FieldVisitorCallback
): Promise<void> {
    for (const field of modelFields) {
        const value = values[field.storageId];
        if (value === undefined) continue;

        // Invoke callback for this field
        await callback(values, field, value);

        // Recurse into nested structures
        if (field.type === "object") {
            const nestedFields = field.settings && field.settings.fields;
            if (!nestedFields) continue;

            if (field.multipleValues && Array.isArray(value)) {
                // Array of objects
                for (const item of value) {
                    if (item && typeof item === "object") {
                        await visitFields(item as Record<string, unknown>, nestedFields, callback);
                    }
                }
            } else if (typeof value === "object" && value !== null) {
                // Single object
                await visitFields(value as Record<string, unknown>, nestedFields, callback);
            }
        } else if (field.type === "dynamicZone") {
            const templates = field.settings && field.settings.templates;
            if (!templates) continue;

            const items = Array.isArray(value) ? value : [value];

            for (const item of items) {
                if (!item || typeof item !== "object") continue;

                const itemObj = item as Record<string, unknown>;
                const templateId = itemObj._templateId as string;
                const template = templates.find(t => t.id === templateId);

                if (template) {
                    await visitFields(itemObj, template.fields, callback);
                }
            }
        }
    }
}
