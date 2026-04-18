import { describe, it, expect } from "vitest";
import { createMetadata } from "~/transformers/file-manager/createMetadata.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";

interface PutRecordCall {
    record: Record<string, unknown>;
}

interface CopyFileCall {
    from: string;
    to: string;
}

interface Harness {
    ctx: DdbTransformContext.Interface;
    puts: PutRecordCall[];
    copies: CopyFileCall[];
}

function makeDdbHarness(record: Record<string, unknown>): Harness {
    const puts: PutRecordCall[] = [];
    const copies: CopyFileCall[] = [];
    const base = makeFakeBaseContext(record);
    const extended = base as unknown as DdbTransformContext.Interface & {
        putRecord(rec: Record<string, unknown>): void;
        copyFile(source: string, target: string): void;
    };
    extended.putRecord = (rec: Record<string, unknown>): void => {
        puts.push({ record: rec });
    };
    extended.copyFile = (source: string, target: string): void => {
        copies.push({ from: source, to: target });
    };
    return { ctx: extended, puts, copies };
}

describe("createMetadata", () => {
    it("emits a KeyValueStore metadata record and copyFile command for cms.entry.l file records", () => {
        const { ctx, puts, copies } = makeDdbHarness({
            PK: "T#root#CMS#CME#abc",
            SK: "L",
            TYPE: "cms.entry.l",
            data: {
                id: "abc123#0001",
                tenant: "root",
                values: {
                    "text@name": "avatar.png",
                    "text@key": "abc123/avatar.png",
                    "text@type": "image/png",
                    "number@size": 1234
                }
            }
        });

        createMetadata(ctx);

        expect(copies).toHaveLength(1);
        expect(copies[0]!.from).toBe("abc123/avatar.png");
        expect(copies[0]!.to).toBe("tenants/root/files/abc123/avatar.png");

        expect(puts).toHaveLength(1);
        const metadataRecord = puts[0]!.record as {
            PK: string;
            SK: string;
            TYPE: string;
            GSI_TENANT: string;
            data: {
                key: string;
                scope: string;
                value: {
                    bucketKey: string;
                    contentType: string;
                    id: string;
                    size: number;
                    tenant: string;
                };
            };
        };
        expect(metadataRecord.PK).toBe("KV#global:FileManager/File/abc123/Metadata");
        expect(metadataRecord.SK).toBe("A");
        expect(metadataRecord.TYPE).toBe("KeyValueStore");
        expect(metadataRecord.GSI_TENANT).toBe("global");
        expect(metadataRecord.data.key).toBe("FileManager/File/abc123/Metadata");
        expect(metadataRecord.data.value.bucketKey).toBe("tenants/root/files/abc123/avatar.png");
        expect(metadataRecord.data.value.id).toBe("abc123");
        expect(metadataRecord.data.value.contentType).toBe("image/png");
        expect(metadataRecord.data.value.size).toBe(1234);
    });

    it("skips records whose TYPE is not cms.entry.l", () => {
        const { ctx, puts, copies } = makeDdbHarness({
            PK: "T#root#CMS#CME#abc",
            SK: "REV#0001",
            TYPE: "cms.entry",
            data: { id: "abc123", values: { "text@name": "x", "text@key": "y" } }
        });

        createMetadata(ctx);

        expect(puts).toHaveLength(0);
        expect(copies).toHaveLength(0);
    });
});
