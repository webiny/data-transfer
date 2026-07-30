import { createTransformer } from "~/transformers/createTransformer.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { Logger } from "~/tools/Logger/abstractions/Logger.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import { LexicalRenderer } from "./lexicalRenderer.ts";
import { visitFields } from "./fieldVisitor.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";
import { generateInitialLexicalValue } from "@webiny/lexical-nodes/generateInitialLexicalValue.js";

const lexicalRenderer = new LexicalRenderer();

export const transformRichText = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "transformRichText",
    async ctx => {
        const data = ctx.record.data as Record<string, unknown> | undefined;
        if (!data) {
            return;
        }

        const modelId = data.modelId;
        if (!modelId) {
            return;
        }

        const model = ctx.modelProvider.getModel(modelId as string);
        if (!model) {
            return;
        }

        const values = data.values;
        if (!values || typeof values !== "object") {
            return;
        }

        await visitFields(
            values as Record<string, unknown>,
            model.fields,
            async (values, field, value) => {
                if (field.type !== "rich-text") {
                    return;
                }
                await transformRichTextField({
                    original: ctx.original,
                    compressionHandler: ctx.compressionHandler,
                    logger: ctx.logger,
                    values,
                    storageId: field.storageId,
                    value
                });
            }
        );
    }
);

interface ITransformRichTextFieldParams {
    original: BaseRecord;
    compressionHandler: CompressionHandler.Interface;
    logger: Logger.Interface;
    values: Record<string, unknown>;
    storageId: string;
    value: unknown;
}

async function transformRichTextField(params: ITransformRichTextFieldParams): Promise<void> {
    const { original, compressionHandler, logger, values, storageId, value } = params;
    if (!value || typeof value !== "object" || !("compression" in value) || !("value" in value)) {
        return;
    }

    const decompressed = await compressionHandler.decompress(value);
    try {
        if (!decompressed || typeof decompressed !== "object" || !("root" in decompressed)) {
            return;
        }

        let lexicalState = decompressed as Parameters<typeof lexicalRenderer.render>[0];

        if (!lexicalState.root.children?.length) {
            lexicalState = JSON.parse(generateInitialLexicalValue()) as Parameters<
                typeof lexicalRenderer.render
            >[0];
        }

        const newFormat = {
            state: JSON.stringify(lexicalState),
            html: lexicalRenderer.render(lexicalState)
        };

        values[storageId] = await compressionHandler.compress(newFormat);
    } catch (error) {
        logger.warn(
            `[transformRichText][${original.PK} / ${original.SK}] Failed to transform ${storageId}: ${(error as Error).message}`
        );
    }
}
