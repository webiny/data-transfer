import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isBuiltInSecurityRole } from "~/domain/transform/filters.ts";
import { addGsiTenant, removeAttributes, wrapInData } from "~/transformers/global/index.ts";
import { groupsToRoles, transformPermissions } from "~/transformers/security/index.ts";

const isMigratableSecurityGroup = (record: BaseRecord): boolean => {
    return record.TYPE === "security.group" && !isBuiltInSecurityRole(record);
};

export const securityGroupsPipeline = createDdbPipeline("security-groups", builder => {
    builder
        .filter(createFilter<BaseRecord>(isMigratableSecurityGroup))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(groupsToRoles)
        .use(transformPermissions)
        .use(removeAttributes);
});
