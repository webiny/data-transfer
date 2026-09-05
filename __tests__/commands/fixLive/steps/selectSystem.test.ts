import { describe, it, expect } from "vitest";
import type { MigrationConfig } from "~/features/MigrationConfig/index.js";
import { selectSystem, formatSystemHint } from "~/commands/fixLive/steps/selectSystem.js";
import { StubPrompts } from "../../prompts/StubPrompts.ts";

const CREDS = { accessKeyId: "a", secretAccessKey: "b" };

export const CONFIG: MigrationConfig.Interface = {
    source: {
        region: "eu-central-1",
        credentials: CREDS,
        dynamodb: { tableName: "acme-src-ddb" },
        s3: { bucket: "acme-src-s3" }
    },
    target: {
        region: "us-east-1",
        credentials: CREDS,
        accountId: "123456789012",
        dynamodb: { tableName: "acme-prod-ddb" },
        s3: { bucket: "acme-prod-s3" },
        opensearch: {
            endpoint: "https://os.example.com",
            tableName: "acme-prod-os",
            service: "opensearch" as const,
            indexPrefix: ""
        }
    },
    pipeline: { segments: 4 }
};

describe("selectSystem", () => {
    it("formats the hint with ddb table, region and os table or none", () => {
        expect(formatSystemHint(CONFIG.source)).toBe(
            "ddb: acme-src-ddb · region: eu-central-1 · os table: none"
        );
        expect(formatSystemHint(CONFIG.target)).toBe(
            "ddb: acme-prod-ddb · region: us-east-1 · os table: acme-prod-os"
        );
    });

    it("uses --system without prompting", async () => {
        const prompts = new StubPrompts();
        expect(await selectSystem({ prompts, config: CONFIG, systemArg: "target" })).toEqual({
            kind: "ok",
            value: "target"
        });
        expect(prompts.selectCalls).toHaveLength(0);
    });

    it("prompts with hints and returns the choice; cancel → cancelled", async () => {
        const prompts = new StubPrompts({ select: ["source"] });
        expect(await selectSystem({ prompts, config: CONFIG })).toEqual({
            kind: "ok",
            value: "source"
        });
        expect(prompts.selectCalls[0]!.options.map(o => o.hint)).toEqual([
            formatSystemHint(CONFIG.source),
            formatSystemHint(CONFIG.target)
        ]);
        expect(await selectSystem({ prompts: new StubPrompts(), config: CONFIG })).toEqual({
            kind: "cancelled"
        });
    });
});
