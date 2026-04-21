import { describe, it, expect } from "vitest";
import { migrateFileManagerSettings } from "~/transformers/file-manager/migrateFileManagerSettings.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";

interface KvRecord {
    PK: string;
    SK: string;
    TYPE: string;
    GSI_TENANT: string;
    data: {
        key: string;
        scope: string;
        value: Record<string, unknown>;
    };
}

describe("migrateFileManagerSettings", () => {
    it("replaces an fm.settings record with a KeyValueStore record scoped to the tenant", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#FM",
            SK: "settings",
            TYPE: "fm.settings",
            data: {
                tenant: "root",
                srcPrefix: "https://example.com/",
                uploadMinFileSize: 0,
                uploadMaxFileSize: 26214400
            }
        });

        migrateFileManagerSettings(ctx);

        const replaced = ctx.record as unknown as KvRecord;
        expect(replaced.PK).toBe("KV#root:FileManager/General");
        expect(replaced.SK).toBe("A");
        expect(replaced.TYPE).toBe("KeyValueStore");
        expect(replaced.GSI_TENANT).toBe("root");
        expect(replaced.data.key).toBe("FileManager/General");
        expect(replaced.data.scope).toBe("root");
        expect(replaced.data.value).toEqual({
            srcPrefix: "https://example.com/",
            uploadMinFileSize: 0,
            uploadMaxFileSize: 26214400
        });
    });

    it("skips records whose original TYPE is not fm.settings", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS",
            SK: "entry",
            TYPE: "cms.entry",
            data: { tenant: "root" }
        });

        migrateFileManagerSettings(ctx);

        expect((ctx.record as { TYPE: string }).TYPE).toBe("cms.entry");
    });
});
