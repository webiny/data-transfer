import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const PACKAGE_NAME = "@webiny/data-transfer";

/**
 * Walk up from `startDir` looking for the `package.json` belonging to
 * `@webiny/data-transfer` itself.
 *
 * Hardcoded `".."` chains from `import.meta.url` break across contexts:
 * they count the `src/` prefix depth, which changes after compilation
 * (`src/` stripped, files live in `dist/`) and after publish (`dist/`
 * becomes the package root). Walking up to the nearest matching
 * `package.json` works in source (tsx), compiled (dist/), and installed
 * (npm) contexts alike.
 *
 * @example
 *   const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
 */
export function findPackageRoot(startDir: string): string {
    let dir = startDir;
    while (dir !== dirname(dir)) {
        const pkgPath = join(dir, "package.json");
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
                if (pkg.name === PACKAGE_NAME) {
                    return dir;
                }
            } catch {
                // malformed package.json, keep walking
            }
        }
        dir = dirname(dir);
    }
    throw new Error(`Could not find ${PACKAGE_NAME} package root`);
}
