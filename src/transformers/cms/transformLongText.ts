import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { visitFields } from "./fieldVisitor.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

export const transformLongText = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "transformLongText",
    async ctx => {
        const data = ctx.record.data as Record<string, unknown> | undefined;
        if (!data) {
            return;
        }

        const modelId = data.modelId as string | undefined;
        if (!modelId) {
            return;
        }

        const model = ctx.modelProvider.getModel(modelId);
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
                if (field.type !== "long-text") {
                    return;
                }
                await transformLongTextField({
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

interface ITransformLongTextFieldParams {
    original: BaseRecord;
    compressionHandler: CompressionHandler.Interface;
    logger: Logger.Interface;
    values: Record<string, unknown>;
    storageId: string;
    value: unknown;
}

async function transformLongTextField(params: ITransformLongTextFieldParams): Promise<void> {
    const { original, compressionHandler, logger, values, storageId, value } = params;

    if (!value || typeof value !== "object" || !("compression" in value) || !("value" in value)) {
        return;
    }
    try {
        const decompressed = await compressionHandler.decompress<string>(value);
        if (!decompressed) {
            return;
        }

        values[storageId] = await compressionHandler.compress(JSON.stringify(decompressed));
    } catch (error) {
        logger.warn(
            `[transformLongText][${original.PK} / ${original.SK}] Failed to transform ${storageId}: ${(error as Error).message}`
        );
    }
}
