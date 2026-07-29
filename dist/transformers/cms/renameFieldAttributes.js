import { createTransformer } from "../../transformers/createTransformer.js";
/**
 * Recursively renames field attributes in CMS model definitions:
 * - helpText → description
 * - placeholderText → placeholder
 */
export const renameFieldAttributes = createTransformer("renameFieldAttributes", ctx => {
  const { record } = ctx;
  const data = record.data;
  if (!data) {
    return;
  }
  const fields = data.fields;
  if (!Array.isArray(fields)) {
    return;
  }
  renameFieldAttributesRecursive(fields);
});
function renameFieldAttributesRecursive(fields) {
  for (const field of fields) {
    renameAttributes(field);
    if (field.settings) {
      // Object nested fields
      if (Array.isArray(field.settings.fields)) {
        renameFieldAttributesRecursive(field.settings.fields);
      }
      // Dynamic zone templates
      if (Array.isArray(field.settings.templates)) {
        for (const template of field.settings.templates) {
          if (Array.isArray(template.fields)) {
            renameFieldAttributesRecursive(template.fields);
          }
        }
      }
    }
  }
}
function renameAttributes(field) {
  const fieldAny = field;
  // helpText → description
  if ("helpText" in fieldAny) {
    if (!("note" in fieldAny)) {
      fieldAny.note = fieldAny.helpText;
    }
    delete fieldAny.helpText;
  }
  // placeholderText → placeholder
  if ("placeholderText" in fieldAny) {
    if (!("placeholder" in fieldAny)) {
      fieldAny.placeholder = fieldAny.placeholderText;
    }
    delete fieldAny.placeholderText;
  }
  // multipleValues → list
  if ("multipleValues" in fieldAny) {
    if (!("list" in fieldAny)) {
      fieldAny.list = fieldAny.multipleValues;
    }
    delete fieldAny.multipleValues;
  }
}
//# sourceMappingURL=renameFieldAttributes.js.map
