import { resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promptOptions } from "./steps/promptOptions.ts";
import { scaffold } from "./steps/scaffold.ts";
import { installDeps } from "./steps/installDeps.ts";
import { printNextSteps } from "./steps/printNextSteps.ts";

interface HandlerArgs {
    projectName: string;
    preset?: string;
    pm?: string;
}

export async function handler(args: HandlerArgs): Promise<void> {
    validateProjectName(args.projectName);

    const packageRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
    const templatesDir = resolve(packageRoot, "templates");
    const projectsDir = resolve(packageRoot, "projects");
    const targetDir = resolve(process.cwd(), args.projectName);

    if (!existsSync(templatesDir)) {
        throw new Error(
            `Templates directory not found at ${templatesDir}. The @webiny/data-transfer package may be corrupted — reinstall it.`
        );
    }

    try {
        const options = await promptOptions({
            projectName: args.projectName,
            preset: args.preset,
            pm: args.pm,
            projectsDir
        });

        scaffold({ options, targetDir, templatesDir, projectsDir });

        console.log("\nInstalling dependencies...\n");
        await installDeps(targetDir, options.packageManager);

        printNextSteps(options);
    } catch (error) {
        console.error(`\nError: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
    }
}

function validateProjectName(name: string): void {
    if (/[/\\]/.test(name) || name.includes("..") || name !== basename(name)) {
        throw new Error(
            `Invalid project name "${name}". Must be a simple directory name without path separators or "..".`
        );
    }
}
