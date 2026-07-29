import {
  existsSync,
  cpSync,
  rmSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join, extname } from "node:path";
import { transformImports } from "./transformImports.js";
import { generateSecurityConfig } from "./securityConfig.js";
import { generatePackageJson } from "./generatePackageJson.js";
export function scaffold(args) {
  const { options, targetDir, templatesDir, projectsDir } = args;
  if (existsSync(targetDir)) {
    throw new Error(`Directory "${options.projectName}" already exists.`);
  }
  cpSync(templatesDir, targetDir, { recursive: true });
  try {
    const tplPath = join(targetDir, "package.json.tpl");
    if (existsSync(tplPath)) {
      rmSync(tplPath);
    }
    const tplEnvPath = join(targetDir, ".env.example");
    if (existsSync(tplEnvPath)) {
      rmSync(tplEnvPath);
    }
    const presetDir = join(projectsDir, options.preset);
    copyPresetFiles(presetDir, targetDir);
    writeFileSync(
      join(targetDir, "package.json"),
      generatePackageJson(options.projectName, options.packageManager)
    );
    const security = generateSecurityConfig(options.packageManager);
    writeFileSync(join(targetDir, security.filename), security.content);
  } catch (error) {
    rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
}
function copyPresetFiles(sourceDir, targetDir) {
  const entries = readdirSync(sourceDir);
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    const stat = statSync(sourcePath);
    if (stat.isDirectory()) {
      cpSync(sourcePath, targetPath, { recursive: true });
    } else {
      const ext = extname(entry);
      if (ext === ".ts" || ext === ".tsx") {
        const content = readFileSync(sourcePath, "utf-8");
        writeFileSync(targetPath, transformImports(content));
      } else {
        cpSync(sourcePath, targetPath);
      }
    }
  }
}
//# sourceMappingURL=scaffold.js.map
