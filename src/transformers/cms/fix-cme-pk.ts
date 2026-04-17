import type { Transformer } from "~/domain/transform/Transformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

/**
 * Removes duplicate #CME# from PK
 * Before: T#root#L#en-US#CMS#CME#CME#698262002baa500002afd371
 * After: T#root#CMS#CME#697fba1ee12d630002b7ad15
 */
export const fixCmePk: Transformer = {
    name: "fixCmePk",
    transform(ctx: BaseTransformContext.Interface) {
        const { record } = ctx;

        if (typeof record.PK === "string" && record.PK.includes("#CME#CME#")) {
            record.PK = record.PK.replace("#CME#CME#", "#CME#");
        }
    }
};
