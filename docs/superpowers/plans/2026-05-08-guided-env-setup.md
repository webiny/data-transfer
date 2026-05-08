# Guided .env Setup — TransferWizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive `TransferWizard` that runs when `yarn transfer` is invoked without `--config`, guiding the user through project selection, `.env` population from Webiny output or Pulumi state JSON files, and config selection.

**Architecture:** `--config` becomes optional in `register.ts`. When absent, `TransferWizard.run()` orchestrates project discovery, JSON extraction, Zod validation, `.env` writing from a `{{TOKEN}}`-based template, and config discovery. Each concern lives in its own focused file. The wizard always exits after writing `.env`; only when no JSON files are present does it proceed to config selection and run the transfer.

**Tech Stack:** TypeScript ESM, Vitest, Zod v4, `@inquirer/prompts`, Node.js `fs/promises`

---

## File map

**Create:**
```
src/commands/run/wizard/
├── types.ts                        RawOutputValues + EnvValues interfaces
├── TransferWizard.ts               Orchestrator — owns the full interactive flow
├── projectDiscovery.ts             Scans projects/ subdirectories
├── configDiscovery.ts              Scans *.config.ts, imports, reads storage field
├── envWriter.ts                    {{TOKEN}} substitution + .env file writer
├── sources/
│   ├── WebinyOutputSource.ts       Extracts RawOutputValues from *.webiny.json
│   └── PulumiStateSource.ts        Extracts RawOutputValues from *.pulumi.json
└── schemas/
    ├── webinyOutput.schema.ts      Zod schema for the outputs object (both formats share this)
    └── pulumiState.schema.ts       Zod schema for the Pulumi state file wrapper

__tests__/commands/run/wizard/
├── schemas/
│   ├── webinyOutput.schema.test.ts
│   └── pulumiState.schema.test.ts
├── sources/
│   ├── WebinyOutputSource.test.ts
│   └── PulumiStateSource.test.ts
├── envWriter.test.ts
├── projectDiscovery.test.ts
└── configDiscovery.test.ts

__tests__/fixtures/wizard/
├── source.webiny.json              Valid webiny output (elasticsearch prefix)
├── target.webiny.json              Valid webiny output (opensearch prefix)
├── source.pulumi.json              Valid Pulumi state (elasticsearch prefix)
├── target.pulumi.json              Valid Pulumi state (opensearch prefix)
├── conflicting.webiny.json         Same shape, different region value
├── ddb.config.ts                   Minimal fixture config { storage: "ddb" }
└── os.config.ts                    Minimal fixture config { storage: "os" }
```

**Modify:**
```
src/commands/run/register.ts                    demandOption: false; call wizard when no --config
templates/projects/example/.env.example         Replace values with {{TOKEN}} syntax
templates/internal-project/.env.example         Replace values with {{TOKEN}} syntax
```

---

## Task 1: Install @inquirer/prompts and add fixture JSON files

**Files:**
- Modify: `package.json`
- Create: `__tests__/fixtures/wizard/source.webiny.json`
- Create: `__tests__/fixtures/wizard/target.webiny.json`
- Create: `__tests__/fixtures/wizard/source.pulumi.json`
- Create: `__tests__/fixtures/wizard/target.pulumi.json`
- Create: `__tests__/fixtures/wizard/conflicting.webiny.json`

- [ ] **Step 1: Install @inquirer/prompts**

```bash
yarn add @inquirer/prompts
```

Expected: `@inquirer/prompts` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Create source.webiny.json fixture**

Create `__tests__/fixtures/wizard/source.webiny.json`:

```json
{
  "cognitoAppClientId": "aaa",
  "deploymentId": "111",
  "region": "eu-central-1",
  "primaryDynamodbTableName": "wby-source-primary",
  "fileManagerBucketId": "wby-source-bucket",
  "elasticsearchDynamodbTableName": "wby-source-es",
  "elasticsearchDomainEndpoint": "search-source.eu-central-1.es.amazonaws.com"
}
```

- [ ] **Step 3: Create target.webiny.json fixture**

Create `__tests__/fixtures/wizard/target.webiny.json`:

```json
{
  "cognitoAppClientId": "bbb",
  "deploymentId": "222",
  "region": "us-east-1",
  "primaryDynamodbTableName": "wby-target-primary",
  "fileManagerBucketId": "wby-target-bucket",
  "opensearchDynamodbTableName": "wby-target-os",
  "opensearchDomainEndpoint": "search-target.us-east-1.es.amazonaws.com"
}
```

- [ ] **Step 4: Create source.pulumi.json fixture**

Create `__tests__/fixtures/wizard/source.pulumi.json`:

```json
{
  "version": 3,
  "checkpoint": {
    "stack": "organization/core/dev",
    "latest": {
      "manifest": { "time": "2026-01-01T00:00:00Z", "magic": "abc", "version": "v3.0.0" },
      "resources": [
        {
          "urn": "urn:pulumi:dev::core::pulumi:pulumi:Stack::core-dev",
          "custom": false,
          "type": "pulumi:pulumi:Stack",
          "outputs": {
            "region": "eu-central-1",
            "primaryDynamodbTableName": "wby-source-primary",
            "fileManagerBucketId": "wby-source-bucket",
            "elasticsearchDynamodbTableName": "wby-source-es",
            "elasticsearchDomainEndpoint": "search-source.eu-central-1.es.amazonaws.com"
          }
        }
      ]
    }
  }
}
```

- [ ] **Step 5: Create target.pulumi.json fixture**

Create `__tests__/fixtures/wizard/target.pulumi.json`:

```json
{
  "version": 3,
  "checkpoint": {
    "stack": "organization/core/prod",
    "latest": {
      "manifest": { "time": "2026-01-01T00:00:00Z", "magic": "def", "version": "v3.0.0" },
      "resources": [
        {
          "urn": "urn:pulumi:dev::core::pulumi:pulumi:Stack::core-dev",
          "custom": false,
          "type": "pulumi:pulumi:Stack",
          "outputs": {
            "region": "us-east-1",
            "primaryDynamodbTableName": "wby-target-primary",
            "fileManagerBucketId": "wby-target-bucket",
            "opensearchDynamodbTableName": "wby-target-os",
            "opensearchDomainEndpoint": "search-target.us-east-1.es.amazonaws.com"
          }
        }
      ]
    }
  }
}
```

- [ ] **Step 6: Create conflicting.webiny.json fixture**

Create `__tests__/fixtures/wizard/conflicting.webiny.json`:

