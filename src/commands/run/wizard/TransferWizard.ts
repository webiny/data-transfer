import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { select, input, confirm } from "@inquirer/prompts";
import { discoverProjects } from "./projectDiscovery.ts";
import { discoverConfig } from "./configDiscovery.ts";
import { listAvailablePresetsWithDescriptions } from "./presetDiscovery.ts";
import { writeEnv } from "./envWriter.ts";
import { extractFromWebinyOutput } from "./sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "./sources/PulumiStateSource.ts";
import { scaffoldProject } from "~/commands/initProject/scaffoldProject.ts";
import type { RawOutputValues, EnvValues, WizardResult } from "./types.ts";

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
        "auditLogTableName",
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

    // Consistent — prefer webiny, but fill in fields from pulumi if webiny lacks them
    return {
        region: webinyVals!.region,
        primaryDynamodbTableName: webinyVals!.primaryDynamodbTableName,
        fileManagerBucketId: webinyVals!.fileManagerBucketId,
        auditLogTableName: webinyVals!.auditLogTableName ?? pulumiVals!.auditLogTableName,
        osTableName: webinyVals!.osTableName || pulumiVals!.osTableName,
        osEndpoint: webinyVals!.osEndpoint || pulumiVals!.osEndpoint,
        accountId: webinyVals!.accountId ?? pulumiVals!.accountId
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

const CREATE_NEW = "__create__";

export class TransferWizard {
    private readonly cwd: string;

    public constructor(cwd: string) {
        this.cwd = cwd;
    }

    public async run(): Promise<WizardResult | null> {
        const projects = await discoverProjects(this.cwd);

        const selected = await select({
            message: "Which project do you want to transfer?",
            choices: [
                ...projects.map(p => ({ value: p, name: p })),
                { value: CREATE_NEW, name: "+ Create new project" }
            ]
        });

        let projectName: string;
        let justCreated: boolean;
        if (selected === CREATE_NEW) {
            const rawName = await input({
                message: "Project name:",
                validate: (v: string) => {
                    const trimmed = v.trim();
                    if (!trimmed) {
                        return "Name cannot be empty.";
                    }
                    if (/[/\\]/.test(trimmed)) {
                        return "Name cannot contain path separators.";
                    }
                    if (existsSync(join(this.cwd, "projects", trimmed))) {
                        return `Project "projects/${trimmed}" already exists.`;
                    }
                    return true;
                }
            });
            const newName = rawName.trim();
            try {
                await scaffoldProject({ name: newName, cwd: this.cwd });
            } catch (err) {
                throw new Error(
                    `Failed to create project "${newName}": ${err instanceof Error ? err.message : String(err)}`
                );
            }
            console.log(`\n✓ Created projects/${newName}/\n`);
            projectName = newName;
            justCreated = true;
        } else {
            projectName = selected;
            justCreated = false;
        }

        const projectDir = resolve(join(this.cwd, "projects", projectName));

        const sourceValsInitial = await resolveRawValues(projectDir, "source");
        const targetValsInitial = await resolveRawValues(projectDir, "target");

        const envExists = await fileNonEmpty(join(projectDir, ".env"));

        if (!justCreated && sourceValsInitial === null && targetValsInitial === null && envExists) {
            return await this.runPresetSelection(projectName);
        }

        if (!justCreated && envExists && sourceValsInitial !== null && targetValsInitial !== null) {
            const choice = await select({
                message: ".env already exists. What would you like to do?",
                choices: [
                    { value: "existing", name: "Use existing .env" },
                    { value: "repopulate", name: "Repopulate .env from JSON files" }
                ]
            });
            if (choice === "existing") {
                return await this.runPresetSelection(projectName);
            }
        }

        let sourceVals: RawOutputValues | null = sourceValsInitial;
        let targetVals: RawOutputValues | null = targetValsInitial;

        while (sourceVals === null || targetVals === null) {
            printInstructions(projectDir);
            await input({ message: "Press Enter when you have placed the files:", default: "" });
            sourceVals = await resolveRawValues(projectDir, "source");
            targetVals = await resolveRawValues(projectDir, "target");
        }

        if (
            sourceVals.accountId &&
            targetVals.accountId &&
            sourceVals.accountId !== targetVals.accountId
        ) {
            const bold = "\x1b[1m";
            const yellow = "\x1b[33m";
            const dim = "\x1b[2m";
            const reset = "\x1b[0m";
            console.warn(
                `\n${bold}${yellow}⚠  Source and target are in different AWS accounts:${reset}` +
                    `\n   ${dim}source:${reset} ${bold}${sourceVals.accountId}${reset}` +
                    `\n   ${dim}target:${reset} ${bold}${targetVals.accountId}${reset}` +
                    `\n   ${dim}Set SOURCE_PROFILE and TARGET_PROFILE in .env to use the correct credentials.${reset}\n`
            );
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
            sourceAuditLogTable: sourceVals.auditLogTableName ?? "",
            sourceOsTable: sourceVals.osTableName,
            targetRegion: targetVals.region,
            targetDdbTable: targetVals.primaryDynamodbTableName,
            targetS3Bucket: targetVals.fileManagerBucketId,
            targetAuditLogTable: targetVals.auditLogTableName ?? "",
            targetOsTable: targetVals.osTableName,
            targetOsEndpoint: targetVals.osEndpoint,
            targetOsIndexPrefix,
            segments: Number(segmentsRaw)
        };

        await writeEnv(projectDir, envValues);

        console.log(
            `\n✓ .env written to projects/${projectName}/.env\n` +
                `  Review it and re-run: yarn transfer\n`
        );

        return null;
    }

    private async runPresetSelection(projectName: string): Promise<WizardResult> {
        const projectDir = resolve(join(this.cwd, "projects", projectName));
        const configPath = await discoverConfig(projectDir);

        if (!configPath) {
            console.error(
                `\nNo config.ts found in projects/${projectName}/.\n` +
                    `Run "yarn transfer" to set up the project first.\n`
            );
            process.exit(1);
        }

        let presetsDir: string | undefined;
        try {
            const mod = await import(pathToFileURL(configPath).href);
            presetsDir = mod.default?.pipeline?.presetsDir;
        } catch {
            // ignore — presets from built-ins only
        }

        const presets = await listAvailablePresetsWithDescriptions(presetsDir);

        if (presets.length === 0) {
            console.error("\nNo presets available. Check your presetsDir configuration.\n");
            process.exit(1);
        }

        const preset = await select({
            message: "Which preset do you want to run?",
            choices: presets.map(p => ({
                value: p.name,
                name: p.description ? `${p.name} — ${p.description}` : p.name
            }))
        });

        const dryRun = await confirm({
            message: "Dry run? (reads source, skips all writes to target)",
            default: false
        });

        return { configPath, preset, dryRun };
    }
}
