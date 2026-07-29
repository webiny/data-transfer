import { select } from "@inquirer/prompts";
import { discoverPresets } from "./discoverPresets.ts";
import type { InitOptions } from "../types.ts";

interface PromptArgs {
    projectName: string;
    preset?: string;
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

    return { projectName: args.projectName, preset };
}

function validatePreset(name: string, available: string[]): string {
    if (!available.includes(name)) {
        throw new Error(`Unknown preset "${name}". Available presets: ${available.join(", ")}`);
    }
    return name;
}

async function promptPreset(presets: string[]): Promise<string> {
    return select({
        message: "Select a preset:",
        choices: presets.map(name => ({ name, value: name }))
    });
}
