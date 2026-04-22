import { describe, it, expect } from "vitest";
import { transformPermissions } from "~/transformers/security/transformPermissions.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("transformPermissions", () => {
    it("drops content.i18n, flattens cms.contentModel models, and resolves cms.contentModelGroup slugs", async () => {
        const record = {
            PK: "T#root#L#en-US#ROLE#admin",
            SK: "A",
            TYPE: "security.role",
            data: {
                tenant: "root",
                permissions: [
                    { name: "content.i18n" },
                    {
                        name: "cms.contentModel",
                        models: { "en-US": ["article", "page"], "de-DE": ["artikel"] }
                    },
                    {
                        name: "cms.contentModelGroup",
                        groups: { "en-US": ["group-1", "group-2"] }
                    },
                    { name: "cms.contentEntry", rwd: "rwd" }
                ]
            }
        };
        const ctx = makeFakeBaseContext(record);

        const queried: Array<{ pk: string; sk?: string }> = [];
        (ctx as { querySourceRecord: unknown }).querySourceRecord = async (
            pk: string,
            sk?: string
        ) => {
            queried.push({ pk, sk });
            if (pk === "T#root#GROUP#group-1") {
                return { slug: "content" };
            }
            if (pk === "T#root#GROUP#group-2") {
                return { slug: "marketing" };
            }
            return null;
        };

        await transformPermissions(ctx);

        const data = ctx.record.data as Record<string, unknown>;
        const permissions = data.permissions as Array<Record<string, unknown>>;

        expect(permissions.find(p => p.name === "content.i18n")).toBeUndefined();

        const cmsModel = permissions.find(p => p.name === "cms.contentModel") as {
            models: unknown;
        };
        expect(cmsModel.models).toEqual(["article", "page"]);

        const cmsGroup = permissions.find(p => p.name === "cms.contentModelGroup") as {
            groups: unknown;
        };
        expect(cmsGroup.groups).toEqual(["content", "marketing"]);

        expect(queried).toEqual([
            { pk: "T#root#GROUP#group-1", sk: "A" },
            { pk: "T#root#GROUP#group-2", sk: "A" }
        ]);
    });

    it("returns early when data envelope is missing", async () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#L#en-US#ROLE#admin",
            SK: "A",
            TYPE: "security.role"
        });

        await expect(transformPermissions(ctx)).resolves.toBeUndefined();
    });
});
