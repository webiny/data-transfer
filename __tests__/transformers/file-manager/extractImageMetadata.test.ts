import { describe, it, expect } from "vitest";
import { extractImageMetadata } from "~/transformers/file-manager/extractImageMetadata.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";
import type { Cache } from "~/tools/Cache/abstractions/Cache.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";

interface GetFileCall {
    key: string;
}

interface ExtractHarness {
    ctx: DdbTransformContext.Interface;
    getFileCalls: GetFileCall[];
}

function makeStubCache(): Cache.Interface {
    const store = new Map<string, unknown>();
    return {
        get<T>(key: string): T | undefined {
            return store.get(key) as T | undefined;
        },
        set<T>(key: string, value: T): void {
            store.set(key, value);
        },
        has(key: string): boolean {
            return store.has(key);
        },
        delete(key: string): boolean {
            return store.delete(key);
        },
        clear(): void {
            store.clear();
        },
        size(): number {
            return store.size;
        }
    };
}

function makeExtractHarness(
    record: Record<string, unknown>,
    getFile: (key: string) => Promise<Buffer | null> = async () => null
): ExtractHarness {
    const getFileCalls: GetFileCall[] = [];
    const base = makeFakeBaseContext(record, { cache: makeStubCache() });
    const extended = base as unknown as DdbTransformContext.Interface & {
        getFile(key: string): Promise<Buffer | null>;
        copyFile(source: string, target: string): void;
    };
    extended.getFile = async (key: string): Promise<Buffer | null> => {
        getFileCalls.push({ key });
        return getFile(key);
    };
    extended.copyFile = (): void => {};
    return { ctx: extended, getFileCalls };
}

describe("extractImageMetadata", () => {
    it("renames object@meta to empty object@metadata for non-raster types and does not fetch S3", async () => {
        const { ctx, getFileCalls } = makeExtractHarness({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            data: {
                id: "abc123",
                values: {
                    "text@type": "application/pdf",
                    "object@meta": { old: "should-be-removed" }
                }
            }
        });

        await extractImageMetadata(ctx);

        const values = (ctx.record as { data: { values: Record<string, unknown> } }).data.values;
        expect(values["object@meta"]).toBeUndefined();
        expect(values["object@metadata"]).toEqual({});
        expect(getFileCalls).toHaveLength(0);
    });

    it("returns early when record.data is missing", async () => {
        const { ctx, getFileCalls } = makeExtractHarness({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l"
        });

        await expect(extractImageMetadata(ctx)).resolves.toBeUndefined();
        expect(getFileCalls).toHaveLength(0);
    });

    it("writes an empty object@metadata for SVG images without calling S3", async () => {
        const { ctx, getFileCalls } = makeExtractHarness({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            data: {
                id: "abc123",
                values: {
                    "text@type": "image/svg+xml",
                    "text@key": "abc123/icon.svg"
                }
            }
        });

        await extractImageMetadata(ctx);

        const values = (ctx.record as { data: { values: Record<string, unknown> } }).data.values;
        expect(values["object@metadata"]).toEqual({});
        expect(getFileCalls).toHaveLength(0);
    });
});
