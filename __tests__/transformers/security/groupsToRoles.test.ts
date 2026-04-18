import { describe, it, expect } from "vitest";
import { groupsToRoles } from "~/transformers/security/groupsToRoles.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("groupsToRoles", () => {
    it("rewrites TYPE, _et, and GROUP/GROUPS key segments for security.group records", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#GROUPS",
            SK: "GROUP#admin",
            GSI1_PK: "T#root#GROUPS",
            GSI1_SK: "GROUP#admin",
            TYPE: "security.group",
            _et: "SecurityGroup"
        });

        groupsToRoles(ctx);

        expect(ctx.record.TYPE).toBe("security.role");
        expect(ctx.record._et).toBe("SecurityRole");
        expect(ctx.record.PK).toBe("T#root#ROLES");
        expect(ctx.record.SK).toBe("ROLE#admin");
        expect(ctx.record.GSI1_PK).toBe("T#root#ROLES");
        expect(ctx.record.GSI1_SK).toBe("ROLE#admin");
    });

    it("leaves non-security.group records untouched", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#GROUPS",
            SK: "GROUP#admin",
            TYPE: "cms.entry",
            _et: "CmsEntry"
        });

        groupsToRoles(ctx);

        expect(ctx.record.TYPE).toBe("cms.entry");
        expect(ctx.record._et).toBe("CmsEntry");
        expect(ctx.record.PK).toBe("T#root#GROUPS");
        expect(ctx.record.SK).toBe("GROUP#admin");
    });
});
