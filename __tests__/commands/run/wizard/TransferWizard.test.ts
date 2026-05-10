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
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
vi.mock("~/commands/initProject/scaffoldProject.ts", () => ({
    scaffoldProject: vi.fn().mockResolvedValue(undefined)
}));

import { discoverProjects } from "../../../../src/commands/run/wizard/projectDiscovery.ts";
import { discoverConfigs } from "../../../../src/commands/run/wizard/configDiscovery.ts";
import { writeEnv } from "../../../../src/commands/run/wizard/envWriter.ts";
import { extractFromWebinyOutput } from "../../../../src/commands/run/wizard/sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "../../../../src/commands/run/wizard/sources/PulumiStateSource.ts";
import { input, select } from "@inquirer/prompts";
import { stat, access } from "node:fs/promises";
import { scaffoldProject } from "../../../../src/commands/initProject/scaffoldProject.ts";

const mockDiscoverProjects = vi.mocked(discoverProjects);
const mockDiscoverConfigs = vi.mocked(discoverConfigs);
const mockWriteEnv = vi.mocked(writeEnv);
const mockExtractFromWebinyOutput = vi.mocked(extractFromWebinyOutput);
const mockExtractFromPulumiState = vi.mocked(extractFromPulumiState);
const mockInput = vi.mocked(input);
const mockSelect = vi.mocked(select);
const mockStat = vi.mocked(stat);
const mockAccess = vi.mocked(access);
const mockScaffoldProject = vi.mocked(scaffoldProject);

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
    mockScaffoldProject.mockResolvedValue(undefined);
});

describe("TransferWizard", () => {
    it("shows CREATE_NEW option even when no projects are found, and scaffolds on selection", async () => {
        mockDiscoverProjects.mockResolvedValue([]);
        mockSelect.mockResolvedValue("__create__");
        mockStat.mockRejectedValue(new Error("ENOENT"));
        // First input call is for the new project name; second breaks out of the instructions loop.
        mockInput.mockResolvedValueOnce("brand-new").mockRejectedValue(new Error("stop"));

        await expect(new TransferWizard(process.cwd()).run()).rejects.toThrow("stop");

        expect(mockSelect).toHaveBeenCalledOnce();
        const choices = mockSelect.mock.calls[0][0].choices as Array<{ value: string }>;
        expect(choices.some((c: { value: string }) => c.value === "__create__")).toBe(true);
        expect(mockScaffoldProject).toHaveBeenCalledWith({ name: "brand-new", cwd: process.cwd() });
    });

    it("create-new happy path: scaffolds project, writes env, returns null", async () => {
        mockDiscoverProjects.mockResolvedValue([]);
        mockSelect.mockResolvedValue("__create__");
        mockScaffoldProject.mockResolvedValue(undefined);
        // First input call: project name. Second: segment count.
        mockInput.mockResolvedValueOnce("my-project").mockResolvedValueOnce("4");
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

        const result = await new TransferWizard(process.cwd()).run();

        expect(mockScaffoldProject).toHaveBeenCalledWith({
            name: "my-project",
            cwd: expect.any(String)
        });
        expect(mockWriteEnv).toHaveBeenCalledOnce();
        expect(result).toBeNull();
    });

    it("routes to config selection when no JSON files and .env exists", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
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
        mockSelect.mockResolvedValue("my-project");
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
        mockSelect.mockResolvedValue("my-project");
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
