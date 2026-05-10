# Wizard: Create Project Inline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to create a new project directly from the `yarn dev` wizard instead of exiting and running `init-project` manually.

**Architecture:** Extract the template-copy + token-substitution logic from `initProject/handler.ts` into a shared `scaffoldProject` helper, then update `TransferWizard` to always show a project-selection prompt that includes a "Create new project" option.

**Tech Stack:** Node.js `fs` (sync), `@inquirer/prompts` (`select`, `input`)

---

## File Map

| File | Action |
|------|--------|
| `src/commands/initProject/scaffoldProject.ts` | **Create** — shared scaffold helper, no DI, no output |
| `src/commands/initProject/handler.ts` | **Modify** — call `scaffoldProject()`, keep print block |
| `src/commands/run/wizard/TransferWizard.ts` | **Modify** — always prompt, add create option, remove exit |

---

## Task 1: Extract `scaffoldProject` helper

**Files:**
- Create: `src/commands/initProject/scaffoldProject.ts`
- Modify: `src/commands/initProject/handler.ts`

- [ ] **Step 1: Create `scaffoldProject.ts`**

Create `src/commands/initProject/scaffoldProject.ts` with this exact content:

```ts
import { existsSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, fileURLToPath } from "node:path";

interface ScaffoldProjectParams {
    name: string;
    cwd: string;
}

export async function scaffoldProject(params: ScaffoldProjectParams): Promise<void> {
    const { name, cwd } = params;
    const targetDir = resolve(cwd, "projects", name);

    if (existsSync(targetDir)) {
        throw new Error(`Project "projects/${name}" already exists.`);
    }

    const templatesDir = resolve(
        fileURLToPath(import.meta.url),
        "..",
        "..",
        "..",
        "..",
        "templates",
        "internal-project"
    );

    if (!existsSync(templatesDir)) {
        throw new Error(`Internal project templates not found at ${templatesDir}`);
    }

    cpSync(templatesDir, targetDir, { recursive: true });

    for (const filename of [".env.example", "README.md"]) {
        const filePath = join(targetDir, filename);
        const content = readFileSync(filePath, "utf-8");
        writeFileSync(filePath, content.replace(/\{\{PROJECT_NAME\}\}/g, name), "utf-8");
    }
}
```

- [ ] **Step 2: Update `handler.ts` to call `scaffoldProject`**

Replace `src/commands/initProject/handler.ts` with:

```ts
import { resolve } from "node:path";
import { scaffoldProject } from "./scaffoldProject.ts";

export async function handler(projectName: string): Promise<void> {
    await scaffoldProject({ name: projectName, cwd: resolve(process.cwd()) });

    console.log(`\nCreated "projects/${projectName}" with the following structure:\n`);
    console.log(`  projects/${projectName}/`);
    console.log(`  ├── README.md`);
    console.log(`  ├── ddb.transfer.config.ts`);
    console.log(`  ├── os.transfer.config.ts`);
    console.log(`  ├── .env.example`);
    console.log(`  ├── models/`);
    console.log(`  └── presets/\n`);
    console.log(`Note: projects/${projectName}/ is gitignored — credentials stay local.\n`);
    console.log(`Next steps (guided setup — recommended):\n`);
    console.log(`  1. Place one of these pairs in projects/${projectName}/:`);
    console.log(`       source.webiny.json + target.webiny.json`);
    console.log(`         (from: yarn webiny output core --json  in each Webiny project)`);
    console.log(`       source.pulumi.json + target.pulumi.json`);
    console.log(`         (from: .pulumi/apps/core/.pulumi/stacks/core/<env>.json)`);
    console.log(`     Mixed formats (e.g. source.webiny.json + target.pulumi.json) are allowed.\n`);
    console.log(`  2. Run the wizard — it validates the JSON files and writes .env:`);
    console.log(`       yarn dev\n`);
    console.log(`  3. Review projects/${projectName}/.env, then run again:`);
    console.log(`       yarn dev\n`);
    console.log(`To set up manually instead:`);
    console.log(`  cp projects/${projectName}/.env.example projects/${projectName}/.env`);
    console.log(`  # Edit .env — fill in region, table names, and AWS credentials`);
    console.log(`  yarn dev --config=./projects/${projectName}/ddb.transfer.config.ts\n`);
}
```

Note: `handler.ts` no longer needs `Container`, `LoggerFeature`, `DirectoryToolFeature`, `FileToolFeature`, `DirectoryTool`, `FileTool` — remove those imports entirely.

- [ ] **Step 3: Run checks**

```bash
yarn ts-check && yarn test
```

Expected: 0 type errors, all tests green.

- [ ] **Step 4: Commit**

```bash
git add src/commands/initProject/scaffoldProject.ts src/commands/initProject/handler.ts
git commit -m "refactor: extract scaffoldProject helper from initProject handler"
```

---

## Task 2: Update `TransferWizard` — always prompt, add create option

**Files:**
- Modify: `src/commands/run/wizard/TransferWizard.ts`

- [ ] **Step 1: Update imports in `TransferWizard.ts`**

Add `existsSync` from `node:fs` to the existing import block. Also add `scaffoldProject` import. The top of the file should read:

```ts
import { join, relative, resolve } from "node:path";
import { access, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { select, input } from "@inquirer/prompts";
import { discoverProjects } from "./projectDiscovery.ts";
import { discoverConfigs } from "./configDiscovery.ts";
import { writeEnv } from "./envWriter.ts";
import { extractFromWebinyOutput } from "./sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "./sources/PulumiStateSource.ts";
import { scaffoldProject } from "~/commands/initProject/scaffoldProject.ts";
import type { RawOutputValues, EnvValues } from "./types.ts";
```

- [ ] **Step 2: Add `CREATE_NEW` sentinel constant**

Add this line immediately before the `TransferWizard` class declaration:

```ts
const CREATE_NEW = "__create__";
```

- [ ] **Step 3: Replace project-selection block in `run()`**

Find and replace the entire block from `if (projects.length === 0)` through the closing of the `projectName` assignment (lines 101–113 in the original file):

```ts
// OLD — remove this entire block:
if (projects.length === 0) {
    console.error("\nNo projects found. Run: yarn transfer init-project <name>\n");
    process.exit(1);
}

const projectName =
    projects.length === 1
        ? projects[0]
        : await select({
              message: "Which project do you want to transfer?",
              choices: projects.map(p => ({ value: p, name: p }))
          });
```

Replace with:

```ts
const selected = await select({
    message: "Which project do you want to transfer?",
    choices: [
        ...projects.map(p => ({ value: p, name: p })),
        { value: CREATE_NEW, name: "+ Create new project" }
    ]
});

let projectName: string;
if (selected === CREATE_NEW) {
    const newName = await input({
        message: "Project name:",
        validate: (v: string) => {
            if (!v.trim()) {
                return "Name cannot be empty.";
            }
            if (/[/\\]/.test(v)) {
                return "Name cannot contain path separators.";
            }
            if (existsSync(resolve(join(this.cwd, "projects", v)))) {
                return `Project "projects/${v}" already exists.`;
            }
            return true;
        }
    });
    await scaffoldProject({ name: newName, cwd: this.cwd });
    console.log(`\n✓ Created projects/${newName}/\n`);
    projectName = newName;
} else {
    projectName = selected;
}
```

- [ ] **Step 4: Run checks**

```bash
yarn ts-check && yarn test
```

Expected: 0 type errors, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/commands/run/wizard/TransferWizard.ts
git commit -m "feat: wizard can create a new project inline"
```
