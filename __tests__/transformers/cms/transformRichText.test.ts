import { describe, it, expect } from "vitest";
import { transformRichText } from "~/transformers/cms/transformRichText.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("transformRichText", () => {
    it("does not throw on an entry that has no rich-text fields", async () => {
        const modelProvider = {
            getModel(_modelId: string) {
                return {
                    modelId: "myModel",
                    fields: [
                        {
                            id: "title",
                            fieldId: "title",
                            storageId: "text@title",
                            type: "text"
                        }
                    ]
                };
            }
        };
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "REV#0001",
                TYPE: "cms.entry",
                data: {
                    modelId: "myModel",
                    values: {
                        "text@title": "hello"
                    }
                }
            },
            { modelProvider }
        );

        await expect(transformRichText(ctx)).resolves.toBeUndefined();
        const data = ctx.record.data as Record<string, unknown>;
        const values = data.values as Record<string, unknown>;
        expect(values["text@title"]).toBe("hello");
    });
});
