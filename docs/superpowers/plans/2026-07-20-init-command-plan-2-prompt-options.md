# Plan 2: Prompt Options Step

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the interactive prompt step that discovers presets and asks the user for preset + package manager choices.

**Architecture:** Pure function that takes CLI args, discovers presets from the package's `projects/` directory, prompts for missing values via `@inquirer/prompts`, returns a resolved options object. No side effects beyond prompting.

**Tech Stack:** `@inquirer/prompts` (already a dependency), `node:fs`, `node:path`

## Global Constraints

- Preset discovery: scan `projects/` subdirectories for dirs containing `config.ts`
- Package manager detection: read `npm_config_user_agent` env var for default
- Skip prompts when CLI flags provide values
- Invalid `--preset` value: list available presets, throw
- Invalid `--pm` value: list valid options (yarn/npm/pnpm), throw

---

### Task 1: Define InitOptions type

**Files:**
- Create: `src/commands/init/types.ts`

**Produces:** `InitOptions` type and `PackageManager` type used by all later steps

- [ ] **Step 1: Write the types file**

```typescript
export type PackageManager = "yarn" | "npm" | "pnpm";

export interface InitOptions {
    projectName: string;
    preset: string;
    packageManager: PackageManager;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn ts-check`
Expected: no errors

### Task 2: Write preset discovery logic

**Files:**
- Create: `src/commands/init/steps/discoverPresets.ts`
- Create: `__tests__/commands/init/steps/discoverPresets.test.ts`

**Interfaces:**
- Produces: `discoverPresets(projectsDir: string): string[]` — returns sorted list of preset names

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverPresets } from "~/commands/init/steps/discoverPresets.ts";

