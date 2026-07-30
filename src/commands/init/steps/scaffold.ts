import { existsSync, cpSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InitOptions } from "../types.ts";
import { generateSecurityConfig } from "./securityConfig.ts";
import { generatePackageJson } from "./generatePackageJson.ts";

interface ScaffoldArgs {
    options: InitOptions;
    targetDir: string;
    templatesDir: string;
}

export function scaffold(args: ScaffoldArgs): void {
    const { options, targetDir, templatesDir } = args;

    if (existsSync(targetDir)) {
        throw new Error(`Directory "${options.projectName}" already exists.`);
    }

    cpSync(templatesDir, targetDir, { recursive: true });

    try {
        writeFileSync(join(targetDir, "package.json"), generatePackageJson(options.projectName));

        const security = generateSecurityConfig();
        writeFileSync(join(targetDir, security.filename), security.content);
    } catch (error) {
        rmSync(targetDir, { recursive: true, force: true });
        throw error;
    }
}
