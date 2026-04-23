import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { getCorrectStorageId } from "./fieldUtils.ts";
import { visitFields } from "./fieldVisitor.ts";

export const fixBrokenStorageKeys = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "fixBrokenStorageKeys",
    async ctx => {
        if (!ctx.modelProvider) {
            throw new Error("ModelProvider is required for fixBrokenStorageKeys");
        }

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
            ctx.logger.warn(`[fixBrokenStorageKeys] Model ${modelId} not found, skipping`);
            return;
        }

        const values = data.values;
        if (!values || typeof values !== "object") {
            return;
        }

        await fixAllKeys(values as Record<string, unknown>, model.fields, ctx.logger);
    }
);

async function fixAllKeys(
    values: Record<string, unknown>,
    modelFields: any[],
    logger: Logger.Interface
): Promise<void> {
    await visitFields(values, modelFields, (values, field, value) => {
        const correctKey = getCorrectStorageId(field);
        const declaredKey = field.storageId;
        const fieldIdKey = field.fieldId;

        const wrongKeys = new Set<string>();
        if (declaredKey !== correctKey) {
            wrongKeys.add(declaredKey);
        }
        if (fieldIdKey !== correctKey) {
            wrongKeys.add(fieldIdKey);
        }

        let foundValue: unknown = values[correctKey];
        let wrongKeyUsed: string | null = null;

        if (foundValue === undefined) {
            for (const wrongKey of wrongKeys) {
                if (wrongKey in values) {
                    foundValue = values[wrongKey];
                    wrongKeyUsed = wrongKey;
                    break;
                }
            }
        }

        if (wrongKeyUsed) {
            values[correctKey] = foundValue;
            delete values[wrongKeyUsed];
            logger.debug(`[fixBrokenStorageKeys] Fixed key: ${wrongKeyUsed} → ${correctKey}`);
        }
    });
}
