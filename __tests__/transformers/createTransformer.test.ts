import { describe, it, expect } from "vitest";
import { createTransformer } from "~/transformers/createTransformer.ts";
import { createDdbTransformer } from "~/transformers/createDdbTransformer.ts";
import { createOsTransformer } from "~/transformers/createOsTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { DdbTransformContext } from "~/features/TransformContext/abstractions/DdbTransformContext.ts";
import type { OsTransformContext } from "~/features/TransformContext/abstractions/OsTransformContext.ts";
import type { OsScanner } from "~/features/OsScanner/index.ts";

describe("createTransformer", () => {
    it("returns a function compatible with Transformer.Interface", () => {
        const t = createTransformer<BaseTransformContext.Interface>("example", () => {});
        expect(typeof t).toBe("function");
    });

    it("attaches the name as a non-enumerable property", () => {
        const t = createTransformer<BaseTransformContext.Interface>("named", () => {});
        expect((t as unknown as { transformerName: string }).transformerName).toBe("named");
        const keys = Object.keys(t);
        expect(keys).not.toContain("transformerName");
    });

    it("invokes the function with the provided context", async () => {
        let captured: unknown = null;
        const t = createTransformer<BaseTransformContext.Interface>("cap", ctx => {
            captured = ctx;
        });
        const fakeCtx = { sentinel: true } as unknown as BaseTransformContext.Interface;
        await t(fakeCtx);
        expect(captured).toBe(fakeCtx);
    });
});

describe("createDdbTransformer", () => {
    it("returns a function typed against DdbTransformContext", () => {
        const t = createDdbTransformer("ddb", _ctx => {});
        const assignable: (ctx: DdbTransformContext.Interface) => void | Promise<void> = t;
        expect(typeof assignable).toBe("function");
    });

    it("attaches the name", () => {
        const t = createDdbTransformer("ddb-named", () => {});
        expect((t as unknown as { transformerName: string }).transformerName).toBe("ddb-named");
    });
});

describe("createOsTransformer", () => {
    it("returns a function typed against OsTransformContext", () => {
        const t = createOsTransformer("os", _ctx => {});
        const assignable: (
            ctx: OsTransformContext.Interface<OsScanner.Record>
        ) => void | Promise<void> = t;
        expect(typeof assignable).toBe("function");
    });

    it("attaches the name", () => {
        const t = createOsTransformer("os-named", () => {});
        expect((t as unknown as { transformerName: string }).transformerName).toBe("os-named");
    });
});
