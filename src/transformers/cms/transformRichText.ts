import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { LexicalRenderer } from "./lexicalRenderer.ts";
import { visitFields } from "./fieldVisitor.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

// Singleton instances for performance
const lexicalRenderer = new LexicalRenderer();

/**
 * Transforms rich-text fields from Lexical format to new format with state + HTML.
 * NOTE: This transformer expects wrapInData to run FIRST, so values is in data.values.
 *
 * Process:
 * 1. Recursively finds all rich-text fields
 * 2. Decompresses the value
 * 3. Checks if it has a 'root' key (Lexical format)
 * 4. Converts to { state: JSON.stringify(value), html: renderer.render(value) }
 * 5. Re-compresses and replaces the field value
 */
export const transformRichText = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "transformRichText",
    async ctx => {
        // Extract modelId from data envelope
        const data = ctx.record.data as Record<string, unknown> | undefined;
        if (!data) {
            return; // No data envelope
        }

        const modelId = data.modelId;
        if (!modelId) {
            return; // No model ID
        }

        const model = ctx.modelProvider.getModel(modelId as string);
        if (!model) {
            return; // Model not found
        }

        const values = data.values;
        if (!values || typeof values !== "object") {
            return; // No values to transform
        }

        // Transform all rich-text fields recursively using field visitor
        await visitFields(
            values as Record<string, unknown>,
            model.fields,
            async (values, field, value) => {
                if (field.type !== "rich-text") {
                    return;
                }
                await transformRichTextField({
                    compressionHandler: ctx.compressionHandler,
                    values,
                    storageId: field.storageId,
                    value
                });
            }
        );
    }
);

interface ITransformRichTextFieldParams {
    compressionHandler: CompressionHandler.Interface;
    values: Record<string, unknown>;
    storageId: string;
    value: unknown;
}
/**
 * Transforms a single rich-text field value
 */
async function transformRichTextField(params: ITransformRichTextFieldParams): Promise<void> {
    const { compressionHandler, values, storageId, value } = params;
    // Check if value has compression format
    if (!value || typeof value !== "object" || !("compression" in value) || !("value" in value)) {
        return; // Not in expected compressed format
    }

    try {
        // Decompress the value
        const decompressed = await compressionHandler.decompress(value);

        // Check if it has a 'root' key (Lexical format)
        if (!decompressed || typeof decompressed !== "object" || !("root" in decompressed)) {
            return; // Not Lexical format, skip
        }

        // Convert to new format
        const lexicalState = decompressed as Parameters<typeof lexicalRenderer.render>[0];
        const newFormat = {
            state: JSON.stringify(lexicalState),
            html: lexicalRenderer.render(lexicalState)
        };

        // Replace the field value
        values[storageId] = await compressionHandler.compress(newFormat);
    } catch (error) {
        console.warn(
            `[transformRichText] Failed to transform ${storageId}:`,
            (error as Error).message
        );
        // Skip this field and continue
    }
}
