import { describe, it, expect } from "vitest";
import { copyFileToTarget } from "~/transformers/file-manager/copyFileToTarget.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/contextAliases.ts";

function makeCtx(record: Record<string, unknown>): {
    ctx: DdbTransformContext.Interface;
    copyFileCalls: [string, string][];
} {
    const copyFileCalls: [string, string][] = [];
    const base = makeFakeBaseContext(record);
    const ctx = base as unknown as DdbTransformContext.Interface & {
        copyFile(src: string, dst: string): void;
    };
    ctx.copyFile = (src, dst) => {
        copyFileCalls.push([src, dst]);
    };
    return { ctx, copyFileCalls };
}

describe("copyFileToTarget", () => {
    it("emits a same-key S3 copy for a raw v5 record (values at root)", async () => {
        const { ctx, copyFileCalls } = makeCtx({
            PK: "T#root#FM#F#abc",
            SK: "A",
            TYPE: "fm.file",
            values: { "text@key": "uploads/abc.jpg" }
        });
        await copyFileToTarget(ctx);
        expect(copyFileCalls).toEqual([["uploads/abc.jpg", "uploads/abc.jpg"]]);
    });

    it("emits a same-key S3 copy for a post-wrapInData record (values under data)", async () => {
        const { ctx, copyFileCalls } = makeCtx({
            PK: "T#root#FM#F#abc",
            SK: "A",
            TYPE: "fm.file",
            data: { values: { "text@key": "uploads/abc.jpg" } }
        });
        await copyFileToTarget(ctx);
        expect(copyFileCalls).toEqual([["uploads/abc.jpg", "uploads/abc.jpg"]]);
    });

    it("does not emit any copy when text@key is absent", async () => {
        const { ctx, copyFileCalls } = makeCtx({
            PK: "T#root#FM#F#abc",
            SK: "A",
            TYPE: "fm.file",
            data: { values: { "text@type": "image/png" } }
        });
        await copyFileToTarget(ctx);
        expect(copyFileCalls).toHaveLength(0);
    });

    it("does not emit any copy when neither values nor data.values is present", async () => {
        const { ctx, copyFileCalls } = makeCtx({
            PK: "T#root#FM#F#abc",
            SK: "A",
            TYPE: "fm.file"
        });
        await copyFileToTarget(ctx);
        expect(copyFileCalls).toHaveLength(0);
    });
});
