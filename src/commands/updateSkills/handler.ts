import { resolve, dirname } from "node:path";
import { existsSync, readdirSync, cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findPackageRoot } from "~/utils/findPackageRoot.js";

export function handler(): void {
    const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
    const sourceDir = resolve(packageRoot, "templates", ".claude", "skills");
    const targetDir = resolve(process.cwd(), ".claude", "skills");

    if (!existsSync(sourceDir)) {
        throw new Error(
            `Skills directory not found at ${sourceDir}. The @webiny/data-transfer package may be corrupted — reinstall it.`
        );
    }

    try {
        mkdirSync(targetDir, { recursive: true });

        const skills = readdirSync(sourceDir, { withFileTypes: true }).filter(entry =>
            entry.isDirectory()
        );

        if (skills.length === 0) {
            console.log("No skills found in the package.");
            return;
        }

        for (const skill of skills) {
            const source = resolve(sourceDir, skill.name);
            const target = resolve(targetDir, skill.name);
            cpSync(source, target, { recursive: true });
            console.log(`  Updated: ${skill.name}`);
        }

        console.log(`\n${skills.length} skill(s) updated.\n`);
    } catch (error) {
        console.error(`\nError: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
    }
}
