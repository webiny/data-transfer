import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findPackageRoot } from "~/utils/findPackageRoot.js";

interface OwnPackageJson {
    version: string;
    devDependencies: Record<string, string>;
    packageManager: string;
}

let cached: OwnPackageJson | null = null;

function readOwnPackageJson(): OwnPackageJson {
    if (cached) {
        return cached;
    }
    const pkgPath = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "package.json");
    cached = JSON.parse(readFileSync(pkgPath, "utf-8")) as OwnPackageJson;
    return cached;
}

export function generatePackageJson(projectName: string): string {
    const own = readOwnPackageJson();

    const pkg: Record<string, unknown> = {
        name: projectName,
        private: true,
        type: "module",
        packageManager: own.packageManager,
        scripts: {
            transfer: "webiny-data-transfer",
            "ts-check": "tsc --noEmit"
        },
        dependencies: {
            "@webiny/data-transfer": `^${own.version}`
        },
        devDependencies: {
            typescript: own.devDependencies["typescript"] ?? "^7.0.0"
        },
        resolutions: {
            "@webiny/api-elasticsearch-tasks": "npm:empty-npm-package@1.0.0"
        },
        overrides: {
            "@webiny/api-elasticsearch-tasks": "npm:empty-npm-package@1.0.0"
        }
    };

    return JSON.stringify(pkg, null, 2) + "\n";
}
