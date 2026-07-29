import { ModelField } from "./modelTypes.ts";
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
export declare function visitFields(
  values: Record<string, unknown>,
  modelFields: ModelField[],
  callback: FieldVisitorCallback
): Promise<void>;
//# sourceMappingURL=fieldVisitor.d.ts.map
