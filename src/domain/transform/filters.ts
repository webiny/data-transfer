import type { BaseRecord } from "~/domain/transform/types/records.js";

export const byType =
    (type: string) =>
    (record: Record<string, unknown>): boolean => {
        return record.TYPE === type;
    };

export const byTypePrefix =
    (prefix: string) =>
    (record: BaseRecord): boolean => {
        const type = record.TYPE as string;
        return Boolean(type && type.startsWith(prefix));
    };

export const isCmsGroup = (record: BaseRecord): boolean => {
    if (record.TYPE === "cms.group") {
        return true;
    }
    return record.PK.includes("#CMS#CMG");
};

export const isCmsModel = byType("cms.model");

export const isCmsEntry = byTypePrefix("cms.entry");

export const isBackgroundTask = (item: BaseRecord) => {
    if (item.modelId === "webinyTask" || item.modelId === "webinyTaskLog") {
        return true;
    } else if (typeof item.GSI1_PK !== "string") {
        return false;
    }
    return item.GSI1_PK.includes("webinyTask") || item.GSI1_PK.includes("webinyTaskLog");
};

export const isFmFile = (record: BaseRecord): boolean => {
    const modelId =
        (record.modelId as string) ||
        ((record.data as Record<string, unknown> | undefined)?.modelId as string);
    return modelId === "fmFile" || modelId === "wbyFmFile";
};

export const isFlpRecord = (record: Record<string, unknown>): boolean => {
    return typeof record.PK === "string" && record.PK.includes("#FLP#");
};

export const isBuiltInSecurityRole = (record: Record<string, unknown>): boolean => {
    const slug = (record.slug || record.GSI1_SK) as string;
    return ["full-access", "anonymous"].includes(slug);
};

export const isSecurityTeam = byType("security.team");
