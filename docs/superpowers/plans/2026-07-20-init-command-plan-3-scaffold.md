# Plan 3: Scaffold Step

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scaffold step that creates the project directory with templates, preset files, generated package.json, and security config.

**Architecture:** Single `scaffold()` function that: (1) copies `templates/` tree, (2) cleans up template artifacts, (3) copies preset files with import transform, (4) generates `package.json`, (5) writes security config. Uses existing `DirectoryTool` and `FileTool` from the DI container.

**Tech Stack:** Node.js `fs`, existing `DirectoryTool`/`FileTool` abstractions, `@webiny/di`

## Global Constraints

- Import transform: `from "~/index.ts"` → `from "@webiny/data-transfer"` on `.ts` and `.tsx` files
- `package.json.tpl` deleted after templates copy
- `templates/.env.example` deleted after templates copy (preset version overwrites)
- package.json generated programmatically; version read from own package.json
- Security config: `.yarnrc.yml` for yarn, `.npmrc` for npm/pnpm
- Fail if target directory already exists

---

### Task 1: Write import transform utility

**Files:**
- Create: `src/commands/init/steps/transformImports.ts`
- Create: `__tests__/commands/init/steps/transformImports.test.ts`

**Interfaces:**
- Produces: `transformImports(content: string): string` — replaces `~/index.ts` imports with `@webiny/data-transfer`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { transformImports } from "~/commands/init/steps/transformImports.ts";

