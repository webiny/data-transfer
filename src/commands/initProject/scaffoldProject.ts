import { existsSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findPackageRoot } from "~/utils/findPackageRoot.js";

interface ScaffoldProjectParams {
    name: string;
    cwd: string;
}

export async function scaffoldProject(params: ScaffoldProjectParams): Promise<void> {
    const { name, cwd } = params;
    const targetDir = resolve(cwd, "projects", name);

    if (existsSync(targetDir)) {
        throw new Error(`Project "projects/${name}" already exists.`);
    }

    const templateDir = resolve(
        findPackageRoot(dirname(fileURLToPath(import.meta.url))),
        "templates",
        "projects",
        "example"
    );

    if (!existsSync(templateDir)) {
        throw new Error(`Project template not found at ${templateDir}`);
    }

    cpSync(templateDir, targetDir, { recursive: true });
}
