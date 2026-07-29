import { resolve, dirname, basename } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findPackageRoot } from "../../utils/findPackageRoot.js";
import { promptOptions } from "./steps/promptOptions.js";
import { scaffold } from "./steps/scaffold.js";
import { installDeps } from "./steps/installDeps.js";
import { printNextSteps } from "./steps/printNextSteps.js";
export async function handler(args) {
  validateProjectName(args.projectName);
  const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  const templatesDir = resolve(packageRoot, "templates");
  const projectsDir = resolve(packageRoot, "projects");
  const targetDir = resolve(process.cwd(), args.projectName);
  if (!existsSync(templatesDir)) {
    throw new Error(
      `Templates directory not found at ${templatesDir}. The @webiny/data-transfer package may be corrupted — reinstall it.`
    );
  }
  try {
    const options = await promptOptions({
      projectName: args.projectName,
      preset: args.preset,
      pm: args.pm,
      projectsDir
    });
    scaffold({ options, targetDir, templatesDir, projectsDir });
    console.log("\nInstalling dependencies...\n");
    await installDeps(targetDir, options.packageManager);
    printNextSteps(options);
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
function validateProjectName(name) {
  if (/[/\\]/.test(name) || name.includes("..") || name !== basename(name)) {
    throw new Error(
      `Invalid project name "${name}". Must be a simple directory name without path separators or "..".`
    );
  }
}
//# sourceMappingURL=handler.js.map
