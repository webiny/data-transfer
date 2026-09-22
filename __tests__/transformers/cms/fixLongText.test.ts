import { describe, it, expect } from "vitest";
import { fixLongText } from "~/transformers/cms/fixLongText.js";
import { makeFakeBaseContext } from "../fakeContext.ts";
import type { CompressionHandler } from "@webiny/utils/exports/api.js";

const envelope = (value: string, isArray?: boolean) => ({
    compression: "gzip",
    value: Buffer.from(value).toString("base64"),
    ...(isArray ? { isArray: true } : {})
});

function makeCompressionHandler(): CompressionHandler.Interface {
    return {
        compress: async () => {
            throw new Error("not used");
        },
        decompress: async (data: unknown) => {
            const { value } = data as { value: string };
            return Buffer.from(value, "base64").toString("utf-8") as never;
        }
    };
}

const modelProvider = {
    getModel(_modelId: string) {
        return {
            modelId: "smartPageModel",
            fields: [
                {
                    id: "title",
                    fieldId: "title",
                    storageId: "text@title",
                    type: "text"
                },
                {
                    id: "summary",
                    fieldId: "summary",
                    storageId: "long-text@summary",
                    type: "long-text"
                },
                {
                    id: "keywords",
                    fieldId: "keywords",
                    storageId: "long-text@keywords",
                    type: "long-text",
                    multipleValues: true
                },
                {
                    id: "pageSettings",
                    fieldId: "pageSettings",
                    storageId: "object@pageSettings",
                    type: "object",
                    settings: {
                        fields: [
                            {
                                id: "generalPageSettings",
                                fieldId: "generalPageSettings",
                                storageId: "object@generalPageSettings",
                                type: "object",
                                settings: {
                                    fields: [
                                        {
                                            id: "metaDescription",
                                            fieldId: "metaDescription",
                                            storageId: "long-text@metaDescription",
                                            type: "long-text"
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        };
    }
};

function makeCtx(values: Record<string, unknown>, compressionHandler = makeCompressionHandler()) {
    return makeFakeBaseContext(
        {
            PK: "T#root#CMS#CME#6866974ee922670002c6a961",
            SK: "L",
            TYPE: "cms.entry.l",
            data: {
                modelId: "smartPageModel",
                values
            }
        },
        { modelProvider, compressionHandler }
    );
}

function readValues(ctx: ReturnType<typeof makeCtx>) {
    const data = ctx.record.data as Record<string, unknown>;
    return data.values as Record<string, unknown>;
}

describe("fixLongText", () => {
    it("decompresses a long-text envelope nested inside object fields", async () => {
        const ctx = makeCtx({
            "object@pageSettings": {
                "object@generalPageSettings": {
                    "long-text@metaDescription": envelope("A meta description.")
                }
            }
        });

        await fixLongText(ctx);

        const settings = readValues(ctx)["object@pageSettings"] as Record<string, any>;
        expect(settings["object@generalPageSettings"]["long-text@metaDescription"]).toBe(
            "A meta description."
        );
    });

    it("decompresses an empty envelope into an empty string", async () => {
        const ctx = makeCtx({ "long-text@summary": envelope("") });

        await fixLongText(ctx);

        expect(readValues(ctx)["long-text@summary"]).toBe("");
    });

    it("parses a multi-value long-text envelope back into an array", async () => {
        const ctx = makeCtx({
            "long-text@keywords": envelope(JSON.stringify(["one", "two"]), true)
        });

        await fixLongText(ctx);

        expect(readValues(ctx)["long-text@keywords"]).toEqual(["one", "two"]);
    });

    it("leaves already-decompressed values untouched", async () => {
        const ctx = makeCtx({
            "text@title": "hello",
            "long-text@summary": "plain text",
            "long-text@keywords": ["one", "two"]
        });

        await fixLongText(ctx);

        const values = readValues(ctx);
        expect(values["text@title"]).toBe("hello");
        expect(values["long-text@summary"]).toBe("plain text");
        expect(values["long-text@keywords"]).toEqual(["one", "two"]);
    });

    it("falls back to an empty value when decompression fails", async () => {
        const ctx = makeCtx(
            { "long-text@summary": envelope("whatever") },
            {
                compress: async () => {
                    throw new Error("not used");
                },
                decompress: async () => {
                    throw new Error("boom");
                }
            }
        );

        await fixLongText(ctx);

        expect(readValues(ctx)["long-text@summary"]).toBe("");
    });

    it("does not throw when the entry has no model", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                data: { modelId: "unknown", values: {} }
            },
            { modelProvider: { getModel: () => undefined } }
        );

        await expect(fixLongText(ctx)).resolves.toBeUndefined();
    });
});
