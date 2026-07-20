# Plan 5: Wire Handler & Register

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `register.ts` and `handler.ts` to orchestrate the new init flow using all the steps from Plans 2-4.

**Architecture:** `register.ts` adds `--preset` and `--pm` options. `handler.ts` resolves directories, calls promptOptions → scaffold → installDeps → printNextSteps sequentially.

**Tech Stack:** yargs, all steps from prior plans

## Global Constraints

- Existing `init <folder>` command signature changes to `init <project-name>`
- Handler uses `import.meta.url` to locate package's `templates/` and `projects/` dirs (same pattern as current handler)
- Error handling: catch in handler, print error, exit 1

---

### Task 1: Rework register.ts

**Files:**
- Modify: `src/commands/init/register.ts`

**Interfaces:**
- Produces: yargs command with `<project-name>` positional, `--preset` and `--pm` options

- [ ] **Step 1: Rewrite register.ts**

```typescript
import type { Argv } from "yargs";
import { handler } from "./handler.ts";

export function registerInitCommand(yargs: Argv): Argv {
    return yargs.command(
        "init <project-name>",
        "Scaffold a new data transfer project",
        yargs => {
            return yargs
                .positional("project-name", {
                    type: "string",
                    demandOption: true,
                    description: "Name of the project directory to create"
                })
                .option("preset", {
                    type: "string",
                    description: "Preset to use (skip interactive prompt)"
                })
                .option("pm", {
                    type: "string",
                    choices: ["yarn", "npm", "pnpm"] as const,
                    description: "Package manager (skip interactive prompt)"
                });
        },
        async argv => {
            await handler({
                projectName: argv["project-name"] as string,
                preset: argv.preset as string | undefined,
                pm: argv.pm as string | undefined
            });
        }
    );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn ts-check`
Expected: may fail on handler signature mismatch (expected — handler rework is next step)

### Task 2: Rework handler.ts

**Files:**
- Modify: `src/commands/init/handler.ts`

**Interfaces:**
- Consumes: `promptOptions()` from Plan 2, `scaffold()` from Plan 3, `installDeps()` from Plan 4, `printNextSteps()` from Plan 4
- Produces: `handler(args: { projectName: string; preset?: string; pm?: string }): Promise<void>`

- [ ] **Step 1: Rewrite handler.ts**

```typescript
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promptOptions } from "./steps/promptOptions.ts";
import { scaffold } from "./steps/scaffold.ts";
import { installDeps } from "./steps/installDeps.ts";
import { printNextSteps } from "./steps/printNextSteps.ts";

interface HandlerArgs {
    projectName: string;
    preset?: string;
    pm?: string;
}

export async function handler(args: HandlerArgs): Promise<void> {
    const packageRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
    const templatesDir = resolve(packageRoot, "templates");
    const projectsDir = resolve(packageRoot, "projects");
    const targetDir = resolve(process.cwd(), args.projectName);

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
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn ts-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/init/register.ts src/commands/init/handler.ts
git commit -m "feat: rework init command with interactive prompts and scaffold pipeline"
```

### Task 3: Smoke test the full flow

**Files:** none (manual verification)

- [ ] **Step 1: Run init with all flags (non-interactive)**

Run from a temp directory:
```bash
cd /tmp
npx /Users/brunozoric/work/webiny/data-transfer init test-project --preset blank --pm npm
```

Expected:
- Directory `/tmp/test-project` created
- Contains: `config.ts`, `.env.example`, `package.json`, `tsconfig.json`, `.npmrc`, `.gitignore`, `AGENTS.md`, etc.
- `config.ts` imports from `@webiny/data-transfer` (not `~/index.ts`)
- `package.json` has correct project name and current package version
- `npm install` ran successfully
- "Next steps" printed with `npm run transfer`

- [ ] **Step 2: Verify config.ts content**

```bash
grep "from" /tmp/test-project/config.ts
```
Expected: `from "@webiny/data-transfer"` — no `~/index.ts`

- [ ] **Step 3: Verify package.json**

```bash
cat /tmp/test-project/package.json
```
Expected: name is "test-project", private true, has transfer script, @webiny/data-transfer dependency with caret version

- [ ] **Step 4: Verify security config**

```bash
cat /tmp/test-project/.npmrc
```
Expected: contains `audit-level=high` and `ignore-scripts=true`

- [ ] **Step 5: Clean up**

```bash
rm -rf /tmp/test-project
```

- [ ] **Step 6: Run all tests**

Run: `yarn test`
Expected: all tests pass (existing + new)

- [ ] **Step 7: Run typecheck**

Run: `yarn ts-check`
Expected: no errors

- [ ] **Step 8: Commit any fixes discovered during smoke test**

Only if needed. Otherwise skip.