describe("discoverPresets", () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "presets-"));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("returns directories containing config.ts", () => {
        mkdirSync(join(dir, "v5-to-v6"));
        writeFileSync(join(dir, "v5-to-v6", "config.ts"), "");
        mkdirSync(join(dir, "blank"));
        writeFileSync(join(dir, "blank", "config.ts"), "");

        expect(discoverPresets(dir)).toEqual(["blank", "v5-to-v6"]);
    });

    it("ignores directories without config.ts", () => {
        mkdirSync(join(dir, "has-config"));
        writeFileSync(join(dir, "has-config", "config.ts"), "");
        mkdirSync(join(dir, "no-config"));
        writeFileSync(join(dir, "no-config", "readme.md"), "");

        expect(discoverPresets(dir)).toEqual(["has-config"]);
    });

    it("ignores files at root level", () => {
        writeFileSync(join(dir, "stray-file.ts"), "");
        mkdirSync(join(dir, "valid"));
        writeFileSync(join(dir, "valid", "config.ts"), "");

        expect(discoverPresets(dir)).toEqual(["valid"]);
    });

    it("returns empty array for empty directory", () => {
        expect(discoverPresets(dir)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/init/steps/discoverPresets.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export function discoverPresets(projectsDir: string): string[] {
    if (!existsSync(projectsDir)) {
        return [];
    }

    return readdirSync(projectsDir)
        .filter(name => {
            const full = join(projectsDir, name);
            return statSync(full).isDirectory() && existsSync(join(full, "config.ts"));
        })
        .sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/init/steps/discoverPresets.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/init/steps/discoverPresets.ts __tests__/commands/init/steps/discoverPresets.test.ts
git commit -m "feat: add preset discovery for init command"
```

### Task 3: Write package manager detection

**Files:**
- Create: `src/commands/init/steps/detectPackageManager.ts`
- Create: `__tests__/commands/init/steps/detectPackageManager.test.ts`

**Interfaces:**
- Produces: `detectPackageManager(): PackageManager` — reads `npm_config_user_agent` env var, returns detected manager or `"npm"` as fallback

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { detectPackageManager } from "~/commands/init/steps/detectPackageManager.ts";

describe("detectPackageManager", () => {
    const original = process.env["npm_config_user_agent"];

    afterEach(() => {
        if (original === undefined) {
            delete process.env["npm_config_user_agent"];
        } else {
            process.env["npm_config_user_agent"] = original;
        }
    });

    it("detects yarn", () => {
        process.env["npm_config_user_agent"] = "yarn/4.17.1 npm/? node/v24.0.0";
        expect(detectPackageManager()).toBe("yarn");
    });

    it("detects npm", () => {
        process.env["npm_config_user_agent"] = "npm/10.0.0 node/v24.0.0";
        expect(detectPackageManager()).toBe("npm");
    });

    it("detects pnpm", () => {
        process.env["npm_config_user_agent"] = "pnpm/9.0.0 npm/? node/v24.0.0";
        expect(detectPackageManager()).toBe("pnpm");
    });

    it("defaults to npm when env var is missing", () => {
        delete process.env["npm_config_user_agent"];
        expect(detectPackageManager()).toBe("npm");
    });

    it("defaults to npm for unknown agents", () => {
        process.env["npm_config_user_agent"] = "bun/1.0.0";
        expect(detectPackageManager()).toBe("npm");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/init/steps/detectPackageManager.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
import type { PackageManager } from "../types.ts";

export function detectPackageManager(): PackageManager {
    const agent = process.env["npm_config_user_agent"] ?? "";

    if (agent.startsWith("yarn")) {
        return "yarn";
    }
    if (agent.startsWith("pnpm")) {
        return "pnpm";
    }
    return "npm";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/init/steps/detectPackageManager.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/init/steps/detectPackageManager.ts __tests__/commands/init/steps/detectPackageManager.test.ts
git commit -m "feat: add package manager detection for init command"
```

### Task 4: Write promptOptions step

**Files:**
- Create: `src/commands/init/steps/promptOptions.ts`
- Create: `__tests__/commands/init/steps/promptOptions.test.ts`

**Interfaces:**
- Consumes: `discoverPresets(projectsDir)` from Task 2, `detectPackageManager()` from Task 3, `InitOptions` and `PackageManager` from Task 1
- Produces: `promptOptions(args: { projectName: string; preset?: string; pm?: string; projectsDir: string }): Promise<InitOptions>`

- [ ] **Step 1: Write tests for validation (non-interactive paths)**

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promptOptions } from "~/commands/init/steps/promptOptions.ts";

describe("promptOptions", () => {
    let dir: string;

    function setupPresets(...names: string[]) {
        dir = mkdtempSync(join(tmpdir(), "prompt-"));
        for (const name of names) {
            mkdirSync(join(dir, name));
            writeFileSync(join(dir, name, "config.ts"), "");
        }
        return dir;
    }

    afterEach(() => {
        if (dir) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("returns options directly when all flags provided", async () => {
        const projectsDir = setupPresets("v5-to-v6", "blank");
        const result = await promptOptions({
            projectName: "my-project",
            preset: "v5-to-v6",
            pm: "yarn",
            projectsDir
        });
        expect(result).toEqual({
            projectName: "my-project",
            preset: "v5-to-v6",
            packageManager: "yarn"
        });
    });

    it("throws for invalid preset", async () => {
        const projectsDir = setupPresets("v5-to-v6");
        await expect(
            promptOptions({ projectName: "x", preset: "nope", pm: "npm", projectsDir })
        ).rejects.toThrow(/nope.*available.*v5-to-v6/i);
    });

    it("throws for invalid package manager", async () => {
        const projectsDir = setupPresets("v5-to-v6");
        await expect(
            promptOptions({ projectName: "x", preset: "v5-to-v6", pm: "bun", projectsDir })
        ).rejects.toThrow(/bun.*yarn.*npm.*pnpm/i);
    });

    it("throws when no presets found", async () => {
        const projectsDir = setupPresets();
        await expect(
            promptOptions({ projectName: "x", projectsDir })
        ).rejects.toThrow(/no presets/i);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/init/steps/promptOptions.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
import { select } from "@inquirer/prompts";
import { discoverPresets } from "./discoverPresets.ts";
import { detectPackageManager } from "./detectPackageManager.ts";
import type { InitOptions, PackageManager } from "../types.ts";

const VALID_PMS: PackageManager[] = ["yarn", "npm", "pnpm"];

interface PromptArgs {
    projectName: string;
    preset?: string;
    pm?: string;
    projectsDir: string;
}

export async function promptOptions(args: PromptArgs): Promise<InitOptions> {
    const presets = discoverPresets(args.projectsDir);

    if (presets.length === 0) {
        throw new Error(
            "No presets found. The @webiny/data-transfer package may be corrupted — reinstall it."
        );
    }

    const preset = args.preset ?? await promptPreset(presets);
    const packageManager = args.pm
        ? validatePackageManager(args.pm)
        : await promptPackageManager();

    return { projectName: args.projectName, preset, packageManager };
}

function validatePreset(name: string, available: string[]): string {
    if (!available.includes(name)) {
        throw new Error(
            `Unknown preset "${name}". Available presets: ${available.join(", ")}`
        );
    }
    return name;
}

function validatePackageManager(pm: string): PackageManager {
    if (!VALID_PMS.includes(pm as PackageManager)) {
        throw new Error(
            `Unknown package manager "${pm}". Valid options: ${VALID_PMS.join(", ")}`
        );
    }
    return pm as PackageManager;
}

async function promptPreset(presets: string[]): Promise<string> {
    return select({
        message: "Select a preset:",
        choices: presets.map(name => ({ name, value: name }))
    });
}

async function promptPackageManager(): Promise<PackageManager> {
    const detected = detectPackageManager();
    return select({
        message: "Package manager:",
        default: detected,
        choices: VALID_PMS.map(pm => ({ name: pm, value: pm }))
    });
}
```

Note: the `promptPreset` function needs to call `validatePreset` when a CLI flag is passed. Fix the `preset` assignment line in `promptOptions`:

```typescript
    const preset = args.preset
        ? validatePreset(args.preset, presets)
        : await promptPreset(presets);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/init/steps/promptOptions.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run full typecheck**

Run: `yarn ts-check`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/commands/init/types.ts src/commands/init/steps/promptOptions.ts src/commands/init/steps/discoverPresets.ts src/commands/init/steps/detectPackageManager.ts __tests__/commands/init/steps/
git commit -m "feat: add interactive prompt options for init command"
```
