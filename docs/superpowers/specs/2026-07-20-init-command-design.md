# Init Command Design

## Overview

Rework the existing `init` command in `@webiny/data-transfer` to scaffold a standalone migration project with interactive preset selection, package manager choice, security defaults, and automatic dependency installation. Users run `npx @webiny/data-transfer init <name>` and get a ready-to-use project.

### Relationship to Existing Commands

The codebase has two existing scaffold commands:

- **`init <folder>`** (`src/commands/init/`) — scaffolds an entire workspace by copying `templates/` (includes AGENTS.md, CLAUDE.md, skills, tsconfig, example project). This is the command being reworked.
- **`init-project <name>`** (`src/commands/initProject/`) — scaffolds a project subdirectory inside an existing workspace (`projects/<name>/` with config, .env, models/).

This design **replaces the current `init` behavior**. The current `init` copies the full `templates/` tree without prompting for preset or package manager. The new version adds interactive prompts, preset selection, package-manager-aware security config, and automatic dependency installation. The `init-project` command remains unchanged — it's for adding projects within an already-initialized workspace.

## CLI Interface

```
npx @webiny/data-transfer init <project-name> [--preset <name>] [--pm <yarn|npm|pnpm>]
```

- `project-name` — positional, required. Directory name and package name. (Replaces the current `<folder>` positional in the existing `init` command.)
- `--preset` — optional. Skips preset prompt. Must match a directory under `projects/` in the package.
- `--pm` — optional. Skips package manager prompt. Accepts `yarn`, `npm`, `pnpm`.

Interactive mode: if flags are omitted, wizard prompts for each.

Non-interactive mode: all flags provided, no prompts.

## Wizard Flow

1. Project name from positional arg (fail if directory exists).
2. Preset selection — scan the package's internal `projects/` subdirectories, present as choices.
3. Package manager — yarn / npm / pnpm. Detect current environment as default if possible.
4. Scaffold files.
5. Install dependencies.
6. Print next steps.

## Scaffolded Project Structure

The scaffolded project combines content from two sources:
- **Workspace skeleton** from `templates/` (AGENTS.md, CLAUDE.md, skills, tsconfig, .gitignore, example transformers/presets/features dirs)
- **Selected preset** from `projects/<preset>/` (config.ts, .env.example)

```
<project-name>/
├── config.ts              # from projects/<preset>/config.ts (import-transformed)
├── .env.example           # from projects/<preset>/.env.example
├── package.json           # generated programmatically
├── tsconfig.json          # from templates/
├── AGENTS.md              # from templates/
├── CLAUDE.md              # from templates/
├── README.md              # from templates/
├── .claude/skills/        # from templates/ (config + preset writing skills)
├── .gitignore             # from templates/ (extended with .env)
├── .yarnrc.yml            # yarn only: security config
├── .npmrc                 # npm/pnpm only: security config
├── projects/              # for init-project subcommand
│   └── example/           # from templates/projects/example/
├── transformers/          # from templates/ (example + .gitkeep)
├── presets/               # from templates/ (example + .gitkeep)
└── features/              # from templates/ (.gitkeep)
```

### package.json

Generated programmatically (replaces current `package.json.tpl` approach):

```json
{
  "name": "<project-name>",
  "private": true,
  "type": "module",
  "scripts": {
    "transfer": "webiny-data-transfer",
    "ts-check": "tsc --noEmit"
  },
  "dependencies": {
    "@webiny/data-transfer": "^<current-version>"
  },
  "devDependencies": {
    "typescript": "<read from package's own devDependencies at scaffold time>"
  }
}
```

Both `@webiny/data-transfer` version and `typescript` version are read from the package's own `package.json` at scaffold time (replacing the current hardcoded values in `package.json.tpl`).

### Security Config

**Yarn** (`.yarnrc.yml`):
```yaml
enableScripts: false
npmMinimalAgeGate: 3d
npmPreapprovedPackages:
  - "@webiny/*"
nodeLinker: node-modules
```

**npm / pnpm** (`.npmrc`):
```ini
audit-level=high
ignore-scripts=true
```

npm and pnpm share the `.npmrc` format.

## Template System

### Two Sources, One Scaffold

The scaffolder draws from two directories in the package:

1. **`templates/`** — workspace skeleton (AGENTS.md, skills, tsconfig, example dirs). Copied as-is, with two exceptions: `package.json.tpl` is deleted after copy (replaced by programmatic generation), and `templates/.env.example` is deleted after copy (replaced by the preset's version).
2. **`projects/<preset>/`** — all files in the preset directory. Copied to the project root with import transform on `.ts`/`.tsx` files. These overwrite any same-named files from `templates/`.

### Import Transform

Internal preset files under `projects/` use the `~/index.ts` path alias. Scaffolder replaces on copy:

```
from "~/index.ts"  ->  from "@webiny/data-transfer"
```

Single regex replacement applied to all `.ts` and `.tsx` files. No template engine dependency.

### Preset Discovery

Scaffolder reads the package's `projects/` directory at runtime, filters to subdirectories that contain a `config.ts`. Each becomes a preset choice. Adding a new preset = adding a new directory under `projects/` with at minimum a `config.ts`.

Currently only `v5-to-v6` exists. A `blank` preset (minimal config, no pipelines) must be created as a prerequisite before implementing the init command. It provides a from-scratch starting point for users not migrating from v5.

### Preset File Requirements

Every preset directory must contain:
- `config.ts` — required. Used for preset discovery and as the user's config entry point.
- `.env.example` — required. Lists environment variables the config expects. The scaffold's "next steps" message assumes this file exists.

Presets may contain additional files (e.g. `setup.ts`, `models/`). All files in the preset directory are copied to the project root. The import path transform is applied to all `.ts` and `.tsx` files.

## Implementation Structure

Reworks existing `src/commands/init/`:

```
src/commands/init/
├── register.ts          # rework: add --preset, --pm options
├── handler.ts           # rework: orchestrate new steps
├── steps/
│   ├── promptOptions.ts # new: interactive prompts (preset, pkg manager)
│   ├── scaffold.ts      # new: copy templates + preset, transform imports, generate package.json
│   ├── installDeps.ts   # new: run npm/yarn/pnpm install
│   └── printNextSteps.ts # new: context-aware success message
```

### register.ts

Rework existing registration. Rename positional from `<folder>` to `<project-name>` for consistency. Add `--preset` and `--pm` options.

### handler.ts

Replace current handler (which just copies `templates/` and substitutes `package.json.tpl`). New handler orchestrates steps sequentially: prompt -> scaffold -> install -> print.

### promptOptions.ts

- Locate package's `projects/` directory via `import.meta.url` (same pattern as current handler).
- Scan for available presets (directories containing `config.ts`).
- Use `@inquirer/prompts` (already a dependency) for interactive selection.
- Skip prompts for values provided via CLI flags.
- Detect current package manager from `npm_config_user_agent` environment variable as default choice.

### scaffold.ts

- Create target directory (fail if exists — preserves current behavior).
- Copy `templates/` tree to target (same as current handler).
- Delete `package.json.tpl` and `templates/.env.example` from copied tree.
- Copy all files from `projects/<preset>/` to target root with import path transform on `.ts`/`.tsx` files (overwrites any same-named files from templates).
- Generate `package.json` programmatically with current package version.
- Write package-manager-specific security config (`.yarnrc.yml` or `.npmrc`).

### installDeps.ts

- For yarn: run `corepack enable` first (warn on failure, continue).
- Run `<pm> install` via `execa` (already a dependency) in the target directory.
- On failure: print error, leave files in place, hint manual retry command.

### printNextSteps.ts

```
Project created at ./<project-name>

Next steps:
  cd <project-name>
  cp .env.example .env    # fill in your AWS config
  <pm-run> transfer       # run the migration
```

Where `<pm-run>` is `yarn` / `npm run` / `pnpm` depending on chosen package manager.

## Package Distribution

- No build step. tsx handles TypeScript at runtime.
- Existing `bin.js` entry point works for `npx` invocation.
- `exports` field stays as `"./src/index.ts"` — consumed only by tsx-bootstrapped projects.
- `engines.node >= 24.0.0` enforced.
- `.npmignore` needs update: remove `/projects/` from exclusion list (currently line 28) so preset source files ship with the package. Without this, preset discovery fails for users installing from npm.
- `templates/` already ships (not in `.npmignore` exclusion list).

## Error Handling

| Scenario | Behavior |
|---|---|
| Directory exists | Fail with message, no `--force` |
| No presets found | Fatal error (broken package install) |
| Install fails | Show error, leave files, print retry hint |
| Corepack unavailable | Warn, try `yarn install` directly |
| Can't create directory | Fail early with permissions message |
| Invalid `--preset` value | List available presets, exit |
| Invalid `--pm` value | List valid options (yarn/npm/pnpm), exit |

No retry logic. Fail fast, explain, let user fix.

## Out of Scope

- `--force` flag for overwriting existing directories.
- Git init in scaffolded project.
- CI/CD publish pipeline (separate concern).
- Version pinning strategy.
- Preset customization wizard (user edits files manually).
- Changes to `init-project` command.
