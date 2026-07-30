import { resolve, dirname, basename } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findPackageRoot } from "~/utils/findPackageRoot.js";
import { scaffold } from "./steps/scaffold.ts";
import { installDeps } from "./steps/installDeps.ts";
import { printNextSteps } from "./steps/printNextSteps.ts";

interface HandlerArgs {
    projectName: string;
}

export async function handler(args: HandlerArgs): Promise<void> {
    validateProjectName(args.projectName);

    const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
    const templatesDir = resolve(packageRoot, "templates");
    const targetDir = resolve(process.cwd(), args.projectName);

    if (!existsSync(templatesDir)) {
        throw new Error(
            `Templates directory not found at ${templatesDir}. The @webiny/data-transfer package may be corrupted — reinstall it.`
        );
    }

    try {
        scaffold({ options: { projectName: args.projectName }, targetDir, templatesDir });

        console.log("\nInstalling dependencies...\n");
        await installDeps(targetDir);

        printNextSteps({ projectName: args.projectName });
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
