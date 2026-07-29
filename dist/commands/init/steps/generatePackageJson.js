import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findPackageRoot } from "../../../utils/findPackageRoot.js";
let cached = null;
function readOwnPackageJson() {
  if (cached) {
    return cached;
  }
  const pkgPath = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "package.json");
  cached = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return cached;
}
export function generatePackageJson(projectName, pm) {
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
  if (pm === "yarn" && own.packageManager) {
    pkg.packageManager = own.packageManager;
  }
  return JSON.stringify(pkg, null, 2) + "\n";
}
//# sourceMappingURL=generatePackageJson.js.map
