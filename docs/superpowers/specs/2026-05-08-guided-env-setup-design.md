# Guided .env Setup — Design Spec

**Date:** 2026-05-08  
**Status:** Approved

---

## Overview

When users run `yarn transfer` without `--config`, a `TransferWizard` guides them through:

1. Selecting which project to transfer
2. Populating the project's `.env` from Webiny output or Pulumi state JSON files
3. Selecting which transfer config to run

This replaces the current "fill in `.env` manually" step with a structured, repeatable flow.

---

## Command contract change

`--config` becomes optional in `registerRunCommand` (`demandOption: false`).

- **With `--config`**: existing `handler.ts` runs as today — no change.
- **Without `--config`**: `TransferWizard.run()` is called. The wizard either exits (after writing `.env` or on abort) or returns a resolved config path, which `handler.ts` then runs normally.

---

## Wizard flow

```
yarn transfer (no --config)
│
├─ Discover projects/ subdirectories
│   └─ none → print error + "Run: yarn transfer init-project <name>" → exit 1
│
├─ 1 project → auto-select; 2+ → inquirer list prompt
│
├─ Check for JSON files in projects/{selected}/
│   ├─ source side: source.webiny.json (preferred) or source.pulumi.json
│   └─ target side: target.webiny.json (preferred) or target.pulumi.json
│   Mixed formats (e.g. source=webiny, target=pulumi) are allowed.
│
├─ If source OR target JSON missing:
│   └─ print instructions (see "User instructions" section below)
│       → "Press Enter when done" confirm prompt
│       → re-check files → loop on still-missing (Ctrl+C exits cleanly)
│
├─ Validate files with Zod
│   ├─ invalid → print Zod error path + message → confirm + re-check → loop
│   └─ both-present + conflicting values → throw with field-level diff
│
├─ Extract EnvValues from JSON files
├─ Prompt: SEGMENTS (default: 4)
├─ Prompt: TARGET_OS_INDEX_PREFIX (default: "")  [shown only if OS fields present]
├─ If .env already exists: warn ".env will be overwritten. Manual edits will be lost."
├─ Write projects/{selected}/.env from template
└─ Print: "✓ .env written. Review it and re-run: yarn transfer" → exit 0

─── On re-run (JSON files still present) ───────────────────────────────────────
Same flow above. JSON files are always re-extracted when present, so users can
update them between runs without any special flags.

─── On re-run (no JSON files, .env exists) ──────────────────────────────────────
├─ Scan projects/{selected}/*.config.ts
│   └─ none → print error + hint → exit 1
├─ Dynamically import each config, read `storage` field
│   ├─ import error on a config → warn + skip it (don't crash)
│   └─ "DynamoDB Transfer" (storage: "ddb") / "OpenSearch Transfer" (storage: "os")
├─ 1 config → auto-select; 2+ → inquirer list prompt
└─ Return resolved config path → handler.ts runs normally
```

---

## User instructions when JSON files are missing

```
To populate your .env, you need output from both your source and target Webiny systems.

Option A — Webiny CLI output (recommended):
  In your source system project: yarn webiny output core --json > source.webiny.json
  In your target system project: yarn webiny output core --json > target.webiny.json
  Place both files in: projects/{selected}/

Option B — Pulumi state file (use when you don't have Webiny CLI access):
  Copy the Pulumi state file from your source system to: projects/{selected}/source.pulumi.json
  Copy the Pulumi state file from your target system to: projects/{selected}/target.pulumi.json
  State files are at: .pulumi/apps/core/.pulumi/stacks/core/<env>.json

You can mix formats (e.g. source.webiny.json + target.pulumi.json).
```

---

## JSON file resolution and conflict rules

For each side (source / target):

| Files present | Result |
|---|---|
| Only `*.webiny.json` | Use it |
| Only `*.pulumi.json` | Use it |
| Both present, same values | Use webiny (preferred) |
| Both present, conflicting values | Throw with field-level diff message |
| Both present, one empty | Use the non-empty one |
| Both empty or both absent | Treat as missing → instructions loop |

"Empty" = file exists but contains no content or `null`.  
"Invalid" state does not exist — a file is either empty or structurally valid (enforced by Zod).  
"Conflicting" = a required field key (`region`, `primaryDynamodbTableName`, `fileManagerBucketId`) is present in both files with different non-empty values. OS fields that are only present in one file are not a conflict — the non-absent value is used.

---

## Field mapping

Fields extracted from JSON and written to `.env`:

| JSON key | `.env` var | Notes |
|---|---|---|
| `region` | `SOURCE_REGION` / `TARGET_REGION` | required |
| `primaryDynamodbTableName` | `SOURCE_DDB_TABLE` / `TARGET_DDB_TABLE` | required |
| `fileManagerBucketId` | `SOURCE_S3_BUCKET` / `TARGET_S3_BUCKET` | required |
| `opensearchDynamodbTableName` \|\| `elasticsearchDynamodbTableName` | `SOURCE_OS_TABLE` / `TARGET_OS_TABLE` | optional |
| `opensearchDomainEndpoint` \|\| `elasticsearchDomainEndpoint` | `TARGET_OS_ENDPOINT` | target only, optional |

