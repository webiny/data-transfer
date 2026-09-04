import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import type { UI } from "~/commands/prompts/abstractions/UI.js";
import { discoverProjects } from "./projectDiscovery.ts";
import { discoverConfig } from "./configDiscovery.ts";
import { listAvailablePresetsWithDescriptions } from "./presetDiscovery.ts";
import { writeEnv } from "./envWriter.ts";
import { extractFromWebinyOutput } from "./sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "./sources/PulumiStateSource.ts";
import { scaffoldProject } from "~/commands/initProject/scaffoldProject.js";
import { slugify } from "~/utils/slugify.js";
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

function buildInstructionsText(projectDir: string): string {
    const rel = relative(process.cwd(), projectDir);
    return [
        "To populate your .env, you need output from both your source and target Webiny systems.",
        "",
        "Option A — Webiny CLI output (recommended):",
        `  In your source system project:  yarn webiny output core --json > ${rel}/source.webiny.json`,
        `  In your target system project:  yarn webiny output core --json > ${rel}/target.webiny.json`,
        "",
        "Option B — Pulumi state file (use when you don't have Webiny CLI access):",
        `  Copy the Pulumi state file from your source system to: ${rel}/source.pulumi.json`,
        `  Copy the Pulumi state file from your target system to: ${rel}/target.pulumi.json`,
        "  State files are at: .pulumi/apps/core/.pulumi/stacks/core/<env>.json",
        "",
        "You can mix formats (e.g. source.webiny.json + target.pulumi.json).",
        "",
        `Optionally, drop CMS model exports into ${rel}/models/`,
        "  (export from Webiny Admin → CMS → Models → Export)"
    ].join("\n");
}

const CREATE_NEW = "__create__";

export class TransferWizard {
    public constructor(
        private readonly cwd: string,
        private readonly prompts: Prompts.Interface,
        private readonly ui: UI.Interface
    ) {}

    public async run(): Promise<WizardResult | null> {
        const projects = await discoverProjects(this.cwd);

        const selected = await this.prompts.select<string>({
            message: "Which project do you want to transfer?",
            options: [
                ...projects.map(p => ({ value: p, label: p })),
                { value: CREATE_NEW, label: "+ Create new project" }
            ]
        });
        if (selected === null) {
            return null;
        }

        let projectName: string;
        let justCreated: boolean;
        if (selected === CREATE_NEW) {
            const rawName = await this.prompts.text({
                message: "Project name:",
                validate: (v: string) => {
                    const slug = slugify(v);
                    if (!slug) {
                        return "Name cannot be empty.";
                    }
                    if (existsSync(join(this.cwd, "projects", slug))) {
                        return `Project "projects/${slug}" already exists.`;
                    }
                    return undefined;
                }
            });
            if (rawName === null) {
                return null;
            }
            const newName = slugify(rawName);
            try {
                await scaffoldProject({ name: newName, cwd: this.cwd });
            } catch (err) {
                throw new Error(
                    `Failed to create project "${newName}": ${err instanceof Error ? err.message : String(err)}`
                );
            }
            this.ui.note(`Created projects/${newName}/`);
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
            const choice = await this.prompts.select<string>({
                message: ".env already exists. What would you like to do?",
                options: [
                    { value: "existing", label: "Use existing .env" },
                    { value: "repopulate", label: "Repopulate .env from JSON files" }
                ]
            });
            if (choice === null) {
                return null;
            }
            if (choice === "existing") {
                return await this.runPresetSelection(projectName);
            }
        }

        let sourceVals: RawOutputValues | null = sourceValsInitial;
        let targetVals: RawOutputValues | null = targetValsInitial;

        while (sourceVals === null || targetVals === null) {
            this.ui.note(buildInstructionsText(projectDir), "Setup instructions");
            const enter = await this.prompts.text({
                message: "Press Enter when you have placed the files:",
                defaultValue: ""
            });
            if (enter === null) {
                return null;
            }
            sourceVals = await resolveRawValues(projectDir, "source");
            targetVals = await resolveRawValues(projectDir, "target");
        }

        if (
            sourceVals.accountId &&
            targetVals.accountId &&
            sourceVals.accountId !== targetVals.accountId
        ) {
            this.ui.warn(
                `Source and target are in different AWS accounts:\n` +
                    `  source: ${sourceVals.accountId}\n` +
                    `  target: ${targetVals.accountId}\n` +
                    `  Set SOURCE_PROFILE and TARGET_PROFILE in .env to use the correct credentials.`
            );
        }

        const osPresent = !!(sourceVals.osTableName || targetVals.osTableName);

        const segmentsRaw = await this.prompts.text({
            message: "Number of parallel DDB scan segments (SEGMENTS):",
            defaultValue: "4",
            validate: v => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 1) {
                    return "Must be a positive integer.";
                }
                return undefined;
            }
        });
        if (segmentsRaw === null) {
            return null;
        }

        let targetOsIndexPrefix = "";
        if (osPresent) {
            const prefix = await this.prompts.text({
                message: "OpenSearch index prefix (TARGET_OS_INDEX_PREFIX, leave empty if none):",
                defaultValue: ""
            });
            if (prefix === null) {
                return null;
            }
            targetOsIndexPrefix = prefix;
        }

        const envValues: EnvValues = {
            sourceRegion: sourceVals.region,
            sourceDdbTable: sourceVals.primaryDynamodbTableName,
            sourceS3Bucket: sourceVals.fileManagerBucketId,
            sourceAuditLogTable: sourceVals.auditLogTableName ?? "",
            sourceOsTable: sourceVals.osTableName,
            sourceAccountId: sourceVals.accountId ?? "",
            targetRegion: targetVals.region,
            targetDdbTable: targetVals.primaryDynamodbTableName,
            targetS3Bucket: targetVals.fileManagerBucketId,
            targetAuditLogTable: targetVals.auditLogTableName ?? "",
            targetOsTable: targetVals.osTableName,
            targetOsEndpoint: targetVals.osEndpoint,
            targetOsIndexPrefix,
            targetAccountId: targetVals.accountId ?? "",
            segments: Number(segmentsRaw)
        };

        await writeEnv(projectDir, envValues);

        this.ui.note(
            `.env written to projects/${projectName}/.env\nReview it and re-run: yarn transfer`
        );

        return null;
    }

    private async runPresetSelection(projectName: string): Promise<WizardResult | null> {
        const projectDir = resolve(join(this.cwd, "projects", projectName));
        const configPath = await discoverConfig(projectDir);

        if (!configPath) {
            throw new Error(
                `No config.ts found in projects/${projectName}/. Run "yarn transfer" to set up the project first.`
            );
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
            throw new Error("No presets available. Check your presetsDir configuration.");
        }

        const preset = await this.prompts.select<string>({
            message: "Which preset do you want to run?",
            options: presets.map(p => ({
                value: p.name,
                label: p.description ? `${p.name} — ${p.description}` : p.name
            }))
        });
        if (preset === null) {
            return null;
        }

        const dryRun = await this.prompts.confirm({
            message: "Dry run? (reads source, skips all writes to target)",
            initialValue: false
        });
        if (dryRun === null) {
            return null;
        }

        return { configPath, preset, dryRun };
    }
}
