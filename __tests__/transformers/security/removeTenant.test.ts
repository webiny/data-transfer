import { describe, it, expect } from "vitest";
import { removeTenant } from "~/transformers/security/removeTenant.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("removeTenant", () => {
    it("deletes the tenant attribute from the record", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#ROLES",
            SK: "ROLE#admin",
            TYPE: "security.role",
            tenant: "root",
            name: "Administrators"
        });

        removeTenant(ctx);

        expect("tenant" in ctx.record).toBe(false);
        expect(ctx.record.name).toBe("Administrators");
    });
});