```json
{
  "region": "ap-southeast-1",
  "primaryDynamodbTableName": "wby-source-primary",
  "fileManagerBucketId": "wby-source-bucket"
}
```

- [ ] **Step 7: Create fixture config files**

Create `__tests__/fixtures/wizard/ddb.config.ts`:
```typescript
export default { storage: "ddb" as const };
```

Create `__tests__/fixtures/wizard/os.config.ts`:
```typescript
export default { storage: "os" as const };
```

- [ ] **Step 8: Commit**

```bash
git add package.json yarn.lock __tests__/fixtures/wizard/
git commit -m "chore: add @inquirer/prompts and wizard test fixtures"
```

---

## Task 2: types.ts — shared interfaces

**Files:**
- Create: `src/commands/run/wizard/types.ts`

- [ ] **Step 1: Create types.ts**

Create `src/commands/run/wizard/types.ts`:

```typescript
export interface RawOutputValues {
    region: string;
    primaryDynamodbTableName: string;
    fileManagerBucketId: string;
    osTableName: string;
    osEndpoint: string;
}

export interface EnvValues {
    sourceRegion: string;
    sourceDdbTable: string;
    sourceS3Bucket: string;
    sourceOsTable: string;
    targetRegion: string;
    targetDdbTable: string;
    targetS3Bucket: string;
    targetOsTable: string;
    targetOsEndpoint: string;
    targetOsIndexPrefix: string;
    segments: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/run/wizard/types.ts
git commit -m "feat: add wizard types (RawOutputValues, EnvValues)"
```

---

## Task 3: webinyOutput.schema.ts + tests

**Files:**
- Create: `src/commands/run/wizard/schemas/webinyOutput.schema.ts`
- Create: `__tests__/commands/run/wizard/schemas/webinyOutput.schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/commands/run/wizard/schemas/webinyOutput.schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
    webinyOutputSchema,
    normalizeOutputs
} from "../../../../src/commands/run/wizard/schemas/webinyOutput.schema.ts";

describe("webinyOutputSchema", () => {
    it("accepts a valid output with elasticsearch prefix", () => {
        const result = webinyOutputSchema.safeParse({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            elasticsearchDynamodbTableName: "wby-es",
            elasticsearchDomainEndpoint: "search-xxx.eu-central-1.es.amazonaws.com"
        });
        expect(result.success).toBe(true);
    });

    it("accepts a valid output with opensearch prefix", () => {
        const result = webinyOutputSchema.safeParse({
            region: "us-east-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            opensearchDynamodbTableName: "wby-os",
            opensearchDomainEndpoint: "search-xxx.us-east-1.es.amazonaws.com"
        });
        expect(result.success).toBe(true);
    });

    it("accepts a DDB-only output (no OS fields)", () => {
        const result = webinyOutputSchema.safeParse({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket"
        });
        expect(result.success).toBe(true);
    });

    it("rejects output missing region", () => {
        const result = webinyOutputSchema.safeParse({
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket"
        });
        expect(result.success).toBe(false);
    });

    it("rejects output missing primaryDynamodbTableName", () => {
        const result = webinyOutputSchema.safeParse({
            region: "eu-central-1",
            fileManagerBucketId: "wby-bucket"
        });
        expect(result.success).toBe(false);
    });

    it("ignores unknown fields (passthrough)", () => {
        const result = webinyOutputSchema.safeParse({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            cognitoAppClientId: "abc123",
            deploymentId: "xyz"
        });
        expect(result.success).toBe(true);
    });
});

describe("normalizeOutputs", () => {
    it("prefers opensearch prefix over elasticsearch when both present", () => {
        const result = normalizeOutputs({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            opensearchDynamodbTableName: "wby-os",
            opensearchDomainEndpoint: "search-os.eu-central-1.es.amazonaws.com",
            elasticsearchDynamodbTableName: "wby-es",
            elasticsearchDomainEndpoint: "search-es.eu-central-1.es.amazonaws.com"
        });
        expect(result.osTableName).toBe("wby-os");
        expect(result.osEndpoint).toBe("search-os.eu-central-1.es.amazonaws.com");
    });

    it("falls back to elasticsearch prefix when opensearch absent", () => {
        const result = normalizeOutputs({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            elasticsearchDynamodbTableName: "wby-es",
            elasticsearchDomainEndpoint: "search-es.eu-central-1.es.amazonaws.com"
        });
        expect(result.osTableName).toBe("wby-es");
        expect(result.osEndpoint).toBe("search-es.eu-central-1.es.amazonaws.com");
    });

    it("returns empty strings for OS fields when neither prefix present", () => {
        const result = normalizeOutputs({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket"
        });
        expect(result.osTableName).toBe("");
        expect(result.osEndpoint).toBe("");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test __tests__/commands/run/wizard/schemas/webinyOutput.schema.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement webinyOutput.schema.ts**

Create `src/commands/run/wizard/schemas/webinyOutput.schema.ts`:

```typescript
import { z } from "zod";
import type { RawOutputValues } from "../types.ts";

export const webinyOutputSchema = z
    .object({
        region: z.string(),
        primaryDynamodbTableName: z.string(),
        fileManagerBucketId: z.string(),
        opensearchDynamodbTableName: z.string().optional(),
        elasticsearchDynamodbTableName: z.string().optional(),
        opensearchDomainEndpoint: z.string().optional(),
        elasticsearchDomainEndpoint: z.string().optional()
    })
    .passthrough();

export type WebinyOutputs = z.infer<typeof webinyOutputSchema>;

