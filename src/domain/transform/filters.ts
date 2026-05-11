import type { BaseRecord } from "~/domain/transform/types/records.js";

const getPropertyFromRecord = <T>(
    record: Record<string, unknown>,
    propertyName: string
): T | undefined => {
    const value = record[propertyName] as T | undefined;
    if (value !== undefined) {
        return value;
    }
    const data = record.data as Record<string, unknown> | undefined;
    if (data) {
        return data[propertyName] as T | undefined;
    }
    return undefined;
};

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

export const isCmsEntry = (input: BaseRecord) => {
    const isType = byTypePrefix("cms.entry")(input);
    if (isType) {
        return true;
    }
    return input.PK.includes("#CMS#CME#");
};

export const byIncludesModelId =
    (target: string) =>
    (record: BaseRecord): boolean => {
        const input = target.toLowerCase();
        /**
         * This is for OS records. Also, we are positive that no record has index, except the OS Record one
         */
        const index = getPropertyFromRecord<string>(record, "index");
        if (typeof index === "string" && index.toLowerCase().includes(input)) {
            return true;
        }

        const modelId = getPropertyFromRecord<string>(record, "modelId");

        return typeof modelId === "string" && modelId.toLowerCase().includes(input);
    };

export const isAcoSearchRecord = byIncludesModelId("acoSearchRecord");

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

export const isOsBackgroundTask = (record: Record<string, unknown>): boolean => {
    const data = record.data as Record<string, unknown> | undefined;
    const modelId = data?.modelId as string | undefined;
    return modelId === "webinyTask" || modelId === "webinyTaskLog";
};

export const isOsMailerSettings = (record: Record<string, unknown>): boolean => {
    const data = record.data as Record<string, unknown> | undefined;
    return (data?.modelId as string | undefined) === "mailerSettings";
};

export const isAuditLogEntry = (record: BaseRecord): boolean => {
    const modelId = getPropertyFromRecord<string>(record, "modelId");
    if (!modelId) {
        return false;
    }
    return modelId.toLowerCase() === "acosearchrecord-auditlogs" && record.SK === "L";
};

export const isMigrationRecord = (record: BaseRecord): boolean => {
    if (!record.PK) {
        return false;
    }
    return record.PK.startsWith("MIGRATION");
};

export const isFormBuilderRecord = (record: BaseRecord): boolean => {
    if (typeof record.PK === "string" && record.PK.includes("#FB#")) {
        return true;
    }
    const type = record.TYPE as string | undefined;
    if (!type) {
        return false;
    }
    return type.startsWith("fb.form.") || type === "fb.formSubmission";
};
