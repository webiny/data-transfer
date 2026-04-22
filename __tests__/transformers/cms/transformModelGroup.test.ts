import { describe, it, expect } from "vitest";
import { transformModelGroup } from "~/transformers/cms/transformModelGroup.ts";
import { makeFakeDdbCoreContext } from "../fakeContext.ts";

describe("transformModelGroup", () => {
    it("replaces group object with slug when group record is found", async () => {
        const ctx = makeFakeDdbCoreContext(
            {
                PK: "T#root#CMS#M#blog",
                SK: "A",
                TYPE: "cms.model",
                locale: "en-US",
                data: {
                    tenant: "root",
                    group: { id: "group-abc", name: "My Blog Group" }
                }
            },
            {}
        );
        ctx.querySourceRecord = (async (pk: string, sk?: string) => {
            if (pk === "T#root#L#en-US#CMS#CMG" && sk === "group-abc") {
                return { slug: "my-blog-group" };
            }
            return null;
        }) as typeof ctx.querySourceRecord;
        await transformModelGroup(ctx);
        const data = ctx.record.data as Record<string, unknown>;
        expect(data.group).toBe("my-blog-group");
    });

    it("falls back to name-derived slug when group record is not found", async () => {
        const ctx = makeFakeDdbCoreContext(
            {
                PK: "T#root#CMS#M#blog",
                SK: "A",
                TYPE: "cms.model",
                locale: "en-US",
                data: {
                    tenant: "root",
                    group: { id: "missing-group", name: "My Group Name" }
                }
            },
            {}
        );
        ctx.querySourceRecord = async () => null;
        await transformModelGroup(ctx);
        const data = ctx.record.data as Record<string, unknown>;
        expect(data.group).toBe("my-group-name");
    });
});
