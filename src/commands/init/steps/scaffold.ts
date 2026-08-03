import { existsSync, cpSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InitOptions } from "../types.ts";
import { generateSecurityConfig } from "./securityConfig.ts";
import { generatePackageJson } from "./generatePackageJson.ts";

interface ScaffoldArgs {
    options: InitOptions;
    targetDir: string;
    templatesDir: string;
}

// npm strips .gitignore during pack/publish, so we ship it as
// .gitignore.example and rename after copying.
const DOT_RENAMES: Record<string, string> = {
    ".gitignore.example": ".gitignore"
};

export function scaffold(args: ScaffoldArgs): void {
    const { options, targetDir, templatesDir } = args;

    if (existsSync(targetDir)) {
        throw new Error(`Directory "${options.projectName}" already exists.`);
    }

    cpSync(templatesDir, targetDir, { recursive: true });

    try {
        for (const [from, to] of Object.entries(DOT_RENAMES)) {
            const source = join(targetDir, from);
            if (existsSync(source)) {
                renameSync(source, join(targetDir, to));
            }
        }

        writeFileSync(join(targetDir, "package.json"), generatePackageJson(options.projectName));

        const security = generateSecurityConfig();
        writeFileSync(join(targetDir, security.filename), security.content);
    } catch (error) {
        rmSync(targetDir, { recursive: true, force: true });
        throw error;
    }
}
