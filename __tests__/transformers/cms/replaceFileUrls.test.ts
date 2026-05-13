import { describe, it, expect } from "vitest";
import { replaceFileUrls } from "~/transformers/cms/replaceFileUrls.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";
import type { MigrationConfig } from "~/features/MigrationConfig/index.ts";

const SOURCE = "https://old.cdn.com";
const TARGET = "https://new.cdn.com";

function makeConfig(fileUrls?: { source: string; target: string }): MigrationConfig.Interface {
    return { fileUrls } as unknown as MigrationConfig.Interface;
}

function makeCompressionHandler() {
    return {
        compress: async (data: unknown) => ({
            compression: "gzip",
            value: JSON.stringify(data)
        }),
        decompress: async (compressed: unknown) =>
            JSON.parse((compressed as { value: string }).value)
    };
}

function makeModelProvider(
    fields: {
        id: string;
        fieldId: string;
        storageId: string;
        type: string;
        multipleValues?: boolean;
        settings?: unknown;
    }[]
) {
    return {
        getModel(_modelId: string) {
            return { modelId: "test", fields };
        }
    };
}

describe("replaceFileUrls", () => {
    it("is a noop when config.fileUrls is absent", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "page",
                    values: { "file@hero": `${SOURCE}/image.png` }
                }
            },
            {
                modelProvider: makeModelProvider([
                    { id: "hero", fieldId: "hero", storageId: "file@hero", type: "file" }
                ])
            }
        );

        await replaceFileUrls(makeConfig())(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<
            string,
            unknown
        >;
        expect(values["file@hero"]).toBe(`${SOURCE}/image.png`);
    });

    it("replaces URL in a single file field", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "page",
                    values: { "file@hero": `${SOURCE}/files/abc/photo.png` }
                }
            },
            {
                modelProvider: makeModelProvider([
                    { id: "hero", fieldId: "hero", storageId: "file@hero", type: "file" }
                ])
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<
            string,
            unknown
        >;
        expect(values["file@hero"]).toBe(`${TARGET}/files/abc/photo.png`);
    });

    it("replaces URLs in a multi-value file field (array of strings)", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "gallery",
                    values: {
                        "file@images": [`${SOURCE}/files/a/img1.png`, `${SOURCE}/files/b/img2.png`]
                    }
                }
            },
            {
                modelProvider: makeModelProvider([
                    {
                        id: "images",
                        fieldId: "images",
                        storageId: "file@images",
                        type: "file",
                        multipleValues: true
                    }
                ])
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<
            string,
            unknown
        >;
        expect(values["file@images"]).toEqual([
            `${TARGET}/files/a/img1.png`,
            `${TARGET}/files/b/img2.png`
        ]);
    });

    it("replaces URL inside compressed rich-text (state + html)", async () => {
        const compressionHandler = makeCompressionHandler();
        const rawRichText = {
            state: `{"root":{"children":[{"src":"${SOURCE}/files/abc/img.png","type":"wby-image"}]}}`,
            html: `<img src="${SOURCE}/files/abc/img.png">`
        };
        const compressed = await compressionHandler.compress(rawRichText);

        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "article",
                    values: { "rich-text@body": compressed }
                }
            },
            {
                modelProvider: makeModelProvider([
                    { id: "body", fieldId: "body", storageId: "rich-text@body", type: "rich-text" }
                ]),
                compressionHandler
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<
            string,
            unknown
        >;
        const decompressed = (await compressionHandler.decompress(values["rich-text@body"])) as {
            state: string;
            html: string;
        };
        expect(decompressed.state).toContain(`${TARGET}/files/abc/img.png`);
        expect(decompressed.html).toContain(`${TARGET}/files/abc/img.png`);
        expect(decompressed.state).not.toContain(SOURCE);
        expect(decompressed.html).not.toContain(SOURCE);
    });

    it("replaces URL in raw (uncompressed) rich-text { state, html }", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "article",
                    values: {
                        "rich-text@body": {
                            state: `{"src":"${SOURCE}/img.png"}`,
                            html: `<img src="${SOURCE}/img.png">`
                        }
                    }
                }
            },
            {
                modelProvider: makeModelProvider([
                    { id: "body", fieldId: "body", storageId: "rich-text@body", type: "rich-text" }
                ])
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<
            string,
            unknown
        >;
        const rt = values["rich-text@body"] as { state: string; html: string };
        expect(rt.state).toBe(`{"src":"${TARGET}/img.png"}`);
        expect(rt.html).toBe(`<img src="${TARGET}/img.png">`);
    });

    it("does not modify fields of other types", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "page",
                    values: { "text@title": `${SOURCE}/some/path` }
                }
            },
            {
                modelProvider: makeModelProvider([
                    { id: "title", fieldId: "title", storageId: "text@title", type: "text" }
                ])
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<
            string,
            unknown
        >;
        expect(values["text@title"]).toBe(`${SOURCE}/some/path`);
    });

    it("replaces URL in a file field nested inside an object field", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "hero",
                    values: {
                        "object@block": {
                            "file@image": `${SOURCE}/files/abc/img.png`
                        }
                    }
                }
            },
            {
                modelProvider: makeModelProvider([
                    {
                        id: "block",
                        fieldId: "block",
                        storageId: "object@block",
                        type: "object",
                        settings: {
                            fields: [
                                {
                                    id: "image",
                                    fieldId: "image",
                                    storageId: "file@image",
                                    type: "file"
                                }
                            ]
                        }
                    }
                ])
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<
            string,
            unknown
        >;
        const block = values["object@block"] as Record<string, unknown>;
        expect(block["file@image"]).toBe(`${TARGET}/files/abc/img.png`);
    });

    it("returns early when record has no data envelope", async () => {
        const ctx = makeFakeBaseContext(
            { PK: "T#root#CMS#CME#abc", SK: "L", TYPE: "cms.entry.l" },
            {
                modelProvider: {
                    getModel: () => {
                        throw new Error("should not be called");
                    }
                }
            }
        );

        await expect(
            replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx)
        ).resolves.toBeUndefined();
    });

    it("returns early when record.data has no modelId", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: { values: { "file@hero": `${SOURCE}/image.png` } }
            },
            {
                modelProvider: {
                    getModel: () => {
                        throw new Error("should not be called");
                    }
                }
            }
        );

        await expect(
            replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx)
        ).resolves.toBeUndefined();
    });

    it("returns early when modelProvider does not know the model", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: { modelId: "unknown", values: { "file@hero": `${SOURCE}/image.png` } }
            },
            { modelProvider: { getModel: (_modelId: string) => null } }
        );

        const values = (ctx.record.data as Record<string, unknown>).values as Record<
            string,
            unknown
        >;
        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);
        expect(values["file@hero"]).toBe(`${SOURCE}/image.png`);
    });

    it("returns early when entry has no values object", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: { modelId: "page" }
            },
            {
                modelProvider: makeModelProvider([
                    { id: "hero", fieldId: "hero", storageId: "file@hero", type: "file" }
                ])
            }
        );

        await expect(
            replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx)
        ).resolves.toBeUndefined();
    });
});
