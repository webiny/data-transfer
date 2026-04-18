import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { isSecurityTeam } from "~/domain/transform/filters.ts";
import { addGsiTenant, removeAttributes, wrapInData } from "~/transformers/global/index.ts";

export const securityTeamsPipeline = createDdbPipeline("security-teams", builder => {
    builder
        .filter(createFilter(isSecurityTeam))
        .use(wrapInData)
        .use(addGsiTenant)
        .use(removeAttributes);
});
