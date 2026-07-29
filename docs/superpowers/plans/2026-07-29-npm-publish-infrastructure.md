# npm Publish Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@webiny/data-transfer` publishable to npm using changesets and a DI-based build pipeline mirroring `@webiny/stdlib`.

**Architecture:** Split tsconfig into build (composite, emits JS+d.ts) and check-only (noEmit) configs. Build scripts use `@webiny/di` with the same Cleaner/Compiler/PathAliasRewriter/ArtifactCopier/BuildOrchestrator abstraction stack as stdlib. Publish from `dist/` via `publishConfig.directory`. Changesets handle versioning.

**Tech Stack:** TypeScript 7, `@webiny/di`, `@changesets/cli`, `tsc -b`

## Global Constraints

- Node >= 24 (already enforced in `engines`)
- ESM only (`"type": "module"`)
- `~/` path alias in source — PathAliasRewriter fixes in compiled output
- Source uses `.ts` import extensions — `rewriteRelativeImportExtensions` handles in output
- Build scripts run via `node scripts/X.ts` (Node 24 native TS)
- Follow stdlib DI patterns exactly: `Abstraction` + `createImplementation` + `Container`
- Follow project conventions: no inline structural types, explicit access modifiers, camelCase files

## Reference: stdlib structure

Build scripts live in `@webiny/stdlib` at `scripts/features/BuildPackages/`. Abstractions: ProjectConfig, Cleaner, Compiler, ArtifactCopier, PathAliasRewriter, BuildOrchestrator. Entry points: `scripts/buildPackages.ts`, `scripts/cleanPackages.ts`, `scripts/packPackages.ts`. All use `@webiny/di` Container.

---

### Task 1: tsconfig Restructure + Changeset Setup

**Files:**
- Create: `config/tsconfig.build.json`
- Create: `config/tsconfig.check.json`
- Create: `config/tsconfig.checkmode.json`
- Create: `config/tsconfig.check.scripts.json`
- Create: `.changeset/config.json`
- Modify: `tsconfig.json`
- Modify: `package.json` (scripts.ts-check, devDependencies)

**Interfaces:**
- Consumes: nothing
- Produces: build tsconfig at `config/tsconfig.build.json` consumed by Compiler in Task 4

- [ ] **Step 1: Create `config/tsconfig.checkmode.json`**

```json
{
  "compilerOptions": {
    "composite": false,
    "noEmit": true,
    "rootDir": ".."
  }
}
```

- [ ] **Step 2: Create `config/tsconfig.build.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "../src",
    "outDir": "../dist",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "paths": { "~/*": ["../src/*"] }
  },
  "include": ["../src"],
  "exclude": ["../node_modules", "../dist"]
}
```

- [ ] **Step 3: Create `config/tsconfig.check.json`**

```json
{
  "extends": ["./tsconfig.build.json", "./tsconfig.checkmode.json"],
  "include": ["../src", "../__tests__", "../projects"],
  "exclude": ["../node_modules", "../dist"]
}
```

- [ ] **Step 4: Create `config/tsconfig.check.scripts.json`**

```json
{
  "extends": ["./tsconfig.build.json", "./tsconfig.checkmode.json"],
  "compilerOptions": {
    "allowImportingTsExtensions": true
  },
  "include": ["../scripts"]
}
```

- [ ] **Step 5: Rewrite root `tsconfig.json` to shared base (no noEmit, add rewriteRelativeImportExtensions)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true
  },
  "files": [],
  "references": [
    { "path": "./config/tsconfig.build.json" }
  ]
}
```

- [ ] **Step 6: Update `package.json` — ts-check script + add `@changesets/cli`**

Change `"ts-check"` to: `"tsc -p config/tsconfig.check.json && tsc -p config/tsconfig.check.scripts.json"`

Add to devDependencies: `"@changesets/cli": "^2.31.1"`

- [ ] **Step 7: Create `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 8: Run `yarn install` to pick up new devDep**

