import { createTransformer } from "~/transformers/createTransformer.js";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.js";
import type { Logger } from "~/tools/Logger/abstractions/Logger.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import { visitFields } from "./fieldVisitor.ts";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

/**
 * OS-table records hold the OpenSearch document gzipped under `data`; OsScanner
 * unpacks it, so `ctx.record.data` is the `CmsIndexEntry`. That document keeps
 * TWO parallel field trees, built by `prepareEntryToIndex` in
 * `api-headless-cms-utils-os` (and mirrored into nested `object` fields by
 * `ObjectFieldIndex.processToIndex`):
 *
 *   - `values`    — the searchable tree, mapped in the index
 *   - `rawValues` — the non-searchable passthrough tree
 *
 * Which tree a field lands in is decided per field type. `LongTextFieldIndex`
 * returns `{ value: rawValue }`, i.e. long-text goes into `values` only, holding
 * the *decompressed* string (in `prepareEntryToIndex` the `rawValue` argument is
 * the entry value, `value` is the storage value — the names read backwards).
 * `RichTextFieldIndex` does the opposite and writes to `rawValues` only. So for
 * long-text, `values` is the tree to fix, and its mapping is `text`.
 *
 * In DynamoDB the same field is *meant* to be compressed — `LongTextStorageTransform`
 * wraps it as `{ compression, value }`. Some v5 records reached OpenSearch with
 * that envelope still in place, typically long-text nested inside `object` fields,
 * so indexing them into v6 fails with:
 *
 *   failed to parse field [values.object@a.object@b.long-text@c] of type [text]
 *   Preview of field's value: '{compression=gzip, value=H4sIAAA...}'
 *
 * This transformer mirrors `LongTextStorageTransform.fromStorage`: it unwraps any
 * long-text value that is still an envelope, and leaves already-plain values alone.
 * It deliberately does not touch `rawValues` — long-text is never written there,
 * and that tree is not mapped as `text`, so an envelope sitting in it is inert.
 */
export const fixLongText = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "fixLongText",
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
                if (field.type !== "long-text") {
                    return;
                }
                await fixLongTextField({
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

interface IFixLongTextFieldParams {
    original: BaseRecord;
    compressionHandler: CompressionHandler.Interface;
    logger: Logger.Interface;
    values: Record<string, unknown>;
    storageId: string;
    value: unknown;
}

interface ILongTextStorageValue {
    compression: string;
    value: string;
    isArray?: boolean;
}

function isCompressedEnvelope(value: unknown): value is ILongTextStorageValue {
    return (
        !!value &&
        typeof value === "object" &&
        Array.isArray(value) === false &&
        "compression" in value &&
        "value" in value
    );
}

async function fixLongTextField(params: IFixLongTextFieldParams): Promise<void> {
    const { original, compressionHandler, logger, values, storageId, value } = params;

    // Plain strings, numbers, arrays and empty values are already index-ready.
    if (!isCompressedEnvelope(value)) {
        return;
    }

    try {
        const decompressed = await compressionHandler.decompress<string>(value);

        // A multi-value long-text field stores the array JSON-stringified.
        values[storageId] = value.isArray ? JSON.parse(decompressed) : decompressed;
    } catch (error) {
        logger.warn(
            `[fixLongText][${original.PK} / ${original.SK}] Failed to decompress ${storageId}, falling back to an empty value: ${(error as Error).message}`
        );
        values[storageId] = value.isArray ? [] : "";
    }
}
