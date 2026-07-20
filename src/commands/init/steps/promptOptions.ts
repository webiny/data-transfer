import { select } from "@inquirer/prompts";
import { discoverPresets } from "./discoverPresets.ts";
import { detectPackageManager } from "./detectPackageManager.ts";
import type { InitOptions, PackageManager } from "../types.ts";

const VALID_PMS: PackageManager[] = ["yarn", "npm", "pnpm"];

interface PromptArgs {
    projectName: string;
    preset?: string;
    pm?: string;
    projectsDir: string;
}

export async function promptOptions(args: PromptArgs): Promise<InitOptions> {
    const presets = discoverPresets(args.projectsDir);

    if (presets.length === 0) {
        throw new Error(
            "No presets found. The @webiny/data-transfer package may be corrupted — reinstall it."
        );
    }

    const preset = args.preset ? validatePreset(args.preset, presets) : await promptPreset(presets);
    const packageManager = args.pm ? validatePackageManager(args.pm) : await promptPackageManager();

    return { projectName: args.projectName, preset, packageManager };
}

function validatePreset(name: string, available: string[]): string {
    if (!available.includes(name)) {
        throw new Error(`Unknown preset "${name}". Available presets: ${available.join(", ")}`);
    }
    return name;
}

function validatePackageManager(pm: string): PackageManager {
    if (!VALID_PMS.includes(pm as PackageManager)) {
        throw new Error(`Unknown package manager "${pm}". Valid options: ${VALID_PMS.join(", ")}`);
    }
    return pm as PackageManager;
}

async function promptPreset(presets: string[]): Promise<string> {
    return select({
        message: "Select a preset:",
        choices: presets.map(name => ({ name, value: name }))
    });
}

async function promptPackageManager(): Promise<PackageManager> {
    const detected = detectPackageManager();
    return select({
        message: "Package manager:",
        default: detected,
        choices: VALID_PMS.map(pm => ({ name: pm, value: pm }))
    });
}
