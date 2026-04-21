export const byType =
    (type: string) =>
    (record: Record<string, unknown>): boolean => {
        return record.TYPE === type;
    };

export const byTypePrefix =
    (prefix: string) =>
    (record: Record<string, unknown>): boolean => {
        const type = record.TYPE as string;
        return Boolean(type && type.startsWith(prefix));
    };

export const isCmsModel = byType("cms.model");

export const isCmsEntry = byTypePrefix("cms.entry");

export const isFmFile = (record: Record<string, unknown>): boolean => {
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
