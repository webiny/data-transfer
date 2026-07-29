import { existsSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
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

    const templatesDir = resolve(
        findPackageRoot(dirname(fileURLToPath(import.meta.url))),
        "templates",
        "internal-project"
    );

    if (!existsSync(templatesDir)) {
        throw new Error(`Internal project templates not found at ${templatesDir}`);
    }

    cpSync(templatesDir, targetDir, { recursive: true });

    // only README.md uses {{PROJECT_NAME}} — .env.example does not
    for (const filename of ["README.md"]) {
        const filePath = join(targetDir, filename);
        const content = readFileSync(filePath, "utf-8");
        writeFileSync(filePath, content.replace(/\{\{PROJECT_NAME\}\}/g, name), "utf-8");
    }
}
