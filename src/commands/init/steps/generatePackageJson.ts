import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findPackageRoot } from "~/utils/findPackageRoot.js";
import type { PackageManager } from "../types.ts";

interface OwnPackageJson {
    version: string;
    devDependencies: Record<string, string>;
    packageManager?: string;
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

export function generatePackageJson(projectName: string, pm?: PackageManager): string {
    const own = readOwnPackageJson();

    const pkg: Record<string, unknown> = {
        name: projectName,
        private: true,
        type: "module",
        scripts: {
            transfer: "webiny-data-transfer",
            "ts-check": "tsc --noEmit"
        },
        dependencies: {
            "@webiny/data-transfer": `^${own.version}`
        },
        devDependencies: {
            typescript: own.devDependencies["typescript"] ?? "^7.0.0"
        }
    };

    if (pm === "yarn" && own.packageManager) {
        pkg.packageManager = own.packageManager;
    }

    return JSON.stringify(pkg, null, 2) + "\n";
}
