import { describe, it, expect } from "vitest";
import { guardV6 } from "~/commands/fixLive/steps/guardV6.js";
import { MockDynamoDbClient } from "../../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { StubUI } from "../../prompts/StubUI.ts";

const base = {
    _et: "CmsEntries",
    _ct: "2026-01-01T00:00:00.000Z",
    _md: "2026-01-01T00:00:00.000Z"
};

const v6Entry = {
    ...base,
    PK: "T#root#L#en-US#CMS#CME#abc",
    SK: "L",
    TYPE: "cms.entry.l",
    data: { modelId: "article", version: 1, status: "draft" }
};
const v5Entry = {
    ...base,
    PK: "T#root#L#en-US#CMS#CME#abc",
    SK: "L",
    TYPE: "cms.entry.l",
    modelId: "article",
    version: 1,
    status: "draft"
};
const fmFile = {
    ...base,
    PK: "T#root#L#en-US#CMS#CME#file1",
    SK: "L",
    TYPE: "cms.entry.l",
    data: { modelId: "fmFile", version: 1 }
};
const settings = { ...base, PK: "T#root#SETTINGS", SK: "A", TYPE: "settings" };

const run = (rows: object[]) =>
    guardV6({
        client: new MockDynamoDbClient({ t: rows as never }),
        tableName: "t",
        region: "eu-central-1",
        ui: new StubUI()
    });

describe("guardV6", () => {
    it("passes on a v6 CMS entry (data object at the root)", async () => {
        expect(await run([settings, fmFile, v6Entry])).toEqual({
            kind: "ok",
            value: "v6"
        });
    });

    it("refuses a v5 table with the table name and region", async () => {
        const result = await run([settings, v5Entry]);
        expect(result.kind).toBe("refused");
        expect((result as { message: string }).message).toBe(
            'Table "t" in eu-central-1 holds v5 records. fix-live only runs against migrated v6 systems.'
        );
    });

    it("refuses when no CMS entry is found (internal models do not count)", async () => {
        const result = await run([settings, fmFile]);
        expect(result.kind).toBe("refused");
        expect((result as { message: string }).message).toBe(
            "Could not find a CMS entry record to verify the schema version."
        );
    });

    it("reports the spinner lifecycle", async () => {
        const ui = new StubUI();
        await guardV6({
            client: new MockDynamoDbClient({ t: [v6Entry] as never }),
            tableName: "t",
            region: "r",
            ui
        });
        expect(ui.spinnerMessages[0]).toBe("Checking schema version…");
        expect(ui.spinnerMessages.at(-1)).toBe("Schema version: v6");
    });
});
