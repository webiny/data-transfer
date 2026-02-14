import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";
import { ModelField, Template } from "../../models/types.ts";

/**
 * Recursively renames field attributes in CMS model definitions:
 * - helpText → description
 * - placeholderText → placeholder
 */
export const renameFieldAttributes: Transformer = {
  name: "renameFieldAttributes",
  transform(ctx: TransformContext) {
    const { record } = ctx;

    const data = record.data as Record<string, unknown> | undefined;
    if (!data) {
      return;
    }

    const fields = data.fields;
    if (!Array.isArray(fields)) {
      return;
    }

    renameFieldAttributesRecursive(fields);
  }
};

function renameFieldAttributesRecursive(fields: ModelField[]): void {
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

function renameAttributes(field: ModelField): void {
  const fieldAny = field as any;

  // helpText → description
  if ("helpText" in fieldAny) {
    if (!("description" in fieldAny)) {
      fieldAny.description = fieldAny.helpText;
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
}
