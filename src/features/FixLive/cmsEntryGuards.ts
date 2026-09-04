import { isCmsEntry } from "~/domain/transform/filters.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import type { DatabaseRecord } from "~/services/DynamoDbClient/abstractions/DynamoDbClient.js";

const INTERNAL_MODELS = new Set(["fmfile", "wbyfmfile"]);

export function isCmsEntryRow(row: DatabaseRecord): boolean {
    return isCmsEntry(row as BaseRecord);
}

export function isInternalModel(modelId: unknown): boolean {
    return typeof modelId === "string" && INTERNAL_MODELS.has(modelId.toLowerCase());
}

export function readModelId(record: DatabaseRecord): unknown {
    if (record.modelId !== undefined) {
        return record.modelId;
    }
    const data = record.data as Record<string, unknown> | undefined;
    return data?.modelId;
}
