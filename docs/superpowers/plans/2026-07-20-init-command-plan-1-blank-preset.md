# Plan 1: Create Blank Preset

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `blank` preset under `projects/` so users have a from-scratch starting point when scaffolding.

**Architecture:** Mirror the `v5-to-v6` preset structure but with a minimal config (no optional features) and a clean `.env.example`.

**Tech Stack:** TypeScript, `@webiny/data-transfer` config API

## Global Constraints

- Preset must contain `config.ts` (required for discovery) and `.env.example` (required for scaffold "next steps")
- `config.ts` uses `~/index.ts` import path alias (internal convention; scaffold transforms to `@webiny/data-transfer`)
- `.env.example` uses real placeholder values, not `{{TEMPLATE}}` markers (unlike `internal-project` template)

---

### Task 1: Create blank preset config.ts

**Files:**
- Create: `projects/blank/config.ts`

**Interfaces:**
- Consumes: `createConfig`, `fromAwsProfile`, `fromEnv`, `loadEnv`, `numberFromEnv` from `~/index.ts`
- Produces: default export of `MigrationConfig` — used by the CLI when this preset is selected

- [ ] **Step 1: Create the config file**

```typescript
import { createConfig, fromAwsProfile, fromEnv, loadEnv, numberFromEnv } from "~/index.ts";

loadEnv(import.meta.url);

export default createConfig({
    source: {
        region: fromEnv("SOURCE_REGION"),
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") }
    },
    target: {
        region: fromEnv("TARGET_REGION"),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", "default") }),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") }
    },
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4)
    }
});
```

- [ ] **Step 2: Verify it typechecks**

Run: `yarn ts-check`
Expected: no errors

### Task 2: Create blank preset .env.example

**Files:**
- Create: `projects/blank/.env.example`

- [ ] **Step 1: Create the env example**

```env
# Copy this file to `.env` next to it. `.env*` is gitignored.
#
# AWS credentials come from ~/.aws/credentials via `fromAwsProfile`.
# Set *_PROFILE to pick a specific profile, or leave as "default".

# --- Source environment ---
SOURCE_REGION=us-east-1
# SOURCE_PROFILE=default
SOURCE_DDB_TABLE=
SOURCE_S3_BUCKET=

# --- Target environment ---
TARGET_REGION=us-east-1
# TARGET_PROFILE=default
TARGET_DDB_TABLE=
TARGET_S3_BUCKET=

# --- Tuning ---
SEGMENTS=4
```

- [ ] **Step 2: Commit**

```bash
git add projects/blank/config.ts projects/blank/.env.example
git commit -m "feat: add blank preset for from-scratch project scaffolding"
```

### Task 3: Update .npmignore to ship projects/

**Files:**
- Modify: `.npmignore:28` — remove `/projects/` exclusion

- [ ] **Step 1: Remove the exclusion line**

In `.npmignore`, delete the line `/projects/` (line 28). This ensures preset directories ship with the npm package so the `init` command can discover them at runtime.

- [ ] **Step 2: Verify projects/ would be included**

Run: `npm pack --dry-run 2>&1 | grep projects/`
Expected: `projects/v5-to-v6/config.ts`, `projects/v5-to-v6/.env.example`, `projects/blank/config.ts`, `projects/blank/.env.example` all listed

- [ ] **Step 3: Commit**

```bash
git add .npmignore
git commit -m "fix: include projects/ in npm package for init preset discovery"
```