export function normalizeOutputs(outputs: WebinyOutputs): RawOutputValues {
    return {
        region: outputs.region,
        primaryDynamodbTableName: outputs.primaryDynamodbTableName,
        fileManagerBucketId: outputs.fileManagerBucketId,
        osTableName:
            outputs.opensearchDynamodbTableName ?? outputs.elasticsearchDynamodbTableName ?? "",
        osEndpoint:
            outputs.opensearchDomainEndpoint ?? outputs.elasticsearchDomainEndpoint ?? ""
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test __tests__/commands/run/wizard/schemas/webinyOutput.schema.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/run/wizard/schemas/webinyOutput.schema.ts __tests__/commands/run/wizard/schemas/webinyOutput.schema.test.ts
git commit -m "feat: add webinyOutput Zod schema with normalizeOutputs"
```

---

## Task 4: pulumiState.schema.ts + tests

**Files:**
- Create: `src/commands/run/wizard/schemas/pulumiState.schema.ts`
- Create: `__tests__/commands/run/wizard/schemas/pulumiState.schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/commands/run/wizard/schemas/pulumiState.schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
    pulumiStateSchema,
    extractStackOutputs
} from "../../../../src/commands/run/wizard/schemas/pulumiState.schema.ts";

const VALID_STATE = {
    version: 3,
    checkpoint: {
        stack: "organization/core/dev",
        latest: {
            manifest: { time: "2026-01-01T00:00:00Z", magic: "abc", version: "v3.0.0" },
            resources: [
                {
                    urn: "urn:pulumi:dev::core::pulumi:pulumi:Stack::core-dev",
                    custom: false,
                    type: "pulumi:pulumi:Stack",
                    outputs: {
                        region: "eu-central-1",
                        primaryDynamodbTableName: "wby-primary",
                        fileManagerBucketId: "wby-bucket"
                    }
                }
            ]
        }
    }
};

describe("pulumiStateSchema", () => {
    it("accepts a valid Pulumi state file", () => {
        expect(pulumiStateSchema.safeParse(VALID_STATE).success).toBe(true);
    });

    it("rejects a state file with wrong version", () => {
        expect(pulumiStateSchema.safeParse({ ...VALID_STATE, version: 2 }).success).toBe(false);
    });

    it("rejects a state file missing checkpoint", () => {
        const { checkpoint: _c, ...rest } = VALID_STATE;
        expect(pulumiStateSchema.safeParse(rest).success).toBe(false);
    });
});

describe("extractStackOutputs", () => {
    it("returns outputs from the pulumi:pulumi:Stack resource", () => {
        const outputs = extractStackOutputs(VALID_STATE);
        expect(outputs).toEqual({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket"
        });
    });

    it("throws when no Stack resource is found", () => {
        const state = {
            ...VALID_STATE,
            checkpoint: {
                ...VALID_STATE.checkpoint,
                latest: {
                    ...VALID_STATE.checkpoint.latest,
                    resources: [{ type: "aws:s3:Bucket", outputs: {} }]
                }
            }
        };
        expect(() => extractStackOutputs(state)).toThrow(/pulumi:pulumi:Stack/);
    });

    it("throws when the Stack resource has no outputs", () => {
        const state = {
            ...VALID_STATE,
            checkpoint: {
                ...VALID_STATE.checkpoint,
                latest: {
                    ...VALID_STATE.checkpoint.latest,
                    resources: [
                        { type: "pulumi:pulumi:Stack", outputs: undefined }
                    ]
                }
            }
        };
        expect(() => extractStackOutputs(state)).toThrow(/outputs/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test __tests__/commands/run/wizard/schemas/pulumiState.schema.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pulumiState.schema.ts**

Create `src/commands/run/wizard/schemas/pulumiState.schema.ts`:

```typescript
import { z } from "zod";

const resourceSchema = z.object({
    type: z.string(),
    outputs: z.record(z.unknown()).optional()
});

export const pulumiStateSchema = z.object({
    version: z.literal(3),
    checkpoint: z.object({
        latest: z.object({
            resources: z.array(resourceSchema)
        })
    })
});

export type PulumiState = z.infer<typeof pulumiStateSchema>;

export function extractStackOutputs(state: PulumiState): Record<string, unknown> {
    const stackResource = state.checkpoint.latest.resources.find(
        r => r.type === "pulumi:pulumi:Stack"
    );
    if (!stackResource) {
        throw new Error(
            "No pulumi:pulumi:Stack resource found in state file. Is this a valid Pulumi state?"
        );
    }
    if (!stackResource.outputs) {
        throw new Error("Stack resource has no outputs. The state file may be incomplete.");
    }
    return stackResource.outputs as Record<string, unknown>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test __tests__/commands/run/wizard/schemas/pulumiState.schema.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/run/wizard/schemas/pulumiState.schema.ts __tests__/commands/run/wizard/schemas/pulumiState.schema.test.ts
git commit -m "feat: add pulumiState Zod schema with extractStackOutputs"
```

---

## Task 5: WebinyOutputSource.ts + tests

**Files:**
- Create: `src/commands/run/wizard/sources/WebinyOutputSource.ts`
- Create: `__tests__/commands/run/wizard/sources/WebinyOutputSource.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/commands/run/wizard/sources/WebinyOutputSource.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { extractFromWebinyOutput } from "../../../../src/commands/run/wizard/sources/WebinyOutputSource.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/wizard");

describe("extractFromWebinyOutput", () => {
    it("extracts required fields from a valid webiny output file", async () => {
        const result = await extractFromWebinyOutput(join(FIXTURES, "source.webiny.json"));
        expect(result.region).toBe("eu-central-1");
        expect(result.primaryDynamodbTableName).toBe("wby-source-primary");
        expect(result.fileManagerBucketId).toBe("wby-source-bucket");
    });

    it("normalizes elasticsearch prefix to osTableName and osEndpoint", async () => {
        const result = await extractFromWebinyOutput(join(FIXTURES, "source.webiny.json"));
        expect(result.osTableName).toBe("wby-source-es");
        expect(result.osEndpoint).toBe("search-source.eu-central-1.es.amazonaws.com");
    });

    it("normalizes opensearch prefix to osTableName and osEndpoint", async () => {
        const result = await extractFromWebinyOutput(join(FIXTURES, "target.webiny.json"));
        expect(result.osTableName).toBe("wby-target-os");
        expect(result.osEndpoint).toBe("search-target.us-east-1.es.amazonaws.com");
    });

    it("throws a descriptive error when file does not exist", async () => {
        await expect(
            extractFromWebinyOutput(join(FIXTURES, "nonexistent.webiny.json"))
        ).rejects.toThrow(/nonexistent.webiny.json/);
    });

    it("throws when JSON is invalid", async () => {
        const { writeFile, unlink } = await import("node:fs/promises");
        const path = join(FIXTURES, "_bad.webiny.json");
        await writeFile(path, "not json");
        try {
            await expect(extractFromWebinyOutput(path)).rejects.toThrow();
        } finally {
            await unlink(path);
        }
    });

    it("throws a Zod error when required fields are missing", async () => {
        const { writeFile, unlink } = await import("node:fs/promises");
        const path = join(FIXTURES, "_missing.webiny.json");
        await writeFile(path, JSON.stringify({ region: "eu-central-1" }));
        try {
            await expect(extractFromWebinyOutput(path)).rejects.toThrow(/primaryDynamodbTableName/);
        } finally {
            await unlink(path);
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test __tests__/commands/run/wizard/sources/WebinyOutputSource.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement WebinyOutputSource.ts**

Create `src/commands/run/wizard/sources/WebinyOutputSource.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { webinyOutputSchema, normalizeOutputs } from "../schemas/webinyOutput.schema.ts";
import type { RawOutputValues } from "../types.ts";

export async function extractFromWebinyOutput(filePath: string): Promise<RawOutputValues> {
    let raw: string;
    try {
        raw = await readFile(filePath, "utf8");
    } catch (err) {
        throw new Error(
            `Cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`${filePath} is not valid JSON.`);
    }

    const result = webinyOutputSchema.safeParse(parsed);
    if (!result.success) {
        const first = result.error.issues[0];
        throw new Error(
            `${filePath} is missing required field: ${first.path.join(".")} — ${first.message}`
        );
    }

    return normalizeOutputs(result.data);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test __tests__/commands/run/wizard/sources/WebinyOutputSource.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/run/wizard/sources/WebinyOutputSource.ts __tests__/commands/run/wizard/sources/WebinyOutputSource.test.ts
git commit -m "feat: add WebinyOutputSource"
```

---

## Task 6: PulumiStateSource.ts + tests

**Files:**
- Create: `src/commands/run/wizard/sources/PulumiStateSource.ts`
- Create: `__tests__/commands/run/wizard/sources/PulumiStateSource.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/commands/run/wizard/sources/PulumiStateSource.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { extractFromPulumiState } from "../../../../src/commands/run/wizard/sources/PulumiStateSource.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/wizard");

describe("extractFromPulumiState", () => {
    it("extracts required fields from a valid Pulumi state file", async () => {
        const result = await extractFromPulumiState(join(FIXTURES, "source.pulumi.json"));
        expect(result.region).toBe("eu-central-1");
        expect(result.primaryDynamodbTableName).toBe("wby-source-primary");
        expect(result.fileManagerBucketId).toBe("wby-source-bucket");
    });

    it("normalizes elasticsearch prefix from pulumi state outputs", async () => {
        const result = await extractFromPulumiState(join(FIXTURES, "source.pulumi.json"));
        expect(result.osTableName).toBe("wby-source-es");
        expect(result.osEndpoint).toBe("search-source.eu-central-1.es.amazonaws.com");
    });

    it("normalizes opensearch prefix from pulumi state outputs", async () => {
        const result = await extractFromPulumiState(join(FIXTURES, "target.pulumi.json"));
        expect(result.osTableName).toBe("wby-target-os");
        expect(result.osEndpoint).toBe("search-target.us-east-1.es.amazonaws.com");
    });

    it("throws when file does not exist", async () => {
        await expect(
            extractFromPulumiState(join(FIXTURES, "nonexistent.pulumi.json"))
        ).rejects.toThrow(/nonexistent.pulumi.json/);
    });

    it("throws when the state file has wrong version", async () => {
        const { writeFile, unlink } = await import("node:fs/promises");
        const path = join(FIXTURES, "_bad.pulumi.json");
        await writeFile(path, JSON.stringify({ version: 2, checkpoint: {} }));
        try {
            await expect(extractFromPulumiState(path)).rejects.toThrow(/version/);
        } finally {
            await unlink(path);
        }
    });

    it("throws when no Stack resource is found", async () => {
        const { writeFile, unlink } = await import("node:fs/promises");
        const path = join(FIXTURES, "_nostack.pulumi.json");
        const state = {
            version: 3,
            checkpoint: {
                latest: {
                    resources: [{ type: "aws:s3:Bucket", outputs: {} }]
                }
            }
        };
        await writeFile(path, JSON.stringify(state));
        try {
            await expect(extractFromPulumiState(path)).rejects.toThrow(/pulumi:pulumi:Stack/);
        } finally {
            await unlink(path);
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test __tests__/commands/run/wizard/sources/PulumiStateSource.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement PulumiStateSource.ts**

Create `src/commands/run/wizard/sources/PulumiStateSource.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { pulumiStateSchema, extractStackOutputs } from "../schemas/pulumiState.schema.ts";
import { webinyOutputSchema, normalizeOutputs } from "../schemas/webinyOutput.schema.ts";
import type { RawOutputValues } from "../types.ts";

export async function extractFromPulumiState(filePath: string): Promise<RawOutputValues> {
    let raw: string;
    try {
        raw = await readFile(filePath, "utf8");
    } catch (err) {
        throw new Error(
            `Cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`${filePath} is not valid JSON.`);
    }

    const stateResult = pulumiStateSchema.safeParse(parsed);
    if (!stateResult.success) {
        const first = stateResult.error.issues[0];
        throw new Error(
            `${filePath} is not a valid Pulumi state file: ${first.path.join(".")} — ${first.message}`
        );
    }

    const outputs = extractStackOutputs(stateResult.data);

    const outputResult = webinyOutputSchema.safeParse(outputs);
    if (!outputResult.success) {
        const first = outputResult.error.issues[0];
        throw new Error(
            `Stack outputs in ${filePath} are missing required field: ${first.path.join(".")} — ${first.message}`
        );
    }

    return normalizeOutputs(outputResult.data);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test __tests__/commands/run/wizard/sources/PulumiStateSource.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/run/wizard/sources/PulumiStateSource.ts __tests__/commands/run/wizard/sources/PulumiStateSource.test.ts
git commit -m "feat: add PulumiStateSource"
```

---

## Task 7: envWriter.ts + tests

**Files:**
- Create: `src/commands/run/wizard/envWriter.ts`
- Create: `__tests__/commands/run/wizard/envWriter.test.ts`
- Modify: `templates/projects/example/.env.example`
- Modify: `templates/internal-project/.env.example`

- [ ] **Step 1: Update templates with {{TOKEN}} syntax**

Replace `templates/projects/example/.env.example` with:

```
# Copy this file to `.env` next to it. `.env*` is gitignored.
#
# The configs accept AWS credentials in TWO shapes — pick one per account.
#
# A) Profile-based (default in the configs): set *_PROFILE and point at
#    ~/.aws/credentials. Leave blank to use the `default` profile.
# B) Literal credentials via env vars: uncomment the literal block in
#    the config file and fill in the *_AWS_ACCESS_KEY_ID /
#    *_AWS_SECRET_ACCESS_KEY vars below. *_AWS_SESSION_TOKEN is only
#    needed for temporary STS credentials.

# --- Source environment ------------------------------------------------
SOURCE_REGION={{SOURCE_REGION}}

# Option A: profile name (reads ~/.aws/credentials)
# SOURCE_PROFILE=my-source-profile

# Option B: literal credentials (uncomment + fill in)
# SOURCE_AWS_ACCESS_KEY_ID=
# SOURCE_AWS_SECRET_ACCESS_KEY=
# SOURCE_AWS_SESSION_TOKEN=

SOURCE_DDB_TABLE={{SOURCE_DDB_TABLE}}
SOURCE_S3_BUCKET={{SOURCE_S3_BUCKET}}
SOURCE_OS_TABLE={{SOURCE_OS_TABLE}}

# --- Target environment ------------------------------------------------
TARGET_REGION={{TARGET_REGION}}

# TARGET_PROFILE=my-target-profile

# TARGET_AWS_ACCESS_KEY_ID=
# TARGET_AWS_SECRET_ACCESS_KEY=
# TARGET_AWS_SESSION_TOKEN=

TARGET_DDB_TABLE={{TARGET_DDB_TABLE}}
TARGET_S3_BUCKET={{TARGET_S3_BUCKET}}
TARGET_OS_TABLE={{TARGET_OS_TABLE}}
TARGET_OS_ENDPOINT={{TARGET_OS_ENDPOINT}}
TARGET_OS_INDEX_PREFIX={{TARGET_OS_INDEX_PREFIX}}

# --- Tuning ------------------------------------------------------------------
# Number of parallel worker processes (DDB parallel-scan segments).
SEGMENTS={{SEGMENTS}}
```

Replace `templates/internal-project/.env.example` with the same content (removing the run command comment at the top, keeping the rest identical).

- [ ] **Step 2: Write the failing tests**

Create `__tests__/commands/run/wizard/envWriter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeEnv } from "../../../src/commands/run/wizard/envWriter.ts";
import type { EnvValues } from "../../../src/commands/run/wizard/types.ts";

const SAMPLE_VALUES: EnvValues = {
    sourceRegion: "eu-central-1",
    sourceDdbTable: "wby-source-primary",
    sourceS3Bucket: "wby-source-bucket",
    sourceOsTable: "wby-source-es",
    targetRegion: "us-east-1",
    targetDdbTable: "wby-target-primary",
    targetS3Bucket: "wby-target-bucket",
    targetOsTable: "wby-target-os",
    targetOsEndpoint: "search-target.us-east-1.es.amazonaws.com",
    targetOsIndexPrefix: "my-prefix",
    segments: 8
};

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "envwriter-test-"));
});

afterEach(async () => {
    await rm(tmpDir, { recursive: true });
});

describe("writeEnv", () => {
    it("writes .env with substituted token values from .env.example template", async () => {
        const template = "SOURCE_REGION={{SOURCE_REGION}}\nSEGMENTS={{SEGMENTS}}\n";
        await writeFile(join(tmpDir, ".env.example"), template);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
        expect(content).toContain("SEGMENTS=8");
    });

    it("replaces all known tokens", async () => {
        const template = [
            "SOURCE_REGION={{SOURCE_REGION}}",
            "SOURCE_DDB_TABLE={{SOURCE_DDB_TABLE}}",
            "SOURCE_S3_BUCKET={{SOURCE_S3_BUCKET}}",
            "SOURCE_OS_TABLE={{SOURCE_OS_TABLE}}",
            "TARGET_REGION={{TARGET_REGION}}",
            "TARGET_DDB_TABLE={{TARGET_DDB_TABLE}}",
            "TARGET_S3_BUCKET={{TARGET_S3_BUCKET}}",
            "TARGET_OS_TABLE={{TARGET_OS_TABLE}}",
            "TARGET_OS_ENDPOINT={{TARGET_OS_ENDPOINT}}",
            "TARGET_OS_INDEX_PREFIX={{TARGET_OS_INDEX_PREFIX}}",
            "SEGMENTS={{SEGMENTS}}"
        ].join("\n");
        await writeFile(join(tmpDir, ".env.example"), template);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
        expect(content).toContain("SOURCE_DDB_TABLE=wby-source-primary");
        expect(content).toContain("SOURCE_S3_BUCKET=wby-source-bucket");
        expect(content).toContain("SOURCE_OS_TABLE=wby-source-es");
        expect(content).toContain("TARGET_REGION=us-east-1");
        expect(content).toContain("TARGET_DDB_TABLE=wby-target-primary");
        expect(content).toContain("TARGET_S3_BUCKET=wby-target-bucket");
        expect(content).toContain("TARGET_OS_TABLE=wby-target-os");
        expect(content).toContain("TARGET_OS_ENDPOINT=search-target.us-east-1.es.amazonaws.com");
        expect(content).toContain("TARGET_OS_INDEX_PREFIX=my-prefix");
        expect(content).toContain("SEGMENTS=8");
    });

    it("uses built-in template when .env.example has no {{tokens}}", async () => {
        await writeFile(join(tmpDir, ".env.example"), "# no tokens here\n");

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
    });

    it("uses built-in template when .env.example is absent", async () => {
        await writeEnv(tmpDir, SAMPLE_VALUES);
        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("SOURCE_REGION=eu-central-1");
    });

    it("preserves comment lines untouched", async () => {
        const template = "# a comment\nSOURCE_REGION={{SOURCE_REGION}}\n";
        await writeFile(join(tmpDir, ".env.example"), template);

        await writeEnv(tmpDir, SAMPLE_VALUES);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("# a comment");
    });

    it("replaces empty-string values producing KEY= lines", async () => {
        const values: EnvValues = { ...SAMPLE_VALUES, targetOsIndexPrefix: "" };
        const template = "TARGET_OS_INDEX_PREFIX={{TARGET_OS_INDEX_PREFIX}}\n";
        await writeFile(join(tmpDir, ".env.example"), template);

        await writeEnv(tmpDir, values);

        const content = await readFile(join(tmpDir, ".env"), "utf8");
        expect(content).toContain("TARGET_OS_INDEX_PREFIX=");
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
yarn test __tests__/commands/run/wizard/envWriter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement envWriter.ts**

Create `src/commands/run/wizard/envWriter.ts`:

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnvValues } from "./types.ts";

const TOKEN_MAP: Record<string, keyof EnvValues> = {
    SOURCE_REGION: "sourceRegion",
    SOURCE_DDB_TABLE: "sourceDdbTable",
    SOURCE_S3_BUCKET: "sourceS3Bucket",
    SOURCE_OS_TABLE: "sourceOsTable",
    TARGET_REGION: "targetRegion",
    TARGET_DDB_TABLE: "targetDdbTable",
    TARGET_S3_BUCKET: "targetS3Bucket",
    TARGET_OS_TABLE: "targetOsTable",
    TARGET_OS_ENDPOINT: "targetOsEndpoint",
    TARGET_OS_INDEX_PREFIX: "targetOsIndexPrefix",
    SEGMENTS: "segments"
};

const BUILT_IN_TEMPLATE = `# Copy this file to \`.env\` next to it. \`.env*\` is gitignored.
#
# The configs accept AWS credentials in TWO shapes — pick one per account.
#
# A) Profile-based (default in the configs): set *_PROFILE and point at
#    ~/.aws/credentials. Leave blank to use the \`default\` profile.
# B) Literal credentials via env vars: uncomment the literal block in
#    the config file and fill in the *_AWS_ACCESS_KEY_ID /
#    *_AWS_SECRET_ACCESS_KEY vars below. *_AWS_SESSION_TOKEN is only
#    needed for temporary STS credentials.

# --- Source environment ------------------------------------------------
SOURCE_REGION={{SOURCE_REGION}}

# Option A: profile name (reads ~/.aws/credentials)
# SOURCE_PROFILE=my-source-profile

# Option B: literal credentials (uncomment + fill in)
# SOURCE_AWS_ACCESS_KEY_ID=
# SOURCE_AWS_SECRET_ACCESS_KEY=
# SOURCE_AWS_SESSION_TOKEN=

SOURCE_DDB_TABLE={{SOURCE_DDB_TABLE}}
SOURCE_S3_BUCKET={{SOURCE_S3_BUCKET}}
SOURCE_OS_TABLE={{SOURCE_OS_TABLE}}

# --- Target environment ------------------------------------------------
TARGET_REGION={{TARGET_REGION}}

# TARGET_PROFILE=my-target-profile

# TARGET_AWS_ACCESS_KEY_ID=
# TARGET_AWS_SECRET_ACCESS_KEY=
# TARGET_AWS_SESSION_TOKEN=

TARGET_DDB_TABLE={{TARGET_DDB_TABLE}}
TARGET_S3_BUCKET={{TARGET_S3_BUCKET}}
TARGET_OS_TABLE={{TARGET_OS_TABLE}}
TARGET_OS_ENDPOINT={{TARGET_OS_ENDPOINT}}
TARGET_OS_INDEX_PREFIX={{TARGET_OS_INDEX_PREFIX}}

# --- Tuning ------------------------------------------------------------------
# Number of parallel worker processes (DDB parallel-scan segments).
SEGMENTS={{SEGMENTS}}
`;

function substituteTokens(template: string, values: EnvValues): string {
    let result = template;
    for (const [token, key] of Object.entries(TOKEN_MAP)) {
        result = result.replaceAll(`{{${token}}}`, String(values[key]));
    }
    return result;
}

export async function writeEnv(projectDir: string, values: EnvValues): Promise<void> {
    let template = BUILT_IN_TEMPLATE;

    const examplePath = join(projectDir, ".env.example");
    try {
        const candidate = await readFile(examplePath, "utf8");
        if (candidate.includes("{{")) {
            template = candidate;
        }
    } catch {
        // no .env.example — use built-in
    }

    const content = substituteTokens(template, values);
    await writeFile(join(projectDir, ".env"), content, "utf8");
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
yarn test __tests__/commands/run/wizard/envWriter.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/run/wizard/envWriter.ts __tests__/commands/run/wizard/envWriter.test.ts templates/projects/example/.env.example templates/internal-project/.env.example
git commit -m "feat: add envWriter with {{TOKEN}} substitution; update .env.example templates"
```

---

## Task 8: projectDiscovery.ts + tests

**Files:**
- Create: `src/commands/run/wizard/projectDiscovery.ts`
- Create: `__tests__/commands/run/wizard/projectDiscovery.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/commands/run/wizard/projectDiscovery.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverProjects } from "../../../src/commands/run/wizard/projectDiscovery.ts";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "proj-discovery-"));
});

afterEach(async () => {
    await rm(root, { recursive: true });
});

describe("discoverProjects", () => {
    it("returns an empty array when projects/ does not exist", async () => {
        expect(await discoverProjects(root)).toEqual([]);
    });

    it("returns an empty array when projects/ has no subdirectories", async () => {
        await mkdir(join(root, "projects"));
        expect(await discoverProjects(root)).toEqual([]);
    });

    it("returns subdirectory names sorted alphabetically", async () => {
        await mkdir(join(root, "projects"));
        await mkdir(join(root, "projects", "prod"));
        await mkdir(join(root, "projects", "staging"));
        await mkdir(join(root, "projects", "dev"));
        expect(await discoverProjects(root)).toEqual(["dev", "prod", "staging"]);
    });

    it("does not include files, only directories", async () => {
        const { writeFile } = await import("node:fs/promises");
        await mkdir(join(root, "projects"));
        await mkdir(join(root, "projects", "prod"));
        await writeFile(join(root, "projects", "readme.md"), "");
        expect(await discoverProjects(root)).toEqual(["prod"]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test __tests__/commands/run/wizard/projectDiscovery.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement projectDiscovery.ts**

Create `src/commands/run/wizard/projectDiscovery.ts`:

```typescript
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function discoverProjects(cwd: string): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(join(cwd, "projects"), { withFileTypes: true });
    } catch {
        return [];
    }
    return entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test __tests__/commands/run/wizard/projectDiscovery.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/run/wizard/projectDiscovery.ts __tests__/commands/run/wizard/projectDiscovery.test.ts
git commit -m "feat: add projectDiscovery"
```

---

## Task 9: configDiscovery.ts + tests

**Files:**
- Create: `src/commands/run/wizard/configDiscovery.ts`
- Create: `__tests__/commands/run/wizard/configDiscovery.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/commands/run/wizard/configDiscovery.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { discoverConfigs } from "../../../src/commands/run/wizard/configDiscovery.ts";

const FIXTURES = join(import.meta.dirname, "../../fixtures/wizard");

describe("discoverConfigs", () => {
    it("returns labeled configs for each *.config.ts file that imports successfully", async () => {
        const configs = await discoverConfigs(FIXTURES);
        expect(configs.length).toBe(2);
        const labels = configs.map(c => c.label).sort();
        expect(labels).toEqual(["DynamoDB Transfer", "OpenSearch Transfer"]);
    });

    it("returns full resolved paths for each config", async () => {
        const configs = await discoverConfigs(FIXTURES);
        for (const c of configs) {
            expect(c.path).toMatch(/\.config\.ts$/);
        }
    });

    it("returns empty array when directory has no *.config.ts files", async () => {
        const { mkdtemp } = await import("node:fs/promises");
        const { tmpdir } = await import("node:os");
        const tmp = await mkdtemp(join(tmpdir(), "configdiscovery-"));
        try {
            expect(await discoverConfigs(tmp)).toEqual([]);
        } finally {
            const { rm } = await import("node:fs/promises");
            await rm(tmp, { recursive: true });
        }
    });

    it("skips a config file that throws on import (does not crash)", async () => {
        const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
        const { tmpdir } = await import("node:os");
        const tmp = await mkdtemp(join(tmpdir(), "configdiscovery-bad-"));
        await writeFile(join(tmp, "broken.config.ts"), "throw new Error('oops')");
        try {
            const configs = await discoverConfigs(tmp);
            expect(configs).toEqual([]);
        } finally {
            await rm(tmp, { recursive: true });
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test __tests__/commands/run/wizard/configDiscovery.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement configDiscovery.ts**

Create `src/commands/run/wizard/configDiscovery.ts`:

```typescript
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface ConfigEntry {
    path: string;
    label: string;
}

const STORAGE_LABELS: Record<string, string> = {
    ddb: "DynamoDB Transfer",
    os: "OpenSearch Transfer"
};

export async function discoverConfigs(projectDir: string): Promise<ConfigEntry[]> {
    let entries;
    try {
        entries = await readdir(projectDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const configFiles = entries
        .filter(e => e.isFile() && e.name.endsWith(".config.ts"))
        .map(e => resolve(join(projectDir, e.name)));

    const results: ConfigEntry[] = [];
    for (const filePath of configFiles) {
        try {
            const mod = await import(filePath);
            const config = mod.default as { storage?: string } | undefined;
            const storage = config?.storage ?? "";
            const label = STORAGE_LABELS[storage] ?? filePath.split("/").pop() ?? filePath;
            results.push({ path: filePath, label });
        } catch {
            console.warn(`Warning: could not import config ${filePath} — skipping.`);
        }
    }
    return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test __tests__/commands/run/wizard/configDiscovery.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/run/wizard/configDiscovery.ts __tests__/commands/run/wizard/configDiscovery.test.ts
git commit -m "feat: add configDiscovery"
```

---

## Task 10: TransferWizard.ts

**Files:**
- Create: `src/commands/run/wizard/TransferWizard.ts`

No unit tests for the orchestrator — it's covered by component tests in prior tasks. Manual smoke test is the verification step.

- [ ] **Step 1: Implement TransferWizard.ts**

Create `src/commands/run/wizard/TransferWizard.ts`:

```typescript
import { join, resolve } from "node:path";
import { access, stat } from "node:fs/promises";
import { select, input, confirm } from "@inquirer/prompts";
import { discoverProjects } from "./projectDiscovery.ts";
import { discoverConfigs } from "./configDiscovery.ts";
import { writeEnv } from "./envWriter.ts";
import { extractFromWebinyOutput } from "./sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "./sources/PulumiStateSource.ts";
import type { RawOutputValues, EnvValues } from "./types.ts";

interface SideFiles {
    webiny: string;
    pulumi: string;
}

async function fileNonEmpty(path: string): Promise<boolean> {
    try {
        const s = await stat(path);
        return s.size > 0;
    } catch {
        return false;
    }
}

async function resolveRawValues(
    projectDir: string,
    side: "source" | "target"
): Promise<RawOutputValues | null> {
    const webinyPath = join(projectDir, `${side}.webiny.json`);
    const pulumiPath = join(projectDir, `${side}.pulumi.json`);

    const hasWebiny = await fileNonEmpty(webinyPath);
    const hasPulumi = await fileNonEmpty(pulumiPath);

    if (!hasWebiny && !hasPulumi) {
        return null;
    }

    const webinyVals = hasWebiny ? await extractFromWebinyOutput(webinyPath) : null;
    const pulumiVals = hasPulumi ? await extractFromPulumiState(pulumiPath) : null;

    if (webinyVals && !pulumiVals) {
        return webinyVals;
    }
    if (pulumiVals && !webinyVals) {
        return pulumiVals;
    }

    // Both present — check for conflicts on required fields
    const conflicts: string[] = [];
    for (const key of ["region", "primaryDynamodbTableName", "fileManagerBucketId"] as const) {
        if (webinyVals![key] && pulumiVals![key] && webinyVals![key] !== pulumiVals![key]) {
            conflicts.push(`${key}: webiny="${webinyVals![key]}" pulumi="${pulumiVals![key]}"`);
        }
    }
    if (conflicts.length > 0) {
        throw new Error(
            `${side}.webiny.json and ${side}.pulumi.json disagree:\n  ${conflicts.join("\n  ")}\n\nRemove one file or reconcile the values.`
        );
    }

    // Consistent — prefer webiny, but fill in OS fields from pulumi if webiny lacks them
    return {
        region: webinyVals!.region,
        primaryDynamodbTableName: webinyVals!.primaryDynamodbTableName,
        fileManagerBucketId: webinyVals!.fileManagerBucketId,
        osTableName: webinyVals!.osTableName || pulumiVals!.osTableName,
        osEndpoint: webinyVals!.osEndpoint || pulumiVals!.osEndpoint
    };
}

function hasJsonFiles(files: SideFiles): boolean {
    return files.webiny !== "" || files.pulumi !== "";
}

function printInstructions(projectDir: string): void {
    const rel = projectDir.replace(process.cwd() + "/", "");
    console.log(`
To populate your .env, you need output from both your source and target Webiny systems.

Option A — Webiny CLI output (recommended):
  In your source system project:  yarn webiny output core --json > ${rel}/source.webiny.json
  In your target system project:  yarn webiny output core --json > ${rel}/target.webiny.json

Option B — Pulumi state file (use when you don't have Webiny CLI access):
  Copy the Pulumi state file from your source system to: ${rel}/source.pulumi.json
  Copy the Pulumi state file from your target system to: ${rel}/target.pulumi.json
  State files are at: .pulumi/apps/core/.pulumi/stacks/core/<env>.json

You can mix formats (e.g. source.webiny.json + target.pulumi.json).
`);
}

export class TransferWizard {
    private readonly cwd: string;

    public constructor(cwd: string) {
        this.cwd = cwd;
    }

    public async run(): Promise<string | null> {
        const projects = await discoverProjects(this.cwd);

        if (projects.length === 0) {
            console.error(
                "\nNo projects found. Run: yarn transfer init-project <name>\n"
            );
            process.exit(1);
        }

        const projectName =
            projects.length === 1
                ? projects[0]
                : await select({
                      message: "Which project do you want to transfer?",
                      choices: projects.map(p => ({ value: p, name: p }))
                  });

        const projectDir = resolve(join(this.cwd, "projects", projectName));

        // Initial resolution — detect the re-run case before entering the retry loop
        const sourceValsInitial = await resolveRawValues(projectDir, "source");
        const targetValsInitial = await resolveRawValues(projectDir, "target");

        const envExists = await fileNonEmpty(join(projectDir, ".env"));

        // Re-run case: no JSON files but .env already written → skip to config selection
        if (sourceValsInitial === null && targetValsInitial === null && envExists) {
            return await this.runConfigSelection(projectName);
        }

        // JSON extraction flow: retry until both sides resolve
        let sourceVals: RawOutputValues | null = sourceValsInitial;
        let targetVals: RawOutputValues | null = targetValsInitial;

        while (sourceVals === null || targetVals === null) {
            printInstructions(projectDir);
            await confirm({ message: "Press Enter when you have placed the files." });
            sourceVals = await resolveRawValues(projectDir, "source");
            targetVals = await resolveRawValues(projectDir, "target");
        }

        // Both sides resolved — prompt for wizard-only values
        const osPresent = !!(sourceVals.osTableName || targetVals.osTableName);

        const segmentsRaw = await input({
            message: "Number of parallel DDB scan segments (SEGMENTS):",
            default: "4",
            validate: v => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 1) {
                    return "Must be a positive integer.";
                }
                return true;
            }
        });

        let targetOsIndexPrefix = "";
        if (osPresent) {
            targetOsIndexPrefix = await input({
                message: "OpenSearch index prefix (TARGET_OS_INDEX_PREFIX, leave empty if none):",
                default: ""
            });
        }

        const envValues: EnvValues = {
            sourceRegion: sourceVals.region,
            sourceDdbTable: sourceVals.primaryDynamodbTableName,
            sourceS3Bucket: sourceVals.fileManagerBucketId,
            sourceOsTable: sourceVals.osTableName,
            targetRegion: targetVals.region,
            targetDdbTable: targetVals.primaryDynamodbTableName,
            targetS3Bucket: targetVals.fileManagerBucketId,
            targetOsTable: targetVals.osTableName,
            targetOsEndpoint: targetVals.osEndpoint,
            targetOsIndexPrefix,
            segments: Number(segmentsRaw)
        };

        // Warn if .env already exists
        try {
            await access(join(projectDir, ".env"));
            console.warn(
                "\n⚠  .env already exists and will be overwritten. Manual edits will be lost.\n"
            );
        } catch {
            // no existing .env — silent
        }

        await writeEnv(projectDir, envValues);

        console.log(
            `\n✓ .env written to projects/${projectName}/.env\n` +
                `  Review it and re-run: yarn transfer\n`
        );

        return null; // caller should exit 0
    }

    public async runConfigSelection(projectName: string): Promise<string> {
        const projectDir = resolve(join(this.cwd, "projects", projectName));
        const configs = await discoverConfigs(projectDir);

        if (configs.length === 0) {
            console.error(
                `\nNo transfer configs found in projects/${projectName}/.\n` +
                    `Add a ddb.transfer.config.ts or os.transfer.config.ts.\n`
            );
            process.exit(1);
        }

        if (configs.length === 1) {
            return configs[0].path;
        }

        return select({
            message: "Which transfer do you want to run?",
            choices: configs.map(c => ({ value: c.path, name: c.label }))
        });
    }
}
```

- [ ] **Step 2: Run full test suite to confirm no regressions**

```bash
yarn test
```

Expected: all existing tests PASS. No new failures.

- [ ] **Step 3: Commit**

```bash
git add src/commands/run/wizard/TransferWizard.ts
git commit -m "feat: add TransferWizard orchestrator"
```

---

## Task 11: Wire register.ts — make --config optional, call wizard

**Files:**
- Modify: `src/commands/run/register.ts`

- [ ] **Step 1: Update register.ts**

Read the current `src/commands/run/register.ts` to know what to preserve, then replace its full contents with:

```typescript
import type { Argv } from "yargs";
import { handler } from "./handler.ts";
import { parseSegmentsFilter } from "./segmentsFilter.ts";
import { TransferWizard } from "./wizard/TransferWizard.ts";
import { ExitPromptError } from "@inquirer/prompts";

export function registerRunCommand(yargs: Argv): Argv {
    return yargs.command(
        "$0",
        "Transfer Webiny data using a configuration file",
        yargs => {
            return yargs
                .option("config", {
                    type: "string",
                    demandOption: false,
                    description: "Path to configuration file"
                })
                .option("segments", {
                    type: "string",
                    description:
                        "Comma-separated list of segment indices to run (e.g. `1,3`). " +
                        "Use to re-run specific shards after a failure. Defaults to all."
                })
                .coerce("segments", parseSegmentsFilter)
                .option("log-level", {
                    type: "string",
                    choices: ["debug", "info", "warn", "error"] as const,
                    description: "Log level (default: info)"
                });
        },
        async argv => {
            if (argv.config) {
                await handler(argv.config, argv.segments, argv["log-level"] as string | undefined);
                return;
            }

            const wizard = new TransferWizard(process.cwd());
            try {
                const configPath = await wizard.run();
                if (configPath === null) {
                    process.exit(0);
                }
                await handler(
                    configPath,
                    argv.segments,
                    argv["log-level"] as string | undefined
                );
            } catch (err) {
                if (err instanceof ExitPromptError) {
                    process.exit(0);
                }
                throw err;
            }
        }
    );
}
```

- [ ] **Step 2: Run full test suite**

```bash
yarn test
```

Expected: all tests PASS.

- [ ] **Step 3: Run ts-check**

```bash
yarn ts-check
```

Expected: no TypeScript errors.

- [ ] **Step 4: Smoke test — no-config guided run (manual)**

```bash
# From the project root where projects/ exists:
yarn dev
```

Expected: wizard prompts for project selection.

- [ ] **Step 5: Commit**

```bash
git add src/commands/run/register.ts
git commit -m "feat: wire TransferWizard into run command; --config is now optional"
```
