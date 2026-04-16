import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";
import { GzipCompression } from "../../utils/gzip-compression.ts";
import { LexicalRenderer } from "../../utils/LexicalRenderer.ts";
import { visitFields } from "../../utils/field-visitor.ts";

// ============================================================================
// Transform Rich-Text Transformer
// ============================================================================

// Singleton instances for performance
const gzipCompression = new GzipCompression();
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
export const transformRichText: Transformer = {
    name: "transformRichText",
    async transform(ctx: TransformContext) {
        if (!ctx.modelProvider) {
            return; // Model provider required
        }

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
                if (field.type === "rich-text") {
                    await transformRichTextField(values, field.storageId, value);
                }
            }
        );
    }
};

/**
 * Transforms a single rich-text field value
 */
async function transformRichTextField(
    values: Record<string, unknown>,
    storageId: string,
    value: unknown
): Promise<void> {
    // Check if value has compression format
    if (!value || typeof value !== "object" || !("compression" in value) || !("value" in value)) {
        return; // Not in expected compressed format
    }

    const compressedValue = value as { compression: string; value: string };

    // Check if it's gzip compressed
    if (!gzipCompression.canDecompress(compressedValue)) {
        return; // Not gzip compressed
    }

    try {
        // Decompress the value
        const decompressed = await gzipCompression.decompress(compressedValue);

        // Check if it has a 'root' key (Lexical format)
        if (!decompressed || typeof decompressed !== "object" || !("root" in decompressed)) {
            return; // Not Lexical format, skip
        }

        // Convert to new format
        const newFormat = {
            state: JSON.stringify(decompressed),
            html: lexicalRenderer.render(decompressed)
        };

        // Compress the new format
        const compressed = await gzipCompression.compress(newFormat);

        // Replace the field value
        values[storageId] = compressed;

        console.log(`[transformRichText] Transformed field: ${storageId}`);
    } catch (error) {
        console.warn(
            `[transformRichText] Failed to transform ${storageId}:`,
            (error as Error).message
        );
        // Skip this field and continue
    }
}
