# Wizard: Create Project Inline

**Date:** 2026-05-10
**Status:** Approved

## Problem

Running `yarn dev` without `--config` launches `TransferWizard`. If no projects exist, the wizard exits with an error and tells the user to run `yarn transfer init-project <name>` manually. Even with projects present, a user who wants to start fresh must leave the wizard, run the init command, and re-run `yarn dev`. The guided experience is broken at this seam.

## Goal

Allow users to create a new project directly from the `yarn dev` wizard prompt, with the wizard continuing seamlessly into the env-setup flow for the new project.

## Design

### 1. `scaffoldProject` shared helper

New file: `src/commands/initProject/scaffoldProject.ts`

```ts
interface ScaffoldProjectParams {
    name: string;
    cwd: string;
}

async function scaffoldProject(params: ScaffoldProjectParams): Promise<void>
```

Pure async function — no DI, no console output. Steps:

1. Resolve `templates/internal-project/` relative to `import.meta.url`.
2. Throw `Error` if `projects/<name>/` already exists.
3. Copy template dir to `projects/<name>/`.
4. Substitute `{{PROJECT_NAME}}` in `.env.example` and `README.md`.

Uses plain Node `fs` calls (same operations `DirectoryTool`/`FileTool` wrap, but without the DI overhead — there's no reason to spin up a container for a file-copy).

`initProject/handler.ts` is updated to call `scaffoldProject({ name, cwd })` then print the success block it prints today. Behaviour is unchanged from the user's perspective.

### 2. Updated `TransferWizard`

**Project selection — always prompt:**

Remove the `projects.length === 1` auto-select shortcut. The select prompt always appears, giving the user an explicit choice even when one project exists.

**"Create new project" option appended to choices:**

```
[ existing-project-1, existing-project-2, ..., + Create new project ]
```

**When "Create new project" is selected:**

1. `input({ message: "Project name:", validate })` — validator rejects: empty string, names containing `/` or `\`, and names where `projects/<name>/` already exists.
2. Call `scaffoldProject({ name, cwd })`.
3. Print `✓ Created projects/<name>/` to confirm.
4. Continue wizard with `projectName = name` — identical to having selected an existing project.

**When 0 existing projects:**

The select prompt still appears with only the "Create new project" option. The `process.exit(1)` error path is removed.

## Files Changed

| File | Change |
|------|--------|
| `src/commands/initProject/scaffoldProject.ts` | New — shared scaffold helper |
| `src/commands/initProject/handler.ts` | Call `scaffoldProject()` instead of inline logic |
| `src/commands/run/wizard/TransferWizard.ts` | Always prompt; add create option; call `scaffoldProject()` |

## Out of Scope

- No changes to `projectDiscovery.ts`, `configDiscovery.ts`, `envWriter.ts`, or any source/schema files.
- No changes to the `init` command (standalone user projects).
- No new tests beyond what's already covered by the wizard's manual happy-path.
