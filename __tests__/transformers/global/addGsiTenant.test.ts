import { describe, it, expect } from "vitest";
import { addGsiTenant } from "~/transformers/global/addGsiTenant.js";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("addGsiTenant", () => {
    it("extracts tenant from PK when PK starts with T#", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#P#home",
            SK: "record#1",
            TYPE: "cms.entry"
        });
        addGsiTenant(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.GSI_TENANT).toBe("root");
    });

    it("extracts tenant from data.tenant when PK does not start with T#", () => {
        const ctx = makeFakeBaseContext({
            PK: "OTHER#record#1",
            SK: "record#1",
            TYPE: "cms.entry",
            data: { tenant: "myTenant" }
        });
        addGsiTenant(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.GSI_TENANT).toBe("myTenant");
    });

    it("skips if GSI_TENANT already exists", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#P#home",
            SK: "record#1",
            TYPE: "cms.entry",
            GSI_TENANT: "existing"
        });
        addGsiTenant(ctx);
        const record = ctx.record as Record<string, unknown>;
        expect(record.GSI_TENANT).toBe("existing");
    });
});
