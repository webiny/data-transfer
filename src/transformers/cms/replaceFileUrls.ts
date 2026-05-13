import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { MigrationConfig } from "~/features/MigrationConfig/index.ts";
import type { CompressionHandler } from "@webiny/utils/exports/api.js";
import { visitFields } from "./fieldVisitor.ts";

interface IRichTextBody {
    state?: string;
    html?: string;
}

interface IVisitParams {
    fieldValues: Record<string, unknown>;
    field: { type: string; storageId: string };
    value: unknown;
    source: string;
    target: string;
    compressionHandler: CompressionHandler.Interface;
}

function replaceUrls(str: string, source: string, target: string): string {
    return str.replaceAll(source, target);
}

function replaceRichTextUrls(rt: IRichTextBody, source: string, target: string): void {
    if (typeof rt.state === "string") {
        rt.state = replaceUrls(rt.state, source, target);
    }
    if (typeof rt.html === "string") {
        rt.html = replaceUrls(rt.html, source, target);
    }
}

function isCompressedValue(value: object): boolean {
    return "compression" in value && "value" in value;
}

function replaceFileField(params: IVisitParams): void {
    const { fieldValues, field, value, source, target } = params;
    if (Array.isArray(value)) {
        fieldValues[field.storageId] = value.map(v =>
            typeof v === "string" ? replaceUrls(v, source, target) : v
        );
    } else if (typeof value === "string") {
        fieldValues[field.storageId] = replaceUrls(value, source, target);
    }
}

async function replaceRichTextField(params: IVisitParams): Promise<void> {
    const { fieldValues, field, value, source, target, compressionHandler } = params;
    if (!value || typeof value !== "object") {
        return;
    }
    if (isCompressedValue(value as object)) {
        const rt = (await compressionHandler.decompress(value)) as IRichTextBody;
        replaceRichTextUrls(rt, source, target);
        fieldValues[field.storageId] = await compressionHandler.compress(rt);
    } else {
        // value is a reference already in fieldValues — mutation propagates without re-assignment
        replaceRichTextUrls(value as IRichTextBody, source, target);
    }
}

async function visitFieldUrls(params: IVisitParams): Promise<void> {
    if (params.field.type === "file") {
        replaceFileField(params);
    } else if (params.field.type === "rich-text") {
        await replaceRichTextField(params);
    }
}

export function replaceFileUrls(config: MigrationConfig.Interface) {
    return createTransformer<BaseTransformContext.Interface<BaseRecord>>(
        "replaceFileUrls",
        async ctx => {
            if (!config.fileUrls?.target || !config.fileUrls.source) {
                return;
            }
            const { source, target } = config.fileUrls;

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
                    await visitFieldUrls({
                        fieldValues,
                        field,
                        value,
                        source,
                        target,
                        compressionHandler
                    });
                }
            );
        }
    );
}