- [ ] **Step 9: Run ts-check to verify tsconfig restructure**

Run: `yarn tsc -p config/tsconfig.check.json && yarn tsc -p config/tsconfig.check.scripts.json`

Expected: no type errors (scripts tsconfig will fail until Task 3 creates the files — that's expected, just verify check.json passes)

- [ ] **Step 10: Commit**

```
feat: restructure tsconfig for build + check split and add changeset config
```

---

### Task 2: `findPackageRoot` Utility + Fix `import.meta.url` Navigations

**Files:**
- Create: `src/utils/findPackageRoot.ts`
- Create: `__tests__/utils/findPackageRoot.test.ts`
- Modify: `src/index.ts` (export findPackageRoot)
- Modify: `src/commands/init/handler.ts`
- Modify: `src/commands/init/steps/generatePackageJson.ts`
- Modify: `src/commands/initProject/scaffoldProject.ts`
- Modify: `src/features/WorkerSpawner/WorkerSpawner.ts`
- Modify: `src/features/PresetLoader/PresetLoader.ts`
- Modify: `src/commands/run/handler.ts`
- Modify: `src/commands/run/wizard/presetDiscovery.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `findPackageRoot(startDir: string): string` — walks up from `startDir` looking for `package.json` with `name === "@webiny/data-transfer"`. Works in source (tsx), compiled (dist/), and installed (npm) contexts.

**Why:** Currently 7 files use hardcoded `".."` chains from `import.meta.url` to reach the package root. These chains count the `src/` prefix depth. After compilation (`src/` stripped, files live in `dist/`), and after publish (`dist/` becomes the root), the depth changes. A `findPackageRoot` utility that walks up to the nearest matching `package.json` works in all three contexts.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/utils/findPackageRoot.test.ts
import { describe, it, expect } from "vitest";
import { findPackageRoot } from "~/utils/findPackageRoot.ts";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

describe("findPackageRoot", () => {
    it("finds the package root from a nested source directory", () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const root = findPackageRoot(here);
        expect(root).toMatch(/data-transfer$/);
    });

    it("throws when no matching package.json is found", () => {
        expect(() => findPackageRoot("/")).toThrow("Could not find @webiny/data-transfer package root");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/utils/findPackageRoot.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `findPackageRoot`**

```typescript
// src/utils/findPackageRoot.ts
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const PACKAGE_NAME = "@webiny/data-transfer";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/utils/findPackageRoot.test.ts`
Expected: PASS

- [ ] **Step 5: Update all `import.meta.url` navigation sites**

Seven files to update. Each replaces a hardcoded `".."` chain with `findPackageRoot`. The import:

```typescript
import { findPackageRoot } from "~/utils/findPackageRoot.ts";
```

**`src/commands/init/handler.ts:18`** — change:
```typescript
// before
const packageRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
// after
const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
```

**`src/commands/init/steps/generatePackageJson.ts:18-26`** — change:
```typescript
// before
const pkgPath = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..", "package.json");
// after
const pkgPath = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "package.json");
```

**`src/commands/initProject/scaffoldProject.ts:18-26`** — change:
```typescript
// before
const templatesDir = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "templates", "internal-project");
// after
const templatesDir = resolve(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "templates", "internal-project");
```

**`src/features/WorkerSpawner/WorkerSpawner.ts:10`** — change:
```typescript
// before
this.binPath = fileURLToPath(new URL("../../../bin.js", import.meta.url));
// after
this.binPath = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "bin.js");
```

**`src/features/PresetLoader/PresetLoader.ts:10`** — change:
```typescript
// before
const BUILTIN_PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../presets");
// after
const BUILTIN_PRESETS_DIR = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "presets");
```

**`src/commands/run/handler.ts:245`** — change:
```typescript
// before
const binPath = fileURLToPath(new URL("../../../bin.js", import.meta.url));
// after
const binPath = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "bin.js");
```

**`src/commands/run/wizard/presetDiscovery.ts:5`** — change:
```typescript
// before
const BUILTIN_PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../presets");
// after
const BUILTIN_PRESETS_DIR = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "presets");
```

- [ ] **Step 6: Export from `src/index.ts`**

Add `findPackageRoot` to the public API exports (users building custom tooling may need it).

- [ ] **Step 7: Run full test suite**

Run: `yarn test`
Expected: all existing tests pass

- [ ] **Step 8: Commit**

```
feat: add findPackageRoot utility and fix import.meta.url navigations for publish compatibility
```

---

### Task 3: Build Script Abstractions

**Files:**
- Create: `scripts/bin.ts`
- Create: `scripts/features/BuildPackages/abstractions/ProjectConfig.ts`
- Create: `scripts/features/BuildPackages/abstractions/Cleaner.ts`
- Create: `scripts/features/BuildPackages/abstractions/Compiler.ts`
- Create: `scripts/features/BuildPackages/abstractions/ArtifactCopier.ts`
- Create: `scripts/features/BuildPackages/abstractions/PathAliasRewriter.ts`
- Create: `scripts/features/BuildPackages/abstractions/BuildOrchestrator.ts`
- Create: `scripts/features/BuildPackages/abstractions/index.ts`

**Interfaces:**
- Consumes: `@webiny/di` (`Abstraction`)
- Produces: all abstraction tokens consumed by Task 4 implementations

These are direct ports from stdlib with one addition: `IArtifactCopier` gains `copyAssets(sourceDir, distAbsDir)` for templates/projects.

- [ ] **Step 1: Create `scripts/bin.ts`**

```typescript
export function bin(name: string): string {
    return process.platform === "win32" ? `${name}.cmd` : name;
}
```

- [ ] **Step 2: Create abstractions — all 7 files**

`scripts/features/BuildPackages/abstractions/ProjectConfig.ts`:
```typescript
import { Abstraction } from "@webiny/di";

