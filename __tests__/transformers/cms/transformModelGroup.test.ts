import { describe, it, expect } from "vitest";
import { transformModelGroup } from "~/transformers/cms/transformModelGroup.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("transformModelGroup", () => {
    it("replaces group object with slug when group record is found", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#M#blog",
                SK: "A",
                TYPE: "cms.model",
                data: {
                    tenant: "root",
                    group: { id: "group-abc", name: "My Blog Group" }
                }
            },
            {}
        );
        // Override queryRecord to return a matching group record
        (ctx as unknown as Record<string, unknown>).queryRecord = async (
            pk: string,
            _sk?: string
        ) => {
            if (pk === "T#root#GROUP#group-abc") {
                return { slug: "my-blog-group" };
            }
            return null;
        };
        await transformModelGroup(ctx);
        const data = ctx.record.data as Record<string, unknown>;
        expect(data.group).toBe("my-blog-group");
    });

    it("falls back to name-derived slug when group record is not found", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#M#blog",
                SK: "A",
                TYPE: "cms.model",
                data: {
                    tenant: "root",
                    group: { id: "missing-group", name: "My Group Name" }
                }
            },
            {}
        );
        // queryRecord returns null (not found)
        (ctx as unknown as Record<string, unknown>).queryRecord = async () => null;
        await transformModelGroup(ctx);
        const data = ctx.record.data as Record<string, unknown>;
        expect(data.group).toBe("my-group-name");
    });
});
