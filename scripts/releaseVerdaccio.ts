import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { bin } from "./bin.ts";

const DIST_TAG = "local-npm";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "dist");

function readVerdaccioListenUrl(): string {
  const configPath = join(root, ".verdaccio.yaml");
  const content = readFileSync(configPath, "utf-8");
  const match = content.match(/^listen:\s*(.+)$/m);

  if (!match || !match[1]) {
    console.error("ABORT: no 'listen' field in .verdaccio.yaml");
    console.error("Add: listen: http://localhost:4873");
    process.exit(1);
  }

  return match[1].trim();
}

function ensureLocalRegistry(verdaccioUrl: string): void {
  const configured = execFileSync(bin("npm"), ["config", "get", "registry"], {
    encoding: "utf-8"
  }).trim();

  const expected = verdaccioUrl.replace(/\/$/, "");
  const actual = configured.replace(/\/$/, "");

  if (actual !== expected) {
    console.error("ABORT: npm registry is not pointing to verdaccio.");
    console.error(`  Current:  ${configured}`);
    console.error(`  Expected: ${verdaccioUrl}`);
    console.error("");
    console.error(`Set it with: npm config set registry ${verdaccioUrl}`);
    process.exit(1);
  }
}

function getCommitHash(): string {
  return execFileSync(bin("git"), ["rev-parse", "--short", "HEAD"], {
    cwd: root,
    encoding: "utf-8"
  }).trim();
}

function computeVersion(): string {
  const commitHash = getCommitHash();
  return `0.0.0-${DIST_TAG}.${commitHash}`;
}

function rewriteVersion(version: string): void {
  const pkgPath = join(distDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

function build(): void {
  console.log("Building...");
  execFileSync(bin("node"), ["scripts/buildPackages.ts"], {
    cwd: root,
    stdio: "inherit"
  });
}

function publish(version: string, registry: string): void {
  console.log(`Publishing ${version} to ${registry} with tag ${DIST_TAG}...`);
  execFileSync(bin("npm"), ["publish", "--registry", registry, "--tag", DIST_TAG], {
    cwd: distDir,
    stdio: "inherit"
  });
}

const registry = readVerdaccioListenUrl();
ensureLocalRegistry(registry);

build();

const version = computeVersion();
console.log(`Version: ${version}`);

rewriteVersion(version);
publish(version, registry);

console.log(`\nPublished @webiny/data-transfer@${version} to verdaccio`);
console.log(`\nTo use in a project:`);
console.log(`  yarn config set npmRegistryServer ${registry}`);
console.log(`  yarn add @webiny/data-transfer@${version}`);