export interface IProjectConfig {
    rootDir: string;
    slices: string[];
}

export const ProjectConfig = new Abstraction<IProjectConfig>("Scripts/Build/ProjectConfig");

export namespace ProjectConfig {
    export type Interface = IProjectConfig;
}
```

`scripts/features/BuildPackages/abstractions/Cleaner.ts`:
```typescript
import { Abstraction } from "@webiny/di";

export interface ICleaner {
    clean(absDir: string): void;
}

export const Cleaner = new Abstraction<ICleaner>("Scripts/Build/Cleaner");

export namespace Cleaner {
    export type Interface = ICleaner;
}
```

`scripts/features/BuildPackages/abstractions/Compiler.ts`:
```typescript
import { Abstraction } from "@webiny/di";

export interface ICompiler {
    compile(packageRelDir: string): void;
}

export const Compiler = new Abstraction<ICompiler>("Scripts/Build/Compiler");

export namespace Compiler {
    export type Interface = ICompiler;
}
```

`scripts/features/BuildPackages/abstractions/ArtifactCopier.ts`:
```typescript
import { Abstraction } from "@webiny/di";

export interface IArtifactCopier {
    copyPackageJson(packageAbsDir: string, distAbsDir: string): void;
    copyReadme(packageAbsDir: string, distAbsDir: string): void;
    copyLicense(sourceDir: string, distAbsDir: string): void;
    copyAssets(sourceDir: string, distAbsDir: string): void;
}

export const ArtifactCopier = new Abstraction<IArtifactCopier>("Scripts/Build/ArtifactCopier");

export namespace ArtifactCopier {
    export type Interface = IArtifactCopier;
}
```

`scripts/features/BuildPackages/abstractions/PathAliasRewriter.ts`:
```typescript
import { Abstraction } from "@webiny/di";

export interface IPathAliasRewriter {
    rewrite(distDir: string): void;
}

export const PathAliasRewriter = new Abstraction<IPathAliasRewriter>(
    "Scripts/Build/PathAliasRewriter"
);

