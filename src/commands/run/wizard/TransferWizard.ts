import { join, relative, resolve } from "node:path";
import { access, stat } from "node:fs/promises";
import { select, input } from "@inquirer/prompts";
import { discoverProjects } from "./projectDiscovery.ts";
import { discoverConfigs } from "./configDiscovery.ts";
import { writeEnv } from "./envWriter.ts";
import { extractFromWebinyOutput } from "./sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "./sources/PulumiStateSource.ts";
import type { RawOutputValues, EnvValues } from "./types.ts";

async function fileNonEmpty(path: string): Promise<boolean> {
    try {
        const s = await stat(path);
        return s.size > 0;
    } catch {
        return false;
    }
}

async function resolveRawValues(
    projectDir: string,
    side: "source" | "target"
): Promise<RawOutputValues | null> {
    const webinyPath = join(projectDir, `${side}.webiny.json`);
    const pulumiPath = join(projectDir, `${side}.pulumi.json`);

    const hasWebiny = await fileNonEmpty(webinyPath);
    const hasPulumi = await fileNonEmpty(pulumiPath);

    if (!hasWebiny && !hasPulumi) {
        return null;
    }

    const webinyVals = hasWebiny ? await extractFromWebinyOutput(webinyPath) : null;
    const pulumiVals = hasPulumi ? await extractFromPulumiState(pulumiPath) : null;

    if (webinyVals && !pulumiVals) {
        return webinyVals;
    }
    if (pulumiVals && !webinyVals) {
        return pulumiVals;
    }

    // Both present — check for conflicts on all fields
    const conflicts: string[] = [];
    for (const key of [
        "region",
        "primaryDynamodbTableName",
        "fileManagerBucketId",
        "osTableName",
        "osEndpoint"
    ] as const) {
        if (webinyVals![key] && pulumiVals![key] && webinyVals![key] !== pulumiVals![key]) {
            conflicts.push(`${key}: webiny="${webinyVals![key]}" pulumi="${pulumiVals![key]}"`);
        }
    }
    if (conflicts.length > 0) {
        throw new Error(
            `${side}.webiny.json and ${side}.pulumi.json disagree:\n  ${conflicts.join("\n  ")}\n\nRemove one file or reconcile the values.`
        );
    }

    // Consistent — prefer webiny, but fill in OS fields from pulumi if webiny lacks them
    return {
        region: webinyVals!.region,
        primaryDynamodbTableName: webinyVals!.primaryDynamodbTableName,
        fileManagerBucketId: webinyVals!.fileManagerBucketId,
        osTableName: webinyVals!.osTableName || pulumiVals!.osTableName,
        osEndpoint: webinyVals!.osEndpoint || pulumiVals!.osEndpoint
    };
}

function printInstructions(projectDir: string): void {
    const rel = relative(process.cwd(), projectDir);
    console.log(`
To populate your .env, you need output from both your source and target Webiny systems.

Option A — Webiny CLI output (recommended):
  In your source system project:  yarn webiny output core --json > ${rel}/source.webiny.json
  In your target system project:  yarn webiny output core --json > ${rel}/target.webiny.json

Option B — Pulumi state file (use when you don't have Webiny CLI access):
  Copy the Pulumi state file from your source system to: ${rel}/source.pulumi.json
  Copy the Pulumi state file from your target system to: ${rel}/target.pulumi.json
  State files are at: .pulumi/apps/core/.pulumi/stacks/core/<env>.json

You can mix formats (e.g. source.webiny.json + target.pulumi.json).
`);
}

export class TransferWizard {
    private readonly cwd: string;

    public constructor(cwd: string) {
        this.cwd = cwd;
    }

    public async run(): Promise<string | null> {
        const projects = await discoverProjects(this.cwd);

        if (projects.length === 0) {
            console.error("\nNo projects found. Run: yarn transfer init-project <name>\n");
            process.exit(1);
        }

        const projectName =
            projects.length === 1
                ? projects[0]
                : await select({
                      message: "Which project do you want to transfer?",
                      choices: projects.map(p => ({ value: p, name: p }))
                  });

        const projectDir = resolve(join(this.cwd, "projects", projectName));

        const sourceValsInitial = await resolveRawValues(projectDir, "source");
        const targetValsInitial = await resolveRawValues(projectDir, "target");

        const envExists = await fileNonEmpty(join(projectDir, ".env"));

        if (sourceValsInitial === null && targetValsInitial === null && envExists) {
            return await this.runConfigSelection(projectName);
        }

        let sourceVals: RawOutputValues | null = sourceValsInitial;
        let targetVals: RawOutputValues | null = targetValsInitial;

        while (sourceVals === null || targetVals === null) {
            printInstructions(projectDir);
            await input({ message: "Press Enter when you have placed the files:", default: "" });
            sourceVals = await resolveRawValues(projectDir, "source");
            targetVals = await resolveRawValues(projectDir, "target");
        }

        const osPresent = !!(sourceVals.osTableName || targetVals.osTableName);

        const segmentsRaw = await input({
            message: "Number of parallel DDB scan segments (SEGMENTS):",
            default: "4",
            validate: v => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 1) {
                    return "Must be a positive integer.";
                }
                return true;
            }
        });

        let targetOsIndexPrefix = "";
        if (osPresent) {
            targetOsIndexPrefix = await input({
                message: "OpenSearch index prefix (TARGET_OS_INDEX_PREFIX, leave empty if none):",
                default: ""
            });
        }

        const envValues: EnvValues = {
            sourceRegion: sourceVals.region,
            sourceDdbTable: sourceVals.primaryDynamodbTableName,
            sourceS3Bucket: sourceVals.fileManagerBucketId,
            sourceOsTable: sourceVals.osTableName,
            targetRegion: targetVals.region,
            targetDdbTable: targetVals.primaryDynamodbTableName,
            targetS3Bucket: targetVals.fileManagerBucketId,
            targetOsTable: targetVals.osTableName,
            targetOsEndpoint: targetVals.osEndpoint,
            targetOsIndexPrefix,
            segments: Number(segmentsRaw)
        };

        try {
            await access(join(projectDir, ".env"));
            console.warn(
                "\n⚠  .env already exists and will be overwritten. Manual edits will be lost.\n"
            );
        } catch {
            // no existing .env — silent
        }

        await writeEnv(projectDir, envValues);

        console.log(
            `\n✓ .env written to projects/${projectName}/.env\n` +
                `  Review it and re-run: yarn transfer\n`
        );

        return null;
    }

    private async runConfigSelection(projectName: string): Promise<string> {
        const projectDir = resolve(join(this.cwd, "projects", projectName));
        const configs = await discoverConfigs(projectDir);

        if (configs.length === 0) {
            console.error(
                `\nNo transfer configs found in projects/${projectName}/.\n` +
                    `Add a ddb.transfer.config.ts or os.transfer.config.ts.\n`
            );
            process.exit(1);
        }

        if (configs.length === 1) {
            return configs[0].path;
        }

        return select({
            message: "Which transfer do you want to run?",
            choices: configs.map(c => ({ value: c.path, name: c.label }))
        });
    }
}
