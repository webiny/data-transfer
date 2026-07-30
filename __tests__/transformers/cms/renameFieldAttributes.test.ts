import { describe, it, expect } from "vitest";
import { renameFieldAttributes } from "~/transformers/cms/renameFieldAttributes.js";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("renameFieldAttributes", () => {
    it("renames helpText→note, placeholderText→placeholder, multipleValues→list on top-level fields", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#M#testModel",
            SK: "A",
            TYPE: "cms.model",
            data: {
                fields: [
                    {
                        id: "f1",
                        fieldId: "title",
                        storageId: "text@title",
                        type: "text",
                        helpText: "Enter a title",
                        placeholderText: "Title...",
                        multipleValues: false
                    }
                ]
            }
        });
        renameFieldAttributes(ctx);
        const data = ctx.record.data as Record<string, unknown>;
        const field = (data.fields as Record<string, unknown>[])[0]!;
        expect(field.note).toBe("Enter a title");
        expect(field.helpText).toBeUndefined();
        expect(field.placeholder).toBe("Title...");
        expect(field.placeholderText).toBeUndefined();
        expect(field.list).toBe(false);
        expect(field.multipleValues).toBeUndefined();
    });

    it("recursively renames nested fields inside settings.fields", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#M#testModel",
            SK: "A",
            TYPE: "cms.model",
            data: {
                fields: [
                    {
                        id: "f1",
                        fieldId: "obj",
                        storageId: "object@obj",
                        type: "object",
                        settings: {
                            fields: [
                                {
                                    id: "f2",
                                    fieldId: "nested",
                                    storageId: "text@nested",
                                    type: "text",
                                    helpText: "Nested help"
                                }
                            ]
                        }
                    }
                ]
            }
        });
        renameFieldAttributes(ctx);
        const data = ctx.record.data as Record<string, unknown>;
        const outer = (data.fields as Record<string, unknown>[])[0]!;
        const settings = outer.settings as Record<string, unknown>;
        const nested = (settings.fields as Record<string, unknown>[])[0]!;
        expect(nested.note).toBe("Nested help");
        expect(nested.helpText).toBeUndefined();
    });
});