export namespace PathAliasRewriter {
    export type Interface = IPathAliasRewriter;
}
```

`scripts/features/BuildPackages/abstractions/BuildOrchestrator.ts`:
```typescript
import { Abstraction } from "@webiny/di";

export interface IBuildOrchestrator {
    run(): void;
}

export const BuildOrchestrator = new Abstraction<IBuildOrchestrator>(
    "Scripts/Build/BuildOrchestrator"
);

export namespace BuildOrchestrator {
    export type Interface = IBuildOrchestrator;
}
```

`scripts/features/BuildPackages/abstractions/index.ts`:
```typescript
export { ProjectConfig } from "./ProjectConfig.ts";
export { Cleaner } from "./Cleaner.ts";
export { Compiler } from "./Compiler.ts";
export { ArtifactCopier } from "./ArtifactCopier.ts";
export { BuildOrchestrator } from "./BuildOrchestrator.ts";
export { PathAliasRewriter } from "./PathAliasRewriter.ts";
```

- [ ] **Step 3: Commit**

```
feat: add build script abstractions
```

---

### Task 4: Build Script Implementations + Entry Points

**Files:**
- Create: `scripts/features/BuildPackages/Cleaner.ts`
- Create: `scripts/features/BuildPackages/Compiler.ts`
- Create: `scripts/features/BuildPackages/ArtifactCopier.ts`
- Create: `scripts/features/BuildPackages/PathAliasRewriter.ts`
- Create: `scripts/features/BuildPackages/BuildOrchestrator.ts`
- Create: `scripts/features/BuildPackages/index.ts`
- Create: `scripts/buildPackages.ts`
- Create: `scripts/cleanPackages.ts`
- Create: `scripts/packPackages.ts`

**Interfaces:**
- Consumes: all abstractions from Task 3, `config/tsconfig.build.json` from Task 1
- Produces: working `node scripts/buildPackages.ts` that outputs a publishable `dist/`

- [ ] **Step 1: Create `Cleaner.ts`**

Direct port from stdlib:
```typescript
import { rmSync } from "node:fs";
import { Cleaner as CleanerAbstraction } from "./abstractions/Cleaner.ts";

class CleanerImpl implements CleanerAbstraction.Interface {
    public clean(absDir: string): void {
        rmSync(absDir, { recursive: true, force: true });
    }
}

export const Cleaner = CleanerAbstraction.createImplementation({
    implementation: CleanerImpl,
    dependencies: []
});
```

- [ ] **Step 2: Create `Compiler.ts`**

Direct port from stdlib:
```typescript
import { execFileSync } from "node:child_process";
import { Compiler as CompilerAbstraction } from "./abstractions/Compiler.ts";
import { ProjectConfig } from "./abstractions/ProjectConfig.ts";
import { bin } from "../../bin.ts";

class CompilerImpl implements CompilerAbstraction.Interface {
    private readonly config: ProjectConfig.Interface;

    public constructor(config: ProjectConfig.Interface) {
        this.config = config;
    }

    public compile(packageRelDir: string): void {
        execFileSync(bin("tsc"), ["-b", "--force", packageRelDir], {
            cwd: this.config.rootDir,
            stdio: "inherit"
        });
    }
}

export const Compiler = CompilerAbstraction.createImplementation({
    implementation: CompilerImpl,
    dependencies: [ProjectConfig]
});
```

- [ ] **Step 3: Create `PathAliasRewriter.ts`**

Direct port from stdlib:
```typescript
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { PathAliasRewriter as PathAliasRewriterAbstraction } from "./abstractions/PathAliasRewriter.ts";

class PathAliasRewriterImpl implements PathAliasRewriterAbstraction.Interface {
    public rewrite(distDir: string): void {
        this.walk(distDir, distDir);
    }