`opensearch*` takes precedence over `elasticsearch*` when both are present (field-level, not file-level).

Fields **not** from JSON — handled separately:

| `.env` var | Source |
|---|---|
| `SEGMENTS` | Wizard prompt, default `4` |
| `TARGET_OS_INDEX_PREFIX` | Wizard prompt (shown if OS fields present), default `""` |
| `SOURCE_PROFILE`, `TARGET_PROFILE`, `*_AWS_ACCESS_KEY_ID`, etc. | Commented placeholders from template |

---

## .env template substitution

The wizard uses `projects/{selected}/.env.example` as the template. Template variables use `{{KEY}}` syntax. The writer does simple string replacement for each known `{{KEY}}` token. Unknown tokens are left untouched. Missing values replace with empty string.

Template variables to add to `.env.example`:

```
SOURCE_REGION={{SOURCE_REGION}}
SOURCE_DDB_TABLE={{SOURCE_DDB_TABLE}}
SOURCE_S3_BUCKET={{SOURCE_S3_BUCKET}}
SOURCE_OS_TABLE={{SOURCE_OS_TABLE}}
TARGET_REGION={{TARGET_REGION}}
TARGET_DDB_TABLE={{TARGET_DDB_TABLE}}
TARGET_S3_BUCKET={{TARGET_S3_BUCKET}}
TARGET_OS_TABLE={{TARGET_OS_TABLE}}
TARGET_OS_ENDPOINT={{TARGET_OS_ENDPOINT}}
TARGET_OS_INDEX_PREFIX={{TARGET_OS_INDEX_PREFIX}}
SEGMENTS={{SEGMENTS}}
```

---

## Zod schemas

### Webiny output schema (shared for webiny and pulumi formats)

Validates the outputs object (flat JSON):

```typescript
const webinyOutputSchema = z.object({
    region: z.string(),
    primaryDynamodbTableName: z.string(),
    fileManagerBucketId: z.string(),
    // OS fields — optional, either prefix
    opensearchDynamodbTableName: z.string().optional(),
    elasticsearchDynamodbTableName: z.string().optional(),
    opensearchDomainEndpoint: z.string().optional(),
    elasticsearchDomainEndpoint: z.string().optional(),
}).passthrough(); // ignore unknown fields
```

### Pulumi state schema

Validates the file wrapper; extracts the Stack resource outputs and passes them through `webinyOutputSchema`:

```typescript
const pulumiStateSchema = z.object({
    version: z.literal(3),
    checkpoint: z.object({
        latest: z.object({
            resources: z.array(z.object({
                type: z.string(),
                outputs: z.record(z.unknown()).optional(),
            }))
        })
    })
});
// Extractor finds the resource where type === "pulumi:pulumi:Stack"
// and validates its outputs with webinyOutputSchema.
```

---

## Internal file structure

```
src/commands/run/
├── register.ts              # --config becomes demandOption: false
├── handler.ts               # unchanged for --config path
└── wizard/
    ├── TransferWizard.ts    # Orchestrator — owns the full flow
    ├── projectDiscovery.ts  # Scans projects/, returns project names
    ├── configDiscovery.ts   # Scans *.config.ts, imports each, returns {path, label}[]
    ├── envWriter.ts         # Template substitution + writes .env
    ├── sources/
    │   ├── WebinyOutputSource.ts  # Reads source/target.webiny.json → EnvValues
    │   └── PulumiStateSource.ts   # Reads source/target.pulumi.json → EnvValues
    └── schemas/
        ├── webinyOutput.schema.ts  # Zod schema for outputs object
        └── pulumiState.schema.ts   # Zod schema for full state file wrapper
```

---

## EnvValues interface

```typescript
interface EnvValues {
    sourceRegion: string;
    sourceDdbTable: string;
    sourceS3Bucket: string;
    sourceOsTable: string;        // empty string if not in outputs
    targetRegion: string;
    targetDdbTable: string;
    targetS3Bucket: string;
    targetOsTable: string;        // empty string if not in outputs
    targetOsEndpoint: string;     // empty string if not in outputs
    targetOsIndexPrefix: string;  // from prompt
    segments: number;             // from prompt
}
```

---

## Edge cases

| Scenario | Behaviour |
|---|---|
| `projects/` empty | Exit 1: "No projects found. Run: yarn transfer init-project \<name\>" |
| No `*.config.ts` in project | Exit 1: "No transfer configs found. Add ddb.transfer.config.ts or os.transfer.config.ts." |
| Config import throws (syntax error) | Warn + skip that config; if all fail, exit 1 |
| Both JSON files present, conflicting | Throw: "source.webiny.json and source.pulumi.json disagree on: [field list]" |
| Ctrl+C at any prompt | Catch `ExitPromptError`, exit 0 cleanly (no stack trace) |
| `.env.example` missing | Fall back to built-in template string (same content) |
