import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { MigrationConfig } from "~/features/MigrationConfig/index.ts";
import { visitFields } from "./fieldVisitor.ts";

interface IRichTextBody {
    state?: string;
    html?: string;
}

export function replaceFileUrls(config: MigrationConfig.Interface) {
    if (!config.fileUrls) {
        return createTransformer<BaseTransformContext.Interface<BaseRecord>>(
            "replaceFileUrls",
            () => {}
        );
    }

    const { source, target } = config.fileUrls;

    return createTransformer<BaseTransformContext.Interface<BaseRecord>>(
        "replaceFileUrls",
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

            const { compressionHandler } = ctx;

            await visitFields(
                values as Record<string, unknown>,
                model.fields,
                async (fieldValues, field, value) => {
                    if (field.type === "file") {
                        if (Array.isArray(value)) {
                            fieldValues[field.storageId] = (value as unknown[]).map(v =>
                                typeof v === "string" ? v.replaceAll(source, target) : v
                            );
                        } else if (typeof value === "string") {
                            fieldValues[field.storageId] = value.replaceAll(source, target);
                        }
                        return;
                    }

                    if (field.type === "rich-text" && value && typeof value === "object") {
                        if ("compression" in (value as object) && "value" in (value as object)) {
                            const decompressed = (await compressionHandler.decompress(
                                value
                            )) as IRichTextBody;
                            if (typeof decompressed.state === "string") {
                                decompressed.state = decompressed.state.replaceAll(source, target);
                            }
                            if (typeof decompressed.html === "string") {
                                decompressed.html = decompressed.html.replaceAll(source, target);
                            }
                            fieldValues[field.storageId] =
                                await compressionHandler.compress(decompressed);
                        } else {
                            const rt = value as IRichTextBody;
                            if (typeof rt.state === "string") {
                                rt.state = rt.state.replaceAll(source, target);
                            }
                            if (typeof rt.html === "string") {
                                rt.html = rt.html.replaceAll(source, target);
                            }
                        }
                    }
                }
            );
        }
    );
}