    private walk(distDir: string, dir: string): void {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                this.walk(distDir, fullPath);
            } else if (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
                this.rewriteFile(distDir, fullPath);
            }
        }
    }

    private rewriteFile(distDir: string, filePath: string): void {
        const content = readFileSync(filePath, "utf-8");
        if (!content.includes("~/")) {
            return;
        }

        const depth = relative(distDir, dirname(filePath)).split(/[\\/]/).filter(Boolean).length;
        const prefix = depth === 0 ? "./" : "../".repeat(depth);
        const rewritten = content.replace(/(["'])~\//g, `$1${prefix}`);
        writeFileSync(filePath, rewritten, "utf-8");
    }
}

export const PathAliasRewriter = PathAliasRewriterAbstraction.createImplementation({
    implementation: PathAliasRewriterImpl,
    dependencies: []
});
```

- [ ] **Step 4: Create `ArtifactCopier.ts`**

Extended from stdlib — adds `copyAssets` for templates/projects, rewrites `bin` entries in package.json:
```typescript
import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync
} from "node:fs";
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
                pkgJson.bin[name] = stripDist(path);
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
        for (const dir of ["templates", "projects"]) {
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
```

- [ ] **Step 5: Create `BuildOrchestrator.ts`**

```typescript
import { BuildOrchestrator as BuildOrchestratorAbstraction } from "./abstractions/BuildOrchestrator.ts";
import { ProjectConfig } from "./abstractions/ProjectConfig.ts";
import { Cleaner } from "./abstractions/Cleaner.ts";
import { Compiler } from "./abstractions/Compiler.ts";
import { ArtifactCopier } from "./abstractions/ArtifactCopier.ts";
import { PathAliasRewriter } from "./abstractions/PathAliasRewriter.ts";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

class BuildOrchestratorImpl implements BuildOrchestratorAbstraction.Interface {
    private readonly config: ProjectConfig.Interface;
    private readonly cleaner: Cleaner.Interface;
    private readonly compiler: Compiler.Interface;
    private readonly artifactCopier: ArtifactCopier.Interface;
    private readonly pathAliasRewriter: PathAliasRewriter.Interface;

    public constructor(
        config: ProjectConfig.Interface,
        cleaner: Cleaner.Interface,
        compiler: Compiler.Interface,
        artifactCopier: ArtifactCopier.Interface,
        pathAliasRewriter: PathAliasRewriter.Interface
    ) {
        this.config = config;
        this.cleaner = cleaner;
        this.compiler = compiler;
        this.artifactCopier = artifactCopier;
        this.pathAliasRewriter = pathAliasRewriter;
    }

    public run(): void {
        const { rootDir, slices } = this.config;
        const distDir = join(rootDir, "dist");

        this.cleaner.clean(distDir);

        for (const slice of slices) {
            this.compiler.compile(slice);
        }

        this.pathAliasRewriter.rewrite(distDir);
        this.ensureShebang(rootDir);

        this.artifactCopier.copyAssets(rootDir, distDir);
        this.artifactCopier.copyPackageJson(rootDir, distDir);
        this.artifactCopier.copyReadme(rootDir, distDir);
        this.artifactCopier.copyLicense(rootDir, distDir);
    }

    private ensureShebang(rootDir: string): void {
        const cliPath = join(rootDir, "dist", "cli.js");
        if (!existsSync(cliPath)) {
            return;
        }
        const content = readFileSync(cliPath, "utf-8");
        if (!content.startsWith("#!")) {
            writeFileSync(cliPath, "#!/usr/bin/env node\n" + content);
        }
    }
}

export const BuildOrchestrator = BuildOrchestratorAbstraction.createImplementation({
    implementation: BuildOrchestratorImpl,
    dependencies: [ProjectConfig, Cleaner, Compiler, ArtifactCopier, PathAliasRewriter]
});
```

- [ ] **Step 6: Create `scripts/features/BuildPackages/index.ts` (DI composition root)**

```typescript
import { Container } from "@webiny/di";
import { ProjectConfig, BuildOrchestrator } from "./abstractions/index.ts";
import { Cleaner as CleanerImpl } from "./Cleaner.ts";
import { Compiler as CompilerImpl } from "./Compiler.ts";
import { ArtifactCopier as ArtifactCopierImpl } from "./ArtifactCopier.ts";
import { BuildOrchestrator as BuildOrchestratorImpl } from "./BuildOrchestrator.ts";
import { PathAliasRewriter as PathAliasRewriterImpl } from "./PathAliasRewriter.ts";

export function run(rootDir: string): void {
    const container = new Container();
    container.registerInstance(ProjectConfig, {
        rootDir,
        slices: ["config/tsconfig.build.json"]
    });
    container.register(CleanerImpl).inSingletonScope();
    container.register(CompilerImpl).inSingletonScope();
    container.register(ArtifactCopierImpl).inSingletonScope();
    container.register(PathAliasRewriterImpl).inSingletonScope();
    container.register(BuildOrchestratorImpl).inSingletonScope();
    container.resolve(BuildOrchestrator).run();
}
```

- [ ] **Step 7: Create entry point scripts**

`scripts/buildPackages.ts`:
```typescript
import { fileURLToPath } from "node:url";
import { run } from "./features/BuildPackages/index.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
run(root);
```

`scripts/cleanPackages.ts`:
```typescript
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

rmSync(`${root}/dist`, { recursive: true, force: true });
```

`scripts/packPackages.ts`:
```typescript
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bin } from "./bin.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

execFileSync(bin("npm"), ["pack", "--dry-run"], {
    cwd: `${root}/dist`,
    stdio: "inherit"
});
```

- [ ] **Step 8: Commit**

```
feat: add build script implementations and entry points
```

---

### Task 5: Package.json Updates

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: build scripts from Task 4
- Produces: publishable package.json with correct exports, bin, files, scripts

- [ ] **Step 1: Update `package.json`**

Changes:
```jsonc
{
  // version stays at 1.0.0 — changesets will manage
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "bin": {
    "webiny-data-transfer": "./dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "publishConfig": {
    "directory": "dist"
  },
  "scripts": {
    // keep existing scripts, add/modify:
    "clean": "rm -rf dist",
    "build": "node scripts/buildPackages.ts",
    "pack:packages": "node scripts/packPackages.ts",
    "release": "yarn build && changeset publish",
    "ts-check": "tsc -p config/tsconfig.check.json && tsc -p config/tsconfig.check.scripts.json"
    // keep transfer, test, test:watch, test:coverage, format, lint, check:imports, full
  }
}
```

Remove `"tsx"` from `dependencies` and move to `devDependencies` — consumers of the published package should not need tsx. The dev-time `bin.js` (tsx wrapper) and `yarn transfer` script still work since tsx is in devDeps.

- [ ] **Step 2: Run `yarn install`**

- [ ] **Step 3: Commit**

```
feat: update package.json for npm publish (exports, bin, files, build scripts)
```

---

### Task 6: Build Verification

**Files:** none (verification only)

- [ ] **Step 1: Run full check suite**

```bash
yarn format:fix && yarn lint && yarn check:imports && yarn ts-check && yarn test:coverage
```

All must pass.

- [ ] **Step 2: Run build**

```bash
yarn build
```

Expected: `dist/` appears with compiled JS, .d.ts, .d.ts.map, .js.map files.

- [ ] **Step 3: Verify dist contents**

```bash
ls dist/index.js dist/index.d.ts dist/cli.js
ls dist/templates/ dist/projects/ dist/presets/  # presets compiled by tsc, templates+projects copied by ArtifactCopier
head -1 dist/cli.js  # should show #!/usr/bin/env node
grep -r "~/" dist/ --include="*.js" --include="*.d.ts" | head  # should be empty (all aliases rewritten)
```

- [ ] **Step 4: Run pack dry-run**

```bash
yarn pack:packages
```

Expected: npm lists package contents from `dist/`, no errors.

- [ ] **Step 5: Commit any fixes from verification**

---