describe("transformImports", () => {
    it("replaces ~/index.ts with @webiny/data-transfer", () => {
        const input = `import { createConfig } from "~/index.ts";`;
        expect(transformImports(input)).toBe(
            `import { createConfig } from "@webiny/data-transfer";`
        );
    });

    it("handles single quotes", () => {
        const input = `import { createConfig } from '~/index.ts';`;
        expect(transformImports(input)).toBe(
            `import { createConfig } from '@webiny/data-transfer';`
        );
    });

    it("handles multiple imports in same file", () => {
        const input = [
            `import { createConfig } from "~/index.ts";`,
            `import { fromEnv } from "~/index.ts";`
        ].join("\n");
        const expected = [
            `import { createConfig } from "@webiny/data-transfer";`,
            `import { fromEnv } from "@webiny/data-transfer";`
        ].join("\n");
        expect(transformImports(input)).toBe(expected);
    });

    it("leaves other imports untouched", () => {
        const input = `import { something } from "other-package";`;
        expect(transformImports(input)).toBe(input);
    });

    it("handles re-exports", () => {
        const input = `export { createConfig } from "~/index.ts";`;
        expect(transformImports(input)).toBe(
            `export { createConfig } from "@webiny/data-transfer";`
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/init/steps/transformImports.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
export function transformImports(content: string): string {
    return content.replaceAll(`"~/index.ts"`, `"@webiny/data-transfer"`)
                  .replaceAll(`'~/index.ts'`, `'@webiny/data-transfer'`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/init/steps/transformImports.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/init/steps/transformImports.ts __tests__/commands/init/steps/transformImports.test.ts
git commit -m "feat: add import path transform for init scaffold"
```

### Task 2: Write security config generators

**Files:**
- Create: `src/commands/init/steps/securityConfig.ts`
- Create: `__tests__/commands/init/steps/securityConfig.test.ts`

**Interfaces:**
- Produces: `generateSecurityConfig(pm: PackageManager): { filename: string; content: string }`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { generateSecurityConfig } from "~/commands/init/steps/securityConfig.ts";

describe("generateSecurityConfig", () => {
    it("generates .yarnrc.yml for yarn", () => {
        const result = generateSecurityConfig("yarn");
        expect(result.filename).toBe(".yarnrc.yml");
        expect(result.content).toContain("enableScripts: false");
        expect(result.content).toContain("npmMinimalAgeGate: 3d");
        expect(result.content).toContain(`"@webiny/*"`);
        expect(result.content).toContain("nodeLinker: node-modules");
    });

    it("generates .npmrc for npm", () => {
        const result = generateSecurityConfig("npm");
        expect(result.filename).toBe(".npmrc");
        expect(result.content).toContain("audit-level=high");
        expect(result.content).toContain("ignore-scripts=true");
    });

    it("generates .npmrc for pnpm", () => {
        const result = generateSecurityConfig("pnpm");
        expect(result.filename).toBe(".npmrc");
        expect(result.content).toContain("audit-level=high");
        expect(result.content).toContain("ignore-scripts=true");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/init/steps/securityConfig.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
import type { PackageManager } from "../types.ts";

interface SecurityConfigResult {
    filename: string;
    content: string;
}

const YARNRC = `enableScripts: false

npmMinimalAgeGate: 3d

npmPreapprovedPackages:
  - "@webiny/*"

nodeLinker: node-modules
`;

const NPMRC = `audit-level=high
ignore-scripts=true
`;

export function generateSecurityConfig(pm: PackageManager): SecurityConfigResult {
    if (pm === "yarn") {
        return { filename: ".yarnrc.yml", content: YARNRC };
    }
    return { filename: ".npmrc", content: NPMRC };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/init/steps/securityConfig.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/init/steps/securityConfig.ts __tests__/commands/init/steps/securityConfig.test.ts
git commit -m "feat: add security config generation for init scaffold"
```

### Task 3: Write package.json generator

**Files:**
- Create: `src/commands/init/steps/generatePackageJson.ts`
- Create: `__tests__/commands/init/steps/generatePackageJson.test.ts`

**Interfaces:**
- Produces: `generatePackageJson(projectName: string): string` — returns stringified JSON

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { generatePackageJson } from "~/commands/init/steps/generatePackageJson.ts";

describe("generatePackageJson", () => {
    it("generates valid JSON with project name", () => {
        const result = JSON.parse(generatePackageJson("my-migration"));
        expect(result.name).toBe("my-migration");
        expect(result.private).toBe(true);
        expect(result.type).toBe("module");
    });

    it("includes transfer script", () => {
        const result = JSON.parse(generatePackageJson("test"));
        expect(result.scripts.transfer).toBe("webiny-data-transfer");
    });

    it("includes ts-check script", () => {
        const result = JSON.parse(generatePackageJson("test"));
        expect(result.scripts["ts-check"]).toBe("tsc --noEmit");
    });

    it("includes @webiny/data-transfer as dependency with caret range", () => {
        const result = JSON.parse(generatePackageJson("test"));
        const version = result.dependencies["@webiny/data-transfer"];
        expect(version).toMatch(/^\^/);
        expect(version.length).toBeGreaterThan(1);
    });

    it("includes typescript as devDependency", () => {
        const result = JSON.parse(generatePackageJson("test"));
        expect(result.devDependencies.typescript).toMatch(/^\^/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/init/steps/generatePackageJson.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
import { readFileSync } from "node:fs";
import { resolve, fileURLToPath } from "node:url";
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
    const pkgPath = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "package.json");
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/init/steps/generatePackageJson.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/init/steps/generatePackageJson.ts __tests__/commands/init/steps/generatePackageJson.test.ts
git commit -m "feat: add package.json generation for init scaffold"
```

### Task 4: Write scaffold orchestrator

**Files:**
- Create: `src/commands/init/steps/scaffold.ts`
- Create: `__tests__/commands/init/steps/scaffold.test.ts`

**Interfaces:**
- Consumes: `transformImports()` from Task 1, `generateSecurityConfig()` from Task 2, `generatePackageJson()` from Task 3, `InitOptions` from Plan 2 Task 1
- Produces: `scaffold(options: InitOptions): void` — creates the project directory with all files

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffold } from "~/commands/init/steps/scaffold.ts";

describe("scaffold", () => {
    let workDir: string;
    let templatesDir: string;
    let projectsDir: string;

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), "scaffold-work-"));
        templatesDir = mkdtempSync(join(tmpdir(), "scaffold-tpl-"));
        projectsDir = mkdtempSync(join(tmpdir(), "scaffold-presets-"));

        // Minimal templates tree
        writeFileSync(join(templatesDir, "tsconfig.json"), "{}");
        writeFileSync(join(templatesDir, ".gitignore"), "node_modules");
        writeFileSync(join(templatesDir, "package.json.tpl"), "should-be-deleted");
        writeFileSync(join(templatesDir, ".env.example"), "should-be-deleted");

        // Preset
        mkdirSync(join(projectsDir, "blank"));
        writeFileSync(
            join(projectsDir, "blank", "config.ts"),
            `import { createConfig } from "~/index.ts";\nexport default createConfig({});`
        );
        writeFileSync(join(projectsDir, "blank", ".env.example"), "SOURCE_REGION=us-east-1");
    });

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true });
        rmSync(templatesDir, { recursive: true, force: true });
        rmSync(projectsDir, { recursive: true, force: true });
    });

    it("creates target directory with templates", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank", packageManager: "npm" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        expect(existsSync(join(target, "tsconfig.json"))).toBe(true);
    });

    it("deletes package.json.tpl after copy", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank", packageManager: "npm" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        expect(existsSync(join(target, "package.json.tpl"))).toBe(false);
    });

    it("replaces templates/.env.example with preset version", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank", packageManager: "npm" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        expect(readFileSync(join(target, ".env.example"), "utf-8")).toBe("SOURCE_REGION=us-east-1");
    });

    it("transforms imports in copied .ts files", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank", packageManager: "npm" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        const config = readFileSync(join(target, "config.ts"), "utf-8");
        expect(config).toContain(`from "@webiny/data-transfer"`);
        expect(config).not.toContain("~/index.ts");
    });

    it("generates package.json with project name", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank", packageManager: "npm" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf-8"));
        expect(pkg.name).toBe("my-project");
    });

    it("writes .npmrc for npm", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank", packageManager: "npm" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        expect(existsSync(join(target, ".npmrc"))).toBe(true);
    });

    it("writes .yarnrc.yml for yarn", () => {
        const target = join(workDir, "my-project");
        scaffold({
            options: { projectName: "my-project", preset: "blank", packageManager: "yarn" },
            targetDir: target,
            templatesDir,
            projectsDir
        });
        expect(existsSync(join(target, ".yarnrc.yml"))).toBe(true);
    });

    it("throws if target directory exists", () => {
        const target = join(workDir, "exists");
        mkdirSync(target);
        expect(() =>
            scaffold({
                options: { projectName: "exists", preset: "blank", packageManager: "npm" },
                targetDir: target,
                templatesDir,
                projectsDir
            })
        ).toThrow(/already exists/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/init/steps/scaffold.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
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
import type { InitOptions } from "../types.ts";
import { transformImports } from "./transformImports.ts";
import { generateSecurityConfig } from "./securityConfig.ts";
import { generatePackageJson } from "./generatePackageJson.ts";

interface ScaffoldArgs {
    options: InitOptions;
    targetDir: string;
    templatesDir: string;
    projectsDir: string;
}

export function scaffold(args: ScaffoldArgs): void {
    const { options, targetDir, templatesDir, projectsDir } = args;

    if (existsSync(targetDir)) {
        throw new Error(`Directory "${options.projectName}" already exists.`);
    }

    cpSync(templatesDir, targetDir, { recursive: true });

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

    writeFileSync(join(targetDir, "package.json"), generatePackageJson(options.projectName));

    const security = generateSecurityConfig(options.packageManager);
    writeFileSync(join(targetDir, security.filename), security.content);
}

function copyPresetFiles(sourceDir: string, targetDir: string): void {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/init/steps/scaffold.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Run full typecheck**

Run: `yarn ts-check`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/commands/init/steps/scaffold.ts __tests__/commands/init/steps/scaffold.test.ts
git commit -m "feat: add scaffold step for init command"
```
