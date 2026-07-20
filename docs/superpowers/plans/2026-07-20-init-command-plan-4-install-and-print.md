# Plan 4: Install Deps & Print Next Steps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dependency installation step and the "next steps" printer.

**Architecture:** Two small modules: `installDeps` runs the chosen package manager in the scaffolded directory via `execa`, `printNextSteps` outputs context-aware instructions.

**Tech Stack:** `execa` (already a dependency), `@inquirer/prompts` formatting

## Global Constraints

- For yarn: attempt `corepack enable` first (warn on failure, don't abort)
- On install failure: print error, leave files intact, hint manual retry
- Print uses correct `pm run` syntax per manager (`yarn` vs `npm run` vs `pnpm`)

---

### Task 1: Write installDeps step

**Files:**
- Create: `src/commands/init/steps/installDeps.ts`
- Create: `__tests__/commands/init/steps/installDeps.test.ts`

**Interfaces:**
- Consumes: `PackageManager` from `../types.ts`
- Produces: `installDeps(targetDir: string, pm: PackageManager): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { installDeps } from "~/commands/init/steps/installDeps.ts";

vi.mock("execa", () => ({
    execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" })
}));

describe("installDeps", () => {
    const { execa } = await import("execa");
    const mockExeca = vi.mocked(execa);

    beforeEach(() => {
        mockExeca.mockClear();
        mockExeca.mockResolvedValue({ stdout: "", stderr: "" } as any);
    });

    it("runs npm install for npm", async () => {
        await installDeps("/tmp/test", "npm");
        expect(mockExeca).toHaveBeenCalledWith("npm", ["install"], { cwd: "/tmp/test", stdio: "inherit" });
    });

    it("runs pnpm install for pnpm", async () => {
        await installDeps("/tmp/test", "pnpm");
        expect(mockExeca).toHaveBeenCalledWith("pnpm", ["install"], { cwd: "/tmp/test", stdio: "inherit" });
    });

    it("attempts corepack enable then yarn install for yarn", async () => {
        await installDeps("/tmp/test", "yarn");
        expect(mockExeca).toHaveBeenCalledWith("corepack", ["enable"], { cwd: "/tmp/test", stdio: "inherit" });
        expect(mockExeca).toHaveBeenCalledWith("yarn", ["install"], { cwd: "/tmp/test", stdio: "inherit" });
    });

    it("continues yarn install even if corepack fails", async () => {
        mockExeca.mockImplementation(((cmd: string) => {
            if (cmd === "corepack") {
                return Promise.reject(new Error("corepack not found"));
            }
            return Promise.resolve({ stdout: "", stderr: "" });
        }) as any);

        await installDeps("/tmp/test", "yarn");
        expect(mockExeca).toHaveBeenCalledWith("yarn", ["install"], { cwd: "/tmp/test", stdio: "inherit" });
    });

    it("throws with hint on install failure", async () => {
        mockExeca.mockImplementation(((cmd: string) => {
            if (cmd === "npm") {
                return Promise.reject(new Error("network error"));
            }
            return Promise.resolve({ stdout: "", stderr: "" });
        }) as any);

        await expect(installDeps("/tmp/test", "npm")).rejects.toThrow(/npm install/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/init/steps/installDeps.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
import { execa } from "execa";
import type { PackageManager } from "../types.ts";

export async function installDeps(targetDir: string, pm: PackageManager): Promise<void> {
    if (pm === "yarn") {
        try {
            await execa("corepack", ["enable"], { cwd: targetDir, stdio: "inherit" });
        } catch {
            console.warn("Warning: corepack enable failed. Continuing with yarn install...");
        }
    }

    try {
        await execa(pm, ["install"], { cwd: targetDir, stdio: "inherit" });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Dependency installation failed: ${message}\n\n` +
            `You can retry manually:\n` +
            `  cd ${targetDir}\n` +
            `  ${pm} install\n`
        );
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/init/steps/installDeps.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/init/steps/installDeps.ts __tests__/commands/init/steps/installDeps.test.ts
git commit -m "feat: add dependency installation step for init command"
```

### Task 2: Write printNextSteps step

**Files:**
- Create: `src/commands/init/steps/printNextSteps.ts`
- Create: `__tests__/commands/init/steps/printNextSteps.test.ts`

**Interfaces:**
- Consumes: `InitOptions` from `../types.ts`
- Produces: `printNextSteps(options: InitOptions): void`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { printNextSteps } from "~/commands/init/steps/printNextSteps.ts";

describe("printNextSteps", () => {
    let output: string[];
    const originalLog = console.log;

    beforeEach(() => {
        output = [];
        console.log = (...args: unknown[]) => output.push(args.join(" "));
    });

    afterEach(() => {
        console.log = originalLog;
    });

    it("includes cd command with project name", () => {
        printNextSteps({ projectName: "my-migration", preset: "v5-to-v6", packageManager: "yarn" });
        const text = output.join("\n");
        expect(text).toContain("cd my-migration");
    });

    it("uses yarn for yarn projects", () => {
        printNextSteps({ projectName: "test", preset: "blank", packageManager: "yarn" });
        const text = output.join("\n");
        expect(text).toContain("yarn transfer");
        expect(text).not.toContain("npm run");
    });

    it("uses npm run for npm projects", () => {
        printNextSteps({ projectName: "test", preset: "blank", packageManager: "npm" });
        const text = output.join("\n");
        expect(text).toContain("npm run transfer");
    });

    it("uses pnpm for pnpm projects", () => {
        printNextSteps({ projectName: "test", preset: "blank", packageManager: "pnpm" });
        const text = output.join("\n");
        expect(text).toContain("pnpm transfer");
    });

    it("includes env copy instruction", () => {
        printNextSteps({ projectName: "test", preset: "blank", packageManager: "npm" });
        const text = output.join("\n");
        expect(text).toContain("cp .env.example .env");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/init/steps/printNextSteps.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
import type { InitOptions } from "../types.ts";

export function printNextSteps(options: InitOptions): void {
    const run = formatRunCommand(options.packageManager);

    console.log(`\nProject created at ./${options.projectName}\n`);
    console.log(`Next steps:\n`);
    console.log(`  cd ${options.projectName}`);
    console.log(`  cp .env.example .env    # fill in your AWS config`);
    console.log(`  ${run} transfer           # run the migration\n`);
}

function formatRunCommand(pm: string): string {
    switch (pm) {
        case "yarn":
            return "yarn";
        case "pnpm":
            return "pnpm";
        default:
            return "npm run";
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/init/steps/printNextSteps.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/init/steps/printNextSteps.ts __tests__/commands/init/steps/printNextSteps.test.ts
git commit -m "feat: add next steps printer for init command"
```
