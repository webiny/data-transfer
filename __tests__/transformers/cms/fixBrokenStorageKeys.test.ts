import { describe, it, expect } from "vitest";
import { fixBrokenStorageKeys } from "~/transformers/cms/fixBrokenStorageKeys.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

describe("fixBrokenStorageKeys", () => {
    it("renames a value stored under a corrupt storageId to the correct storageId", async () => {
        const modelProvider = {
            getModel(_modelId: string) {
                return {
                    modelId: "myModel",
                    fields: [
                        {
                            id: "zone1",
                            fieldId: "zone1",
                            storageId: "text@zone1",
                            type: "dynamicZone"
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
                        "text@zone1": { some: "payload" }
                    }
                }
            },
            { modelProvider }
        );

        await fixBrokenStorageKeys(ctx);

        const data = ctx.record.data as Record<string, unknown>;
        const values = data.values as Record<string, unknown>;
        expect(values["dynamicZone@zone1"]).toEqual({ some: "payload" });
        expect(values["text@zone1"]).toBeUndefined();
    });

    it("returns early with no model lookup when data envelope has no modelId", async () => {
        const modelProvider = {
            getModel(_modelId: string) {
                throw new Error("should not be called");
            }
        };
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "REV#0001",
                TYPE: "cms.entry",
                data: { values: {} }
            },
            { modelProvider }
        );
        await expect(fixBrokenStorageKeys(ctx)).resolves.toBeUndefined();
    });
});
