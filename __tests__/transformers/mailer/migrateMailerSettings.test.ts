import { describe, it, expect } from "vitest";
import { migrateMailerSettings } from "~/transformers/mailer/migrateMailerSettings.ts";
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

describe("migrateMailerSettings", () => {
    it("replaces a mailer settings record with a KeyValueStore record", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#mailer",
            SK: "L",
            TYPE: "cms.entry.l",
            modelId: "mailerSettings",
            data: {
                tenant: "root",
                values: {
                    "text@host": "smtp.example.com",
                    "number@port": 587
                }
            }
        });

        migrateMailerSettings(ctx);

        const replaced = ctx.record as unknown as KvRecord;
        expect(replaced.PK).toBe("KV#root:Mailer/Settings/Transport");
        expect(replaced.SK).toBe("A");
        expect(replaced.TYPE).toBe("KeyValueStore");
        expect(replaced.GSI_TENANT).toBe("root");
        expect(replaced.data.key).toBe("Mailer/Settings/Transport");
        expect(replaced.data.scope).toBe("root");
        expect(replaced.data.value).toEqual({
            "text@host": "smtp.example.com",
            "number@port": 587
        });
    });

    it("skips records whose original SK is not L", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#mailer",
            SK: "REV#0001",
            TYPE: "cms.entry",
            modelId: "mailerSettings",
            data: { tenant: "root", values: {} }
        });

        migrateMailerSettings(ctx);

        expect((ctx.record as { TYPE: string }).TYPE).toBe("cms.entry");
    });

    it("skips records whose original modelId is not mailerSettings", () => {
        const ctx = makeFakeBaseContext({
            PK: "T#root#CMS#CME#other",
            SK: "L",
            TYPE: "cms.entry.l",
            modelId: "somethingElse",
            data: { tenant: "root", values: {} }
        });

        migrateMailerSettings(ctx);

        expect((ctx.record as { TYPE: string }).TYPE).toBe("cms.entry.l");
    });
});
