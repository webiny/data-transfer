import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ArtifactCopier as ArtifactCopierAbstraction } from "./abstractions/ArtifactCopier.ts";

interface PackageJson {
  main?: string;
  types?: string;
  bin?: Record<string, string>;
  exports?: Record<string, unknown>;
  files?: string[];
  publishConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

type ExportValue = string | null | undefined | Record<string, unknown>;

function stripDist(path: string): string {
  return path.startsWith("./dist/") ? `./${path.slice("./dist/".length)}` : path;
}

function stripDistForBin(path: string): string {
  return path.startsWith("./dist/") ? path.slice("./dist/".length) : path;
}

function rewriteExports(value: ExportValue): ExportValue {
  if (value == null || Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return stripDist(value);
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) {
      result[k] = rewriteExports(v as ExportValue);
    }
  }
  return result;
}

class ArtifactCopierImpl implements ArtifactCopierAbstraction.Interface {
  public copyPackageJson(packageAbsDir: string, distAbsDir: string): void {
    mkdirSync(distAbsDir, { recursive: true });
    const pkgJson = JSON.parse(
      readFileSync(join(packageAbsDir, "package.json"), "utf8")
    ) as PackageJson;

    if (pkgJson.main) {
      pkgJson.main = stripDist(pkgJson.main);
    }
    if (pkgJson.types) {
      pkgJson.types = stripDist(pkgJson.types);
    }
    if (pkgJson.exports) {
      pkgJson.exports = rewriteExports(pkgJson.exports) as Record<string, unknown>;
    }
    if (pkgJson.bin) {
      for (const [name, path] of Object.entries(pkgJson.bin)) {
        pkgJson.bin[name] = stripDistForBin(path);
      }
    }
    delete pkgJson.files;
    delete pkgJson.publishConfig;

    writeFileSync(join(distAbsDir, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n");
  }

  public copyReadme(packageAbsDir: string, distAbsDir: string): void {
    mkdirSync(distAbsDir, { recursive: true });
    copyFileSync(join(packageAbsDir, "README.md"), join(distAbsDir, "README.md"));
  }

  public copyLicense(sourceDir: string, distAbsDir: string): void {
    mkdirSync(distAbsDir, { recursive: true });
    copyFileSync(join(sourceDir, "LICENSE"), join(distAbsDir, "LICENSE"));
  }

  public copyAssets(sourceDir: string, distAbsDir: string): void {
    // presets live in src/presets/ and are compiled by tsc — not copied here
    for (const dir of ["templates", "projects", "docs/mcp"]) {
      const src = join(sourceDir, dir);
      if (existsSync(src)) {
        cpSync(src, join(distAbsDir, dir), { recursive: true });
      }
    }
  }
}

export const ArtifactCopier = ArtifactCopierAbstraction.createImplementation({
  implementation: ArtifactCopierImpl,
  dependencies: []
});
