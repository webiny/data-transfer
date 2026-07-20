import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

interface OwnPackageJson {
    version: string;
    devDependencies: Record<string, string>;
}

let cached: OwnPackageJson | null = null;

function readOwnPackageJson(): OwnPackageJson {
    if (cached) {
        return cached;
    }
    const pkgPath = join(
        fileURLToPath(import.meta.url),
        "..",
        "..",
        "..",
        "..",
        "..",
        "package.json"
    );
    cached = JSON.parse(readFileSync(pkgPath, "utf-8")) as OwnPackageJson;
    return cached;
}

export function generatePackageJson(projectName: string): string {
    const own = readOwnPackageJson();

    const pkg = {
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

    return JSON.stringify(pkg, null, 2) + "\n";
}
