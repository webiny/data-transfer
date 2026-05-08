import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Stats } from "node:fs";
import { TransferWizard } from "../../../../src/commands/run/wizard/TransferWizard.ts";
import type { RawOutputValues } from "../../../../src/commands/run/wizard/types.ts";

vi.mock("../../../../src/commands/run/wizard/projectDiscovery.ts");
vi.mock("../../../../src/commands/run/wizard/configDiscovery.ts");
vi.mock("../../../../src/commands/run/wizard/envWriter.ts");
vi.mock("../../../../src/commands/run/wizard/sources/WebinyOutputSource.ts");
vi.mock("../../../../src/commands/run/wizard/sources/PulumiStateSource.ts");
vi.mock("@inquirer/prompts");
vi.mock("node:fs/promises");

import { discoverProjects } from "../../../../src/commands/run/wizard/projectDiscovery.ts";
import { discoverConfigs } from "../../../../src/commands/run/wizard/configDiscovery.ts";
import { writeEnv } from "../../../../src/commands/run/wizard/envWriter.ts";
import { extractFromWebinyOutput } from "../../../../src/commands/run/wizard/sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "../../../../src/commands/run/wizard/sources/PulumiStateSource.ts";
import { input } from "@inquirer/prompts";
import { stat, access } from "node:fs/promises";

const mockDiscoverProjects = vi.mocked(discoverProjects);
const mockDiscoverConfigs = vi.mocked(discoverConfigs);
const mockWriteEnv = vi.mocked(writeEnv);
const mockExtractFromWebinyOutput = vi.mocked(extractFromWebinyOutput);
const mockExtractFromPulumiState = vi.mocked(extractFromPulumiState);
const mockInput = vi.mocked(input);
const mockStat = vi.mocked(stat);
const mockAccess = vi.mocked(access);

const noFile = (): never => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
};

const SOURCE_VALS: RawOutputValues = {
    region: "eu-central-1",
    primaryDynamodbTableName: "wby-source-primary",
    fileManagerBucketId: "wby-source-bucket",
    osTableName: "",
    osEndpoint: ""
};

const TARGET_VALS: RawOutputValues = {
    region: "us-east-1",
    primaryDynamodbTableName: "wby-target-primary",
    fileManagerBucketId: "wby-target-bucket",
    osTableName: "",
    osEndpoint: ""
};

beforeEach(() => {
    vi.resetAllMocks();
    mockWriteEnv.mockResolvedValue(undefined);
});

describe("TransferWizard", () => {
    it("exits with code 1 when no projects are found", async () => {
        mockDiscoverProjects.mockResolvedValue([]);
        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit");
        });

        await expect(new TransferWizard(process.cwd()).run()).rejects.toThrow("process.exit");
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("routes to config selection when no JSON files and .env exists", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            if (String(p).endsWith(".env")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockDiscoverConfigs.mockResolvedValue([
            { path: "/projects/my-project/ddb.config.ts", label: "DynamoDB Transfer" }
        ]);

        const result = await new TransferWizard(process.cwd()).run();

        expect(result).toBe("/projects/my-project/ddb.config.ts");
        expect(mockWriteEnv).not.toHaveBeenCalled();
    });

    it("throws when same-side files disagree on osTableName", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("source.pulumi.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockExtractFromWebinyOutput.mockResolvedValue({
            ...SOURCE_VALS,
            osTableName: "wby-es-webiny"
        });
        mockExtractFromPulumiState.mockResolvedValue({
            ...SOURCE_VALS,
            osTableName: "wby-es-pulumi"
        });

        await expect(new TransferWizard(process.cwd()).run()).rejects.toThrow(/osTableName/);
    });

    it("writes .env with correct values and returns null on happy path", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("target.webiny.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockAccess.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        mockExtractFromWebinyOutput
            .mockResolvedValueOnce(SOURCE_VALS)
            .mockResolvedValueOnce(TARGET_VALS);
        mockInput.mockResolvedValue("4");

        const result = await new TransferWizard(process.cwd()).run();

        expect(result).toBeNull();
        expect(mockWriteEnv).toHaveBeenCalledOnce();
        const [, envValues] = mockWriteEnv.mock.calls[0];
        expect(envValues.sourceRegion).toBe("eu-central-1");
        expect(envValues.targetRegion).toBe("us-east-1");
        expect(envValues.segments).toBe(4);
    });
});
