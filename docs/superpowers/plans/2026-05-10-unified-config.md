# Unified Config — One Config Per Project

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `createDdbConfig` + `createOsConfig` with a single `createConfig`, remove the `storage` discriminator and `preset` from the config schema, and route all preset selection through `TransferWizard`.

**Architecture:** Single Zod schema (`unified.schema.ts`) with required DDB+S3 fields and optional opensearch (both-or-neither cross-field rule). Bootstrap always registers all processors; only OpenSearch client is conditional on `config.target.opensearch != null`. `TransferWizard` gains a new preset-selection step and returns `{ configPath, preset }` to the run handler. Worker processes receive the preset name via a new `--preset` CLI argument.

**Tech Stack:** Zod v3, `@inquirer/prompts`, `@webiny/di`, Vitest, Node.js 22, TypeScript path alias `~/*` = `src/`

---

## File Map

**Create:**
- `src/features/MigrationConfig/schemas/unified.schema.ts` — single Zod schema for all configs
- `src/features/MigrationConfig/createConfig.ts` — `createConfig(input)` builder
- `src/commands/run/wizard/presetDiscovery.ts` — `listAvailablePresets(presetsDir?)` for the wizard
- `templates/internal-project/config.ts` — new unified project template

**Modify:**
- `src/features/MigrationConfig/schemas/shared.schema.ts` — remove `preset` from `pipelineSettingsSchema`
- `src/features/MigrationConfig/validation.ts` — single `MigrationConfiguration` type (no discriminated union)
- `src/features/MigrationConfig/loadConfig.ts` — drop storage guard, remove preset path resolution
- `src/features/MigrationConfig/index.ts` — update exports
- `src/bootstrap.ts` — always register S3 + all processors; OS features conditional on `config.target.opensearch`
- `src/commands/run/handler.ts` — accept `presetName`, pass `--preset` to workers, fix `logConfig`
- `src/commands/run/register.ts` — handle `WizardResult | null` from wizard
- `src/commands/run/wizard/TransferWizard.ts` — add preset-selection step; return `WizardResult | null`
- `src/commands/run/wizard/configDiscovery.ts` — simplify: look for `config.ts` only
- `src/commands/run/wizard/types.ts` — add `WizardResult` interface
- `src/commands/processSegment/register.ts` — add `--preset` option (required)
- `src/commands/processSegment/handler.ts` — use `argv.preset` instead of `config.pipeline.preset`
- `src/features/OsScanner/OsScanner.ts` — `storage !== "os"` → `!config.source.opensearch`
- `src/features/OsProcessor/OsProcessor.ts` — `storage !== "os"` → `!config.target.opensearch`
- `src/features/DdbProcessor/DdbProcessor.ts` — remove `storage !== "ddb"` guard
- `src/features/S3Processor/S3Processor.ts` — remove `storage !== "ddb"` guard
- `src/features/DdbScanner/DdbScanner.ts` — remove `storage !== "ddb"` guard
- `src/features/AuditLogProcessor/AuditLogProcessor.ts` — remove `storage === "ddb"` checks
- `src/index.ts` — export `createConfig`; remove `createDdbConfig`, `createOsConfig`, old type exports
- `projects/v5-to-v6/config.ts` — finalize with `createConfig` (sketch already exists)
- `__tests__/containers/ddb.ts` — remove `storage`, remove `preset`
- `__tests__/containers/os.ts` — remove `storage`, remove `preset`, add required `dynamodb`/`s3` to target
- `__tests__/integration/integrationContainer.ts` — remove `storage`, remove `preset`
- `__tests__/bootstrap.test.ts` — rewrite
- `__tests__/features/MigrationConfig/createConfig.test.ts` — rewrite
- `__tests__/features/MigrationConfig/MigrationConfig.test.ts` — rewrite (loadConfig tests)
- `__tests__/commands/run/wizard/TransferWizard.test.ts` — update for preset step
- `__tests__/commands/run/wizard/configDiscovery.test.ts` — rewrite for `config.ts`-only discovery
- `__tests__/commands/processSegment.test.ts` — add `preset` to args, fix mock config
- `__tests__/fixtures/wizard/ddb.config.ts` — replace content (becomes a unified config fixture)

**Delete:**
- `src/features/MigrationConfig/createDdbConfig.ts`
- `src/features/MigrationConfig/createOsConfig.ts`
- `src/features/MigrationConfig/schemas/ddb.schema.ts`
- `src/features/MigrationConfig/schemas/os.schema.ts`
- `templates/internal-project/ddb.transfer.config.ts`
- `templates/internal-project/os.transfer.config.ts`
- `__tests__/fixtures/wizard/os.config.ts`

---

## Task 1: Unified schema + `createConfig` + test containers

This is the foundation. After this task `MigrationConfig.Interface` no longer has `storage` or `pipeline.preset`. All downstream compilation errors are expected until later tasks fix them.

**Files:**
- Create: `src/features/MigrationConfig/schemas/unified.schema.ts`
- Create: `src/features/MigrationConfig/createConfig.ts`
- Modify: `src/features/MigrationConfig/schemas/shared.schema.ts`
- Modify: `src/features/MigrationConfig/validation.ts`
- Modify: `src/features/MigrationConfig/index.ts`
- Modify: `__tests__/containers/ddb.ts`
- Modify: `__tests__/containers/os.ts`
- Modify: `__tests__/integration/integrationContainer.ts`
- Rewrite: `__tests__/features/MigrationConfig/createConfig.test.ts`
- Delete: `src/features/MigrationConfig/schemas/ddb.schema.ts`
- Delete: `src/features/MigrationConfig/schemas/os.schema.ts`
- Delete: `src/features/MigrationConfig/createDdbConfig.ts`
- Delete: `src/features/MigrationConfig/createOsConfig.ts`

- [ ] **Step 1: Write the failing tests for `createConfig`**

Replace `__tests__/features/MigrationConfig/createConfig.test.ts` entirely:

```typescript
import { describe, it, expect } from "vitest";
import { createConfig } from "../../../src/features/MigrationConfig/createConfig.ts";

const creds = { accessKeyId: "AKIA", secretAccessKey: "secret" };

const baseSource = {
    region: "us-east-1",
    credentials: creds,
    dynamodb: { tableName: "src-table" },
    s3: { bucket: "src-bucket" }
};

const baseTarget = {
    region: "eu-central-1",
    credentials: creds,
    dynamodb: { tableName: "tgt-table" },
    s3: { bucket: "tgt-bucket" }
};

describe("createConfig — happy path", () => {
    it("returns a config with required fields, no storage field", () => {
        const config = createConfig({ source: baseSource, target: baseTarget, pipeline: {} });
        expect(config.source.dynamodb.tableName).toBe("src-table");
        expect(config.target.s3.bucket).toBe("tgt-bucket");
        expect((config as any).storage).toBeUndefined();
        expect((config as any).pipeline?.preset).toBeUndefined();
    });

    it("accepts optional opensearch on both sides", () => {
        const config = createConfig({
            source: { ...baseSource, opensearch: { tableName: "src-os" } },
            target: {
                ...baseTarget,
                opensearch: {
                    endpoint: "https://search-x.es.amazonaws.com",
                    tableName: "tgt-os",
                    service: "opensearch",
                    indexPrefix: ""
                }
            },
            pipeline: {}
        });
        expect(config.source.opensearch?.tableName).toBe("src-os");
        expect(config.target.opensearch?.endpoint).toBe("https://search-x.es.amazonaws.com");
    });

    it("accepts opensearch-serverless service", () => {
        const config = createConfig({
            source: { ...baseSource, opensearch: { tableName: "src-os" } },
            target: {
                ...baseTarget,
                opensearch: {
                    endpoint: "https://xxx.aoss.amazonaws.com",
                    tableName: "tgt-os",
                    service: "opensearch-serverless",
                    indexPrefix: ""
                }
            },
            pipeline: {}
        });
        expect(config.target.opensearch?.service).toBe("opensearch-serverless");
    });

    it("accepts optional auditLog", () => {
        const config = createConfig({
            source: baseSource,
            target: { ...baseTarget, auditLog: { dynamodb: { tableName: "audit-table" } } },
            pipeline: {}
        });
        expect(config.target.auditLog?.dynamodb?.tableName).toBe("audit-table");
    });

    it("accepts nullable auditLog (null = skip)", () => {
        const config = createConfig({
            source: baseSource,
            target: { ...baseTarget, auditLog: null },
            pipeline: {}
        });
        expect(config.target.auditLog).toBeNull();
    });

    it("trims whitespace from string fields", () => {
        const config = createConfig({
            source: { ...baseSource, region: "  us-east-1  ", dynamodb: { tableName: "  src  " }, s3: { bucket: "  src-b  " } },
            target: { ...baseTarget, region: " eu-central-1 " },
            pipeline: {}
        });
        expect(config.source.region).toBe("us-east-1");
        expect(config.source.dynamodb.tableName).toBe("src");
        expect(config.source.s3.bucket).toBe("src-b");
        expect(config.target.region).toBe("eu-central-1");
    });

    it("accepts optional segments / modelsDir / presetsDir in pipeline", () => {
        const config = createConfig({
            source: baseSource,
            target: baseTarget,
            pipeline: { segments: 8, modelsDir: "./models", presetsDir: "./presets" }
        });
        expect(config.pipeline?.segments).toBe(8);
        expect(config.pipeline?.modelsDir).toBe("./models");
    });
});

describe("createConfig — validation errors", () => {
    it("throws on missing source region", () => {
        expect(() =>
            createConfig({ source: { ...baseSource, region: "" } as any, target: baseTarget, pipeline: {} })
        ).toThrow();
    });

    it("throws on whitespace-only table name", () => {
        expect(() =>
            createConfig({
                source: { ...baseSource, dynamodb: { tableName: "   " } },
                target: baseTarget,
                pipeline: {}
            })
        ).toThrow();
    });

    it("throws on missing credentials", () => {
        expect(() =>
            createConfig({ source: { ...baseSource, credentials: undefined as any }, target: baseTarget, pipeline: {} })
        ).toThrow();
    });

    it("throws when only source.opensearch is set (target must match)", () => {
        expect(() =>
            createConfig({
                source: { ...baseSource, opensearch: { tableName: "src-os" } },
                target: baseTarget,
                pipeline: {}
            })
        ).toThrow(/both be set or both be absent/);
    });

    it("throws when only target.opensearch is set", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: {
                    ...baseTarget,
                    opensearch: {
                        endpoint: "https://es.example.com",
                        tableName: "tgt-os",
                        service: "opensearch",
                        indexPrefix: ""
                    }
                },
                pipeline: {}
            })
        ).toThrow(/both be set or both be absent/);
    });

    it("throws on same S3 bucket for source and target", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: { ...baseTarget, s3: { bucket: baseSource.s3.bucket } },
                pipeline: {}
            })
        ).toThrow(/same as source/);
    });

    it("throws on same region + same DDB table", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: { ...baseTarget, region: baseSource.region, dynamodb: { tableName: baseSource.dynamodb.tableName } },
                pipeline: {}
            })
        ).toThrow(/matches source/);
    });

    it("accepts same DDB table across different regions", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: { ...baseTarget, dynamodb: { tableName: baseSource.dynamodb.tableName } },
                pipeline: {}
            })
        ).not.toThrow();
    });

    it("throws on same region + same OS table when opensearch present", () => {
        expect(() =>
            createConfig({
                source: { ...baseSource, opensearch: { tableName: "same-os" } },
                target: {
                    ...baseTarget,
                    region: baseSource.region,
                    opensearch: {
                        endpoint: "https://es.example.com",
                        tableName: "same-os",
                        service: "opensearch",
                        indexPrefix: ""
                    }
                },
                pipeline: {}
            })
        ).toThrow(/matches source/);
    });

    it("throws on auditLog table matching main target table", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: {
                    ...baseTarget,
                    auditLog: { dynamodb: { tableName: baseTarget.dynamodb.tableName } }
                },
                pipeline: {}
            })
        ).toThrow(/must differ/);
    });

    it("throws on invalid opensearch endpoint URL", () => {
        expect(() =>
            createConfig({
                source: { ...baseSource, opensearch: { tableName: "src-os" } },
                target: {
                    ...baseTarget,
                    opensearch: {
                        endpoint: "not-a-url",
                        tableName: "tgt-os",
                        service: "opensearch",
                        indexPrefix: ""
                    }
                },
                pipeline: {}
            })
        ).toThrow();
    });

    it("collision guard runs on trimmed values", () => {
        expect(() =>
            createConfig({
                source: baseSource,
                target: {
                    ...baseTarget,
                    region: baseSource.region,
                    dynamodb: { tableName: "src-table " }
                },
                pipeline: {}
            })
        ).toThrow(/matches source/);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/features/MigrationConfig/createConfig.test.ts 2>&1 | tail -20
```

Expected: FAIL — `createConfig` does not exist yet.

- [ ] **Step 3: Create `src/features/MigrationConfig/schemas/unified.schema.ts`**

```typescript
import { z } from "zod";
import {
    credentialsOrProviderSchema,
    debugSettingsSchema,
    pipelineSettingsSchema,
    trimmedString,
    tuningSchema
} from "./shared.schema.ts";

const opensearchSourceSchema = z.object({
    tableName: trimmedString()
});

const opensearchTargetSchema = z.object({
    endpoint: trimmedString().url(),
    tableName: trimmedString(),
    service: z.enum(["opensearch", "opensearch-serverless"]),
    indexPrefix: z.string().trim()
});

const sourceSchema = z.object({
    region: trimmedString(),
    credentials: credentialsOrProviderSchema,
    dynamodb: z.object({ tableName: trimmedString() }),
    s3: z.object({ bucket: trimmedString() }),
    opensearch: opensearchSourceSchema.nullable().optional()
});

const targetSchema = z.object({
    region: trimmedString(),
    credentials: credentialsOrProviderSchema,
    dynamodb: z.object({ tableName: trimmedString() }),
    s3: z.object({ bucket: trimmedString() }),
    opensearch: opensearchTargetSchema.nullable().optional(),
    auditLog: z
        .object({
            dynamodb: z.object({ tableName: trimmedString().nullable() })
        })
        .nullable()
        .optional()
});

export const unifiedTransferInputSchema = z
    .object({
        source: sourceSchema,
        target: targetSchema,
        pipeline: pipelineSettingsSchema,
        tuning: tuningSchema,
        debug: debugSettingsSchema
    })
    .superRefine((data, ctx) => {
        if (data.source.s3.bucket === data.target.s3.bucket) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "s3", "bucket"],
                message: `Target S3 bucket "${data.target.s3.bucket}" is the same as source — would overwrite source files. Use a different bucket.`
            });
        }

        if (
            data.source.region === data.target.region &&
            data.source.dynamodb.tableName === data.target.dynamodb.tableName
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "dynamodb", "tableName"],
                message: `Target DynamoDB table "${data.target.dynamodb.tableName}" in region "${data.target.region}" matches source. If these are different AWS accounts, rename one or change the target region to make the intent explicit.`
            });
        }

        if (
            data.target.auditLog?.dynamodb?.tableName != null &&
            data.target.auditLog.dynamodb.tableName === data.target.dynamodb.tableName
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "auditLog", "dynamodb", "tableName"],
                message: `Audit log DynamoDB table "${data.target.auditLog.dynamodb.tableName}" must differ from the main target table.`
            });
        }

        const hasSourceOs = data.source.opensearch != null;
        const hasTargetOs = data.target.opensearch != null;
        if (hasSourceOs !== hasTargetOs) {
            ctx.addIssue({
                code: "custom",
                path: hasSourceOs ? ["target", "opensearch"] : ["source", "opensearch"],
                message: "source.opensearch and target.opensearch must both be set or both be absent."
            });
        }

        if (
            hasSourceOs &&
            hasTargetOs &&
            data.source.region === data.target.region &&
            data.source.opensearch!.tableName === data.target.opensearch!.tableName
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["target", "opensearch", "tableName"],
                message: `Target OpenSearch DDB table "${data.target.opensearch!.tableName}" in region "${data.target.region}" matches source. If these are different AWS accounts, rename one or change the target region to make the intent explicit.`
            });
        }
    });

export type UnifiedConfigInput = z.infer<typeof unifiedTransferInputSchema>;
```

- [ ] **Step 4: Update `src/features/MigrationConfig/schemas/shared.schema.ts` — remove `preset` from `pipelineSettingsSchema`**

Change:
```typescript
export const pipelineSettingsSchema = z.object({
    preset: trimmedString(),
    segments: z.number().int().positive().optional(),
    modelsDir: trimmedString().optional(),
    presetsDir: trimmedString().optional()
});
```
To:
```typescript
export const pipelineSettingsSchema = z.object({
    segments: z.number().int().positive().optional(),
    modelsDir: trimmedString().optional(),
    presetsDir: trimmedString().optional()
});
```

- [ ] **Step 5: Rewrite `src/features/MigrationConfig/validation.ts`**

```typescript
import { z } from "zod";
import { unifiedTransferInputSchema } from "./schemas/unified.schema.ts";

export const migrationConfigSchema = unifiedTransferInputSchema;
export type MigrationConfiguration = z.infer<typeof migrationConfigSchema>;
```

- [ ] **Step 6: Create `src/features/MigrationConfig/createConfig.ts`**

```typescript
import { unifiedTransferInputSchema, type UnifiedConfigInput } from "./schemas/unified.schema.ts";
import type { MigrationConfiguration } from "./validation.ts";

export function createConfig(input: UnifiedConfigInput): MigrationConfiguration {
    return unifiedTransferInputSchema.parse(input);
}
```

- [ ] **Step 7: Update `src/features/MigrationConfig/index.ts`**

Read the current file and replace all exports. The new file must export `createConfig` and remove `createDdbConfig`, `createOsConfig`, `DdbMigrationConfiguration`, `OsMigrationConfiguration`. Keep `MigrationConfig` abstraction, `MigrationConfigFeature`, `loadConfig`, `migrationConfigSchema`, `MigrationConfiguration`.

The file currently imports from `createDdbConfig.ts` and `createOsConfig.ts`. Replace with `createConfig.ts`:

```typescript
export { createConfig } from "./createConfig.ts";
export { loadConfig } from "./loadConfig.ts";
export { MigrationConfigFeature } from "./feature.ts";
export { MigrationConfig } from "./abstractions/MigrationConfig.ts";
export { migrationConfigSchema } from "./validation.ts";
export type { MigrationConfiguration } from "./validation.ts";
```

(Read the current `index.ts` first to ensure you keep any other exports that should remain.)

- [ ] **Step 8: Delete old schema files and builders**

```bash
rm /Users/brunozoric/work/webiny/webiny-v5-to-v6/src/features/MigrationConfig/schemas/ddb.schema.ts
rm /Users/brunozoric/work/webiny/webiny-v5-to-v6/src/features/MigrationConfig/schemas/os.schema.ts
rm /Users/brunozoric/work/webiny/webiny-v5-to-v6/src/features/MigrationConfig/createDdbConfig.ts
rm /Users/brunozoric/work/webiny/webiny-v5-to-v6/src/features/MigrationConfig/createOsConfig.ts
```

- [ ] **Step 9: Update `__tests__/containers/ddb.ts` — remove `storage` and `preset`**

In the `config` object inside `createDdbContainer`, change:
```typescript
const config: MigrationConfig.Interface = {
    storage: "ddb",
    source: { ... },
    target: { ... },
    pipeline: {
        preset: "v5-to-v6",
        modelsDir: options.modelsDir,
        presetsDir: options.presetsDir,
        ...
    }
};
```
To:
```typescript
const config: MigrationConfig.Interface = {
    source: {
        region: "us-east-1",
        credentials: DEFAULT_CREDS,
        dynamodb: { tableName: "source-table" },
        s3: { bucket: "source-bucket" }
    },
    target: {
        region: "eu-central-1",
        credentials: DEFAULT_CREDS,
        dynamodb: { tableName: "target-table" },
        s3: { bucket: "target-bucket" },
        auditLog: null
    },
    pipeline: {
        modelsDir: options.modelsDir,
        presetsDir: options.presetsDir,
        ...(options.pipelineOverride?.segments !== undefined
            ? { segments: options.pipelineOverride.segments }
            : {})
    }
};
```

- [ ] **Step 10: Update `__tests__/containers/os.ts` — remove `storage`, `preset`; add required `dynamodb`+`s3` to target**

```typescript
const config: MigrationConfig.Interface = {
    source: {
        region: "us-east-1",
        credentials: DEFAULT_CREDS,
        dynamodb: { tableName: "source-primary" },
        s3: { bucket: "source-bucket" },
        opensearch: { tableName: "source-os" }
    },
    target: {
        region: "eu-central-1",
        credentials: DEFAULT_CREDS,
        dynamodb: { tableName: "target-table" },
        s3: { bucket: "target-bucket" },
        opensearch: {
            endpoint: "https://es.example.com",
            tableName: "target-os",
            service: "opensearch" as const,
            indexPrefix: options.indexPrefix ?? ""
        }
    },
    pipeline: {
        modelsDir: options.modelsDir,
        presetsDir: options.presetsDir,
        ...(options.pipelineOverride?.segments !== undefined
            ? { segments: options.pipelineOverride.segments }
            : {})
    }
};
```

- [ ] **Step 11: Update `__tests__/integration/integrationContainer.ts` — remove `storage` and `preset`**

Find lines with `storage: "ddb"` and `preset: "integration"` in the config object and remove them. The pipeline section should not have a `preset` field.

- [ ] **Step 12: Run the target tests to verify they pass**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/features/MigrationConfig/createConfig.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 13: Commit**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && git add -p && git commit -m "$(cat <<'EOF'
feat: unified config schema — createConfig replaces createDdbConfig/createOsConfig

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update `loadConfig`

**Files:**
- Modify: `src/features/MigrationConfig/loadConfig.ts`
- Rewrite: `__tests__/features/MigrationConfig/MigrationConfig.test.ts`

- [ ] **Step 1: Write failing tests**

Replace `__tests__/features/MigrationConfig/MigrationConfig.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Container } from "@webiny/di";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    MigrationConfig,
    MigrationConfigFeature,
    loadConfig
} from "../../../src/features/MigrationConfig/index.ts";

describe("loadConfig", () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "mc-test-")); });
    afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

    const creds = { accessKeyId: "AKIA", secretAccessKey: "secret" };

    function writeConfig(config: object): string {
        const p = join(tmpDir, "config.ts");
        writeFileSync(p, `export default ${JSON.stringify(config, null, 2)};`);
        return p;
    }

    it("loads a valid unified config", async () => {
        const p = writeConfig({
            source: { region: "eu-central-1", credentials: creds, dynamodb: { tableName: "src" }, s3: { bucket: "src-b" } },
            target: { region: "eu-central-1", credentials: creds, dynamodb: { tableName: "tgt" }, s3: { bucket: "tgt-b" } },
            pipeline: {}
        });
        const config = await loadConfig(p);
        expect(config.source.dynamodb.tableName).toBe("src");
        expect((config as any).storage).toBeUndefined();
    });

    it("loads a config with opensearch fields", async () => {
        const p = writeConfig({
            source: {
                region: "eu-central-1", credentials: creds,
                dynamodb: { tableName: "src" }, s3: { bucket: "src-b" },
                opensearch: { tableName: "src-os" }
            },
            target: {
                region: "eu-central-1", credentials: creds,
                dynamodb: { tableName: "tgt" }, s3: { bucket: "tgt-b" },
                opensearch: { endpoint: "https://es.example.com", tableName: "tgt-os", service: "opensearch", indexPrefix: "" }
            },
            pipeline: {}
        });
        const config = await loadConfig(p);
        expect(config.source.opensearch?.tableName).toBe("src-os");
    });

    it("rejects invalid config", async () => {
        const p = writeConfig({ invalid: true });
        await expect(loadConfig(p)).rejects.toThrow();
    });

    it("rejects config missing required fields", async () => {
        const p = writeConfig({ source: { region: "us-east-1" } });
        await expect(loadConfig(p)).rejects.toThrow();
    });

    it("rejects file with no default export", async () => {
        const p = join(tmpDir, "config.ts");
        writeFileSync(p, "export const x = 1;");
        await expect(loadConfig(p)).rejects.toThrow(/default export/);
    });

    it("resolves presetsDir relative to config file directory", async () => {
        const p = writeConfig({
            source: { region: "eu-central-1", credentials: creds, dynamodb: { tableName: "src" }, s3: { bucket: "src-b" } },
            target: { region: "eu-central-1", credentials: creds, dynamodb: { tableName: "tgt" }, s3: { bucket: "tgt-b" } },
            pipeline: { presetsDir: "./custom-presets" }
        });
        const config = await loadConfig(p);
        expect(config.pipeline?.presetsDir).toBe(join(tmpDir, "custom-presets"));
    });

    it("resolves modelsDir relative to config file directory", async () => {
        const p = writeConfig({
            source: { region: "eu-central-1", credentials: creds, dynamodb: { tableName: "src" }, s3: { bucket: "src-b" } },
            target: { region: "eu-central-1", credentials: creds, dynamodb: { tableName: "tgt" }, s3: { bucket: "tgt-b" } },
            pipeline: { modelsDir: "./models" }
        });
        const config = await loadConfig(p);
        expect(config.pipeline?.modelsDir).toBe(join(tmpDir, "models"));
    });
});

describe("MigrationConfig DI registration", () => {
    it("registers and resolves the config", async () => {
        const creds = { accessKeyId: "AKIA", secretAccessKey: "secret" };
        const config = {
            source: { region: "eu-central-1", credentials: creds, dynamodb: { tableName: "src" }, s3: { bucket: "src-b" } },
            target: { region: "eu-central-1", credentials: creds, dynamodb: { tableName: "tgt" }, s3: { bucket: "tgt-b" } },
            pipeline: {}
        };
        const { MigrationConfiguration: _, ...rest } = await import("../../../src/features/MigrationConfig/validation.ts");
        const { migrationConfigSchema } = rest;
        const parsed = migrationConfigSchema.parse(config);
        const container = new Container();
        MigrationConfigFeature.register(container, { config: parsed });
        const resolved = container.resolve(MigrationConfig);
        expect(resolved.source.dynamodb.tableName).toBe("src");
        const second = container.resolve(MigrationConfig);
        expect(resolved).toBe(second);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/features/MigrationConfig/MigrationConfig.test.ts 2>&1 | tail -20
```

Expected: FAIL — `loadConfig` still checks `config.storage`.

- [ ] **Step 3: Rewrite `src/features/MigrationConfig/loadConfig.ts`**

```typescript
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { MigrationConfig } from "./abstractions/MigrationConfig.ts";
import { migrationConfigSchema } from "./validation.ts";

export async function loadConfig(configPath: string): Promise<MigrationConfig.Interface> {
    const absolutePath = resolve(process.cwd(), configPath);
    const fileUrl = pathToFileURL(absolutePath).href;

    try {
        const module = await import(fileUrl);
        const raw = module.default;

        if (!raw) {
            throw new Error(
                `Config file ${configPath} must have a default export. ` +
                    `Use createConfig() to create your config.`
            );
        }

        const parsed = migrationConfigSchema.safeParse(raw);
        if (!parsed.success) {
            throw new Error(
                `Invalid config in ${configPath}:\n${parsed.error.message}`
            );
        }

        const config = parsed.data;
        const configDir = dirname(absolutePath);
        const pipeline = config.pipeline ?? {};

        return {
            ...config,
            pipeline: {
                ...pipeline,
                ...(pipeline.modelsDir
                    ? { modelsDir: resolve(configDir, pipeline.modelsDir) }
                    : {}),
                ...(pipeline.presetsDir
                    ? { presetsDir: resolve(configDir, pipeline.presetsDir) }
                    : {})
            }
        };
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
        }
        throw error;
    }
}
```

- [ ] **Step 4: Run test and verify it passes**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/features/MigrationConfig/MigrationConfig.test.ts 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && git add src/features/MigrationConfig/loadConfig.ts __tests__/features/MigrationConfig/MigrationConfig.test.ts && git commit -m "$(cat <<'EOF'
feat: loadConfig uses unified schema, drops storage guard

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Bootstrap — always register all features

**Files:**
- Modify: `src/bootstrap.ts`
- Rewrite: `__tests__/bootstrap.test.ts`

- [ ] **Step 1: Write failing tests**

Replace `__tests__/bootstrap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { bootstrap } from "../src/bootstrap.ts";
import { MigrationConfig } from "../src/features/MigrationConfig/index.ts";
import { SourceDynamoDbClient, TargetDynamoDbClient } from "../src/services/DynamoDbClient/index.ts";
import { Logger } from "../src/tools/Logger/index.ts";
import { Cache } from "../src/tools/Cache/index.ts";
import { ModelProvider } from "../src/features/ModelProvider/index.ts";
import { TenantLocales } from "../src/features/TenantLocales/index.ts";
import { SourceS3Client, TargetS3Client } from "../src/services/S3Client/index.ts";
import { PresetLoader } from "../src/features/PresetLoader/index.ts";
import { WorkerSpawner } from "../src/features/WorkerSpawner/index.ts";
import { DirectoryTool } from "../src/tools/DirectoryTool/index.ts";
import { FileTool } from "../src/tools/FileTool/index.ts";
import { OpenSearchClient } from "../src/services/OpenSearchClient/index.ts";

const creds = { accessKeyId: "test", secretAccessKey: "test" };

const ddbOnlyConfig: MigrationConfig.Interface = {
    source: {
        region: "us-east-1",
        credentials: creds,
        dynamodb: { tableName: "source-table" },
        s3: { bucket: "source-bucket" }
    },
    target: {
        region: "eu-central-1",
        credentials: creds,
        dynamodb: { tableName: "target-table" },
        s3: { bucket: "target-bucket" },
        auditLog: null
    },
    pipeline: {}
};

const fullConfig: MigrationConfig.Interface = {
    source: {
        region: "us-east-1",
        credentials: creds,
        dynamodb: { tableName: "source-primary" },
        s3: { bucket: "source-bucket" },
        opensearch: { tableName: "source-os" }
    },
    target: {
        region: "eu-central-1",
        credentials: creds,
        dynamodb: { tableName: "target-table" },
        s3: { bucket: "target-bucket" },
        opensearch: {
            endpoint: "https://es.example.com",
            tableName: "target-os",
            service: "opensearch" as const,
            indexPrefix: ""
        }
    },
    pipeline: {}
};

describe("bootstrap — DDB-only config", () => {
    it("resolves all core features", () => {
        const container = bootstrap({ config: ddbOnlyConfig });
        expect(container.resolve(MigrationConfig)).toBeDefined();
        expect(container.resolve(Logger)).toBeDefined();
        expect(container.resolve(Cache)).toBeDefined();
        expect(container.resolve(DirectoryTool)).toBeDefined();
        expect(container.resolve(FileTool)).toBeDefined();
        expect(container.resolve(SourceDynamoDbClient)).toBeDefined();
        expect(container.resolve(TargetDynamoDbClient)).toBeDefined();
        expect(container.resolve(SourceS3Client)).toBeDefined();
        expect(container.resolve(TargetS3Client)).toBeDefined();
        expect(container.resolve(ModelProvider)).toBeDefined();
        expect(container.resolve(TenantLocales)).toBeDefined();
        expect(container.resolve(PresetLoader)).toBeDefined();
        expect(container.resolve(WorkerSpawner)).toBeDefined();
    });

    it("does NOT register OpenSearchClient when opensearch is absent", () => {
        const container = bootstrap({ config: ddbOnlyConfig });
        expect(() => container.resolve(OpenSearchClient)).toThrow();
    });
});

describe("bootstrap — full config (DDB + OS)", () => {
    it("resolves OpenSearchClient when target.opensearch is set", () => {
        const container = bootstrap({ config: fullConfig });
        expect(container.resolve(OpenSearchClient)).toBeDefined();
    });

    it("also resolves S3 clients in full config", () => {
        const container = bootstrap({ config: fullConfig });
        expect(container.resolve(SourceS3Client)).toBeDefined();
        expect(container.resolve(TargetS3Client)).toBeDefined();
    });
});

describe("bootstrap — singleton behavior", () => {
    it("returns same instance on multiple resolves", () => {
        const container = bootstrap({ config: ddbOnlyConfig });
        expect(container.resolve(Logger)).toBe(container.resolve(Logger));
        expect(container.resolve(Cache)).toBe(container.resolve(Cache));
        expect(container.resolve(SourceDynamoDbClient)).toBe(container.resolve(SourceDynamoDbClient));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/bootstrap.test.ts 2>&1 | tail -20
```

Expected: FAIL — config objects have no `storage` field yet, and bootstrap still branches on it.

- [ ] **Step 3: Rewrite `src/bootstrap.ts`**

Replace the `if (config.storage === "ddb")` / `if (config.storage === "os")` blocks. Full replacement of the service registration and feature registration sections:

```typescript
// Services — always register DDB
container.registerInstance(DynamoDbClientConfig, {
    source: {
        region: config.source.region,
        credentials: config.source.credentials
    },
    target: {
        region: config.target.region,
        credentials: config.target.credentials
    },
    tuning: config.tuning?.ddb
});
DynamoDbClientFeature.register(container);

// Services — always register S3
container.registerInstance(S3ClientConfig, {
    source: {
        region: config.source.region,
        credentials: config.source.credentials
    },
    target: {
        region: config.target.region,
        credentials: config.target.credentials
    },
    tuning: config.tuning?.s3
});
S3ClientFeature.register(container);

// Services — OS only when configured
if (config.target.opensearch != null) {
    container.registerInstance(OpenSearchClientConfig, {
        endpoint: config.target.opensearch.endpoint,
        region: config.target.region,
        service: config.target.opensearch.service,
        credentials: config.target.credentials,
        maxRetries: config.tuning?.os?.maxRetries
    });
    OpenSearchClientFeature.register(container);
}

// Features — always register all processors/scanners
TransferLifecycleFeature.register(container);
PresetLifecycleFeature.register(container);
PresetLoaderFeature.register(container);
WorkerSpawnerFeature.register(container);
ModelProviderFeature.register(container);
TenantLocalesFeature.register(container);
TransformContextFeature.register(container);
PipelineBuilderFactoryFeature.register(container);
SnapshotWriterFeature.register(container);
DroppedRecordLogFeature.register(container);
TransferredRecordLogFeature.register(container);
PipelineRunnerFeature.register(container);
DdbExecutorFeature.register(container);
S3ProcessorFeature.register(container);
DdbScannerFeature.register(container);
DdbProcessorFeature.register(container);
AuditLogProcessorFeature.register(container);
TouchedIndexesFeature.register(container);
OsRecordDecompressorFeature.register(container);
OsScannerFeature.register(container);
OsProcessorFeature.register(container);
```

- [ ] **Step 4: Run test and verify it passes**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/bootstrap.test.ts 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && git add src/bootstrap.ts __tests__/bootstrap.test.ts && git commit -m "$(cat <<'EOF'
feat: bootstrap registers all processors always; OS features conditional on config

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Remove/replace `config.storage` guards in processors and scanners

**Files:**
- Modify: `src/features/DdbScanner/DdbScanner.ts`
- Modify: `src/features/DdbProcessor/DdbProcessor.ts`
- Modify: `src/features/S3Processor/S3Processor.ts`
- Modify: `src/features/OsScanner/OsScanner.ts`
- Modify: `src/features/OsProcessor/OsProcessor.ts`
- Modify: `src/features/AuditLogProcessor/AuditLogProcessor.ts`

Read each file before editing. The changes are:

- [ ] **Step 1: `DdbScanner.ts` — remove `config.storage` guard**

Open the file and find: `if (this.config.storage !== "ddb") { throw ... }` — delete this block entirely. DDB is always available.

- [ ] **Step 2: `DdbProcessor.ts` — remove `config.storage` guard**

Find: `if (this.config.storage !== "ddb") { throw ... }` — delete this block.

- [ ] **Step 3: `S3Processor.ts` — remove `config.storage` guard**

Find: `if (this.config.storage !== "ddb") { throw ... }` — delete this block.

- [ ] **Step 4: `OsScanner.ts` — replace storage guard with opensearch null-check**

Change:
```typescript
if (this.config.storage !== "os") {
    throw new Error("OsScanner: source is not in OS storage mode; check config.storage");
}
```
To:
```typescript
if (!this.config.source.opensearch) {
    throw new Error("OsScanner: config.source.opensearch is not configured.");
}
```

- [ ] **Step 5: `OsProcessor.ts` — replace storage guard**

Change:
```typescript
if (this.config.storage !== "os") {
    throw new Error(...)
}
```
To:
```typescript
if (!this.config.target.opensearch) {
    throw new Error("OsProcessor: config.target.opensearch is not configured.");
}
```

- [ ] **Step 6: `AuditLogProcessor.ts` — remove `storage === "ddb"` checks**

Find in `extendContext`:
```typescript
const tableName =
    this.config.storage === "ddb"
        ? (this.config.target.auditLog?.dynamodb?.tableName ?? null)
        : null;
```
Change to:
```typescript
const tableName = this.config.target.auditLog?.dynamodb?.tableName ?? null;
```

Find the second occurrence (likely in an `isEnabled` or similar guard):
```typescript
this.config.storage === "ddb"
```
Remove this condition (or the whole check if it guards a method return). The audit log is enabled only when `tableName != null`, which is already handled by the existing null-check logic.

- [ ] **Step 7: Run affected tests**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/features/DdbScanner __tests__/features/DdbProcessor __tests__/features/S3Processor __tests__/features/OsScanner __tests__/features/OsProcessor __tests__/features/AuditLogProcessor 2>&1 | tail -30
```

Expected: all PASS (they use test containers from Task 1).

- [ ] **Step 8: Commit**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && git add src/features/DdbScanner/DdbScanner.ts src/features/DdbProcessor/DdbProcessor.ts src/features/S3Processor/S3Processor.ts src/features/OsScanner/OsScanner.ts src/features/OsProcessor/OsProcessor.ts src/features/AuditLogProcessor/AuditLogProcessor.ts && git commit -m "$(cat <<'EOF'
feat: replace config.storage guards with opensearch null-checks in processors

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add `--preset` to `processSegment`

Workers currently read `config.pipeline.preset` which no longer exists. They must receive the preset name as a CLI argument.

**Files:**
- Modify: `src/commands/processSegment/register.ts`
- Modify: `src/commands/processSegment/handler.ts`
- Modify: `__tests__/commands/processSegment.test.ts`

- [ ] **Step 1: Add `--preset` option to `src/commands/processSegment/register.ts`**

Add to the yargs options:
```typescript
.option("preset", {
    type: "string",
    demandOption: true,
    description: "Preset name or path to use for this segment"
})
```
And pass it to the handler:
```typescript
async argv => {
    await handler({ ...argv, preset: argv.preset, logLevel: argv["log-level"] as string | undefined });
}
```

- [ ] **Step 2: Update `ProcessSegmentArgs` and handler in `src/commands/processSegment/handler.ts`**

Add `preset: string` to `ProcessSegmentArgs`:
```typescript
export interface ProcessSegmentArgs {
    runId: string;
    segment: number;
    total: number;
    config: string;
    preset: string;
    logLevel?: string;
}
```

Change line 42 from:
```typescript
const preset = await presetLoader.load(config.pipeline.preset);
```
To:
```typescript
const preset = await presetLoader.load(argv.preset);
```

- [ ] **Step 3: Update `__tests__/commands/processSegment.test.ts`**

Find the `loadConfig` mock:
```typescript
vi.mock("~/features/MigrationConfig/loadConfig.ts", () => ({
    loadConfig: vi.fn(async (_path: string) => ({ storage: "ddb", pipeline: { preset: "x" } }))
}));
```
Change to:
```typescript
vi.mock("~/features/MigrationConfig/loadConfig.ts", () => ({
    loadConfig: vi.fn(async (_path: string) => ({
        source: { region: "us-east-1", credentials: { accessKeyId: "t", secretAccessKey: "t" }, dynamodb: { tableName: "src" }, s3: { bucket: "src-b" } },
        target: { region: "us-east-1", credentials: { accessKeyId: "t", secretAccessKey: "t" }, dynamodb: { tableName: "tgt" }, s3: { bucket: "tgt-b" } },
        pipeline: {}
    }))
}));
```

Find all `handler({ runId: ..., segment: ..., total: ..., config: ... })` calls in the test and add `preset: "test-preset"` to each.

- [ ] **Step 4: Run tests**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/commands/processSegment.test.ts 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && git add src/commands/processSegment/register.ts src/commands/processSegment/handler.ts __tests__/commands/processSegment.test.ts && git commit -m "$(cat <<'EOF'
feat: processSegment receives preset via --preset CLI argument

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Preset discovery + simplified config discovery

**Files:**
- Create: `src/commands/run/wizard/presetDiscovery.ts`
- Modify: `src/commands/run/wizard/configDiscovery.ts`
- Rewrite: `__tests__/commands/run/wizard/configDiscovery.test.ts`
- Create: `__tests__/commands/run/wizard/presetDiscovery.test.ts`
- Modify: `__tests__/fixtures/wizard/ddb.config.ts` → replace with unified config fixture
- Delete: `__tests__/fixtures/wizard/os.config.ts`

- [ ] **Step 1: Write failing tests for `presetDiscovery`**

Create `__tests__/commands/run/wizard/presetDiscovery.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { listAvailablePresets } from "../../../../src/commands/run/wizard/presetDiscovery.ts";

describe("listAvailablePresets", () => {
    it("returns built-in preset names (at minimum v5-to-v6-ddb and v5-to-v6-os)", () => {
        const presets = listAvailablePresets();
        expect(presets).toContain("v5-to-v6-ddb");
        expect(presets).toContain("v5-to-v6-os");
    });

    it("includes user presets from presetsDir when provided", () => {
        const tmp = mkdtempSync(join(tmpdir(), "presetdiscovery-"));
        try {
            writeFileSync(join(tmp, "my-preset.ts"), "export default {}");
            writeFileSync(join(tmp, "another.ts"), "export default {}");
            const presets = listAvailablePresets(tmp);
            expect(presets).toContain("my-preset");
            expect(presets).toContain("another");
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });

    it("deduplicates when user preset name matches a built-in", () => {
        const tmp = mkdtempSync(join(tmpdir(), "presetdiscovery-dup-"));
        try {
            writeFileSync(join(tmp, "v5-to-v6-ddb.ts"), "export default {}");
            const presets = listAvailablePresets(tmp);
            const count = presets.filter(p => p === "v5-to-v6-ddb").length;
            expect(count).toBe(1);
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });

    it("returns empty list when presetsDir does not exist", () => {
        const presets = listAvailablePresets("/nonexistent/path/xyz");
        // Built-ins still present; user dir gracefully ignored
        expect(Array.isArray(presets)).toBe(true);
    });

    it("returns sorted list", () => {
        const presets = listAvailablePresets();
        const sorted = [...presets].sort();
        expect(presets).toEqual(sorted);
    });
});
```

- [ ] **Step 2: Write failing tests for simplified `configDiscovery`**

Replace `__tests__/commands/run/wizard/configDiscovery.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { discoverConfig } from "../../../../src/commands/run/wizard/configDiscovery.ts";

describe("discoverConfig", () => {
    it("returns the resolved path to config.ts when it exists", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "configdiscovery-"));
        try {
            const configPath = join(tmp, "config.ts");
            writeFileSync(configPath, "export default {};");
            const result = await discoverConfig(tmp);
            expect(result).toBe(configPath);
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });

    it("returns null when config.ts does not exist", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "configdiscovery-empty-"));
        try {
            const result = await discoverConfig(tmp);
            expect(result).toBeNull();
        } finally {
            rmSync(tmp, { recursive: true });
        }
    });

    it("returns null for nonexistent directory", async () => {
        const result = await discoverConfig("/nonexistent/path/xyz");
        expect(result).toBeNull();
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/commands/run/wizard/presetDiscovery.test.ts __tests__/commands/run/wizard/configDiscovery.test.ts 2>&1 | tail -20
```

Expected: FAIL — neither file exists yet.

- [ ] **Step 4: Create `src/commands/run/wizard/presetDiscovery.ts`**

```typescript
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";

const BUILTIN_PRESETS_DIR = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../presets"
);

const PRESET_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".js"]);

function stripExtension(filename: string): string | null {
    for (const ext of PRESET_EXTENSIONS) {
        if (filename.endsWith(ext)) {
            return filename.slice(0, -ext.length);
        }
    }
    return null;
}

function scanDir(dir: string): string[] {
    if (!existsSync(dir)) {
        return [];
    }
    try {
        return readdirSync(dir)
            .map(stripExtension)
            .filter((name): name is string => name !== null);
    } catch {
        return [];
    }
}

export function listAvailablePresets(presetsDir?: string): string[] {
    const builtIns = scanDir(BUILTIN_PRESETS_DIR);
    const userPresets = presetsDir ? scanDir(presetsDir) : [];
    const all = new Set([...builtIns, ...userPresets]);
    return [...all].sort();
}
```

- [ ] **Step 5: Rewrite `src/commands/run/wizard/configDiscovery.ts`**

```typescript
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function discoverConfig(projectDir: string): Promise<string | null> {
    const configPath = resolve(join(projectDir, "config.ts"));
    try {
        await access(configPath);
        return configPath;
    } catch {
        return null;
    }
}
```

- [ ] **Step 6: Update fixture — replace `__tests__/fixtures/wizard/ddb.config.ts` with a unified config stub**

```typescript
export default {
    source: {
        region: "eu-central-1",
        credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
        dynamodb: { tableName: "src-table" },
        s3: { bucket: "src-bucket" }
    },
    target: {
        region: "us-east-1",
        credentials: { accessKeyId: "AKIA", secretAccessKey: "secret" },
        dynamodb: { tableName: "tgt-table" },
        s3: { bucket: "tgt-bucket" }
    },
    pipeline: {}
};
```

- [ ] **Step 7: Delete `__tests__/fixtures/wizard/os.config.ts`**

```bash
rm /Users/brunozoric/work/webiny/webiny-v5-to-v6/__tests__/fixtures/wizard/os.config.ts
```

- [ ] **Step 8: Run tests and verify they pass**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/commands/run/wizard/presetDiscovery.test.ts __tests__/commands/run/wizard/configDiscovery.test.ts 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && git add src/commands/run/wizard/presetDiscovery.ts src/commands/run/wizard/configDiscovery.ts __tests__/commands/run/wizard/presetDiscovery.test.ts __tests__/commands/run/wizard/configDiscovery.test.ts __tests__/fixtures/wizard/ddb.config.ts && git rm __tests__/fixtures/wizard/os.config.ts && git commit -m "$(cat <<'EOF'
feat: preset discovery + simplified configDiscovery (config.ts only)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: TransferWizard — add preset selection step

**Files:**
- Modify: `src/commands/run/wizard/types.ts`
- Modify: `src/commands/run/wizard/TransferWizard.ts`
- Modify: `src/commands/run/register.ts`
- Modify: `__tests__/commands/run/wizard/TransferWizard.test.ts`

- [ ] **Step 1: Add `WizardResult` to `src/commands/run/wizard/types.ts`**

Read the current file. Add at the end:

```typescript
export interface WizardResult {
    configPath: string;
    preset: string;
}
```

- [ ] **Step 2: Write failing wizard tests**

Replace `__tests__/commands/run/wizard/TransferWizard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Stats } from "node:fs";
import { TransferWizard } from "../../../../src/commands/run/wizard/TransferWizard.ts";
import type { RawOutputValues } from "../../../../src/commands/run/wizard/types.ts";

vi.mock("../../../../src/commands/run/wizard/projectDiscovery.ts");
vi.mock("../../../../src/commands/run/wizard/configDiscovery.ts");
vi.mock("../../../../src/commands/run/wizard/presetDiscovery.ts");
vi.mock("../../../../src/commands/run/wizard/envWriter.ts");
vi.mock("../../../../src/commands/run/wizard/sources/WebinyOutputSource.ts");
vi.mock("../../../../src/commands/run/wizard/sources/PulumiStateSource.ts");
vi.mock("@inquirer/prompts");
vi.mock("node:fs/promises");
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
vi.mock("../../../../src/commands/initProject/scaffoldProject.ts", () => ({
    scaffoldProject: vi.fn().mockResolvedValue(undefined)
}));

import { discoverProjects } from "../../../../src/commands/run/wizard/projectDiscovery.ts";
import { discoverConfig } from "../../../../src/commands/run/wizard/configDiscovery.ts";
import { listAvailablePresets } from "../../../../src/commands/run/wizard/presetDiscovery.ts";
import { writeEnv } from "../../../../src/commands/run/wizard/envWriter.ts";
import { extractFromWebinyOutput } from "../../../../src/commands/run/wizard/sources/WebinyOutputSource.ts";
import { extractFromPulumiState } from "../../../../src/commands/run/wizard/sources/PulumiStateSource.ts";
import { input, select } from "@inquirer/prompts";
import { stat, access } from "node:fs/promises";
import { scaffoldProject } from "../../../../src/commands/initProject/scaffoldProject.ts";

const mockDiscoverProjects = vi.mocked(discoverProjects);
const mockDiscoverConfig = vi.mocked(discoverConfig);
const mockListAvailablePresets = vi.mocked(listAvailablePresets);
const mockWriteEnv = vi.mocked(writeEnv);
const mockExtractFromWebinyOutput = vi.mocked(extractFromWebinyOutput);
const mockExtractFromPulumiState = vi.mocked(extractFromPulumiState);
const mockInput = vi.mocked(input);
const mockSelect = vi.mocked(select);
const mockStat = vi.mocked(stat);
const mockAccess = vi.mocked(access);
const mockScaffoldProject = vi.mocked(scaffoldProject);

const noFile = (): never => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
};

const SOURCE_VALS: RawOutputValues = {
    region: "eu-central-1",
    primaryDynamodbTableName: "wby-source-primary",
    fileManagerBucketId: "wby-source-bucket",
    osTableName: "",
    osEndpoint: ""
};

const TARGET_VALS: RawOutputValues = {
    region: "us-east-1",
    primaryDynamodbTableName: "wby-target-primary",
    fileManagerBucketId: "wby-target-bucket",
    osTableName: "",
    osEndpoint: ""
};

beforeEach(() => {
    vi.resetAllMocks();
    mockWriteEnv.mockResolvedValue(undefined);
    mockScaffoldProject.mockResolvedValue(undefined);
});

describe("TransferWizard", () => {
    it("env-setup path: writes .env and returns null (no preset selection yet)", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("target.webiny.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockAccess.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        mockExtractFromWebinyOutput
            .mockResolvedValueOnce(SOURCE_VALS)
            .mockResolvedValueOnce(TARGET_VALS);
        mockInput.mockResolvedValue("4");

        const result = await new TransferWizard(process.cwd()).run();

        expect(result).toBeNull();
        expect(mockWriteEnv).toHaveBeenCalledOnce();
    });

    it("re-run path: .env exists, no JSON → finds config.ts, prompts for preset, returns WizardResult", async () => {
        const CONFIG_PATH = "/projects/my-project/config.ts";
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect
            .mockResolvedValueOnce("my-project")
            .mockResolvedValueOnce("v5-to-v6-ddb");
        mockStat.mockImplementation(async (p: unknown) => {
            if (String(p).endsWith(".env")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockDiscoverConfig.mockResolvedValue(CONFIG_PATH);
        mockListAvailablePresets.mockReturnValue(["v5-to-v6-ddb", "v5-to-v6-os"]);

        const result = await new TransferWizard(process.cwd()).run();

        expect(result).toEqual({ configPath: CONFIG_PATH, preset: "v5-to-v6-ddb" });
        expect(mockWriteEnv).not.toHaveBeenCalled();
    });

    it("re-run path: exits with error when no config.ts found in project", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
        mockStat.mockImplementation(async (p: unknown) => {
            if (String(p).endsWith(".env")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockDiscoverConfig.mockResolvedValue(null);

        // Should call process.exit(1) or throw
        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
        await expect(new TransferWizard(process.cwd()).run()).rejects.toThrow("exit");
        exitSpy.mockRestore();
    });

    it("writes .env with correct values from webiny output", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("target.webiny.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockAccess.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        mockExtractFromWebinyOutput
            .mockResolvedValueOnce(SOURCE_VALS)
            .mockResolvedValueOnce(TARGET_VALS);
        mockInput.mockResolvedValue("4");

        await new TransferWizard(process.cwd()).run();

        expect(mockWriteEnv).toHaveBeenCalledOnce();
        const [, envValues] = mockWriteEnv.mock.calls[0];
        expect(envValues.sourceRegion).toBe("eu-central-1");
        expect(envValues.targetRegion).toBe("us-east-1");
        expect(envValues.segments).toBe(4);
    });

    it("throws when same-side files disagree on osTableName", async () => {
        mockDiscoverProjects.mockResolvedValue(["my-project"]);
        mockSelect.mockResolvedValue("my-project");
        mockStat.mockImplementation(async (p: unknown) => {
            const path = String(p);
            if (path.endsWith("source.webiny.json") || path.endsWith("source.pulumi.json")) {
                return { size: 100 } as unknown as Stats;
            }
            return noFile();
        });
        mockExtractFromWebinyOutput.mockResolvedValue({ ...SOURCE_VALS, osTableName: "wby-es-webiny" });
        mockExtractFromPulumiState.mockResolvedValue({ ...SOURCE_VALS, osTableName: "wby-es-pulumi" });

        await expect(new TransferWizard(process.cwd()).run()).rejects.toThrow(/osTableName/);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/commands/run/wizard/TransferWizard.test.ts 2>&1 | tail -20
```

Expected: FAIL.

- [ ] **Step 4: Update `src/commands/run/wizard/TransferWizard.ts`**

Key changes:
1. Import `discoverConfig` instead of `discoverConfigs` (removed).
2. Import `listAvailablePresets` from `./presetDiscovery.ts`.
3. Change return type of `run()` to `Promise<WizardResult | null>`.
4. Update `runConfigSelection` to use `discoverConfig` and add a preset selection step.

The new `run()` return type: `Promise<WizardResult | null>` — null means env was just written.

The `runConfigSelection` method becomes `runPresetSelection(projectName)`:

```typescript
private async runPresetSelection(projectName: string): Promise<WizardResult> {
    const projectDir = resolve(join(this.cwd, "projects", projectName));
    const configPath = await discoverConfig(projectDir);

    if (!configPath) {
        console.error(
            `\nNo config.ts found in projects/${projectName}/.\n` +
                `Run "yarn transfer init-project ${projectName}" to scaffold one.\n`
        );
        process.exit(1);
    }

    // Dynamically import config to read presetsDir
    let presetsDir: string | undefined;
    try {
        const mod = await import(pathToFileURL(configPath).href);
        presetsDir = mod.default?.pipeline?.presetsDir;
    } catch {
        // ignore — presets from built-ins only
    }

    const presets = listAvailablePresets(presetsDir);

    if (presets.length === 0) {
        console.error("\nNo presets available. Check your presetsDir configuration.\n");
        process.exit(1);
    }

    const preset = await select({
        message: "Which preset do you want to run?",
        choices: presets.map(p => ({ value: p, name: p }))
    });

    return { configPath, preset };
}
```

The main `run()` method should call `this.runPresetSelection(projectName)` instead of the old `this.runConfigSelection(projectName)`.

Also update the import at the top of the file to add:
- `import { discoverConfig } from "./configDiscovery.ts";`
- `import { listAvailablePresets } from "./presetDiscovery.ts";`
- `import type { WizardResult } from "./types.ts";`
- `import { pathToFileURL } from "node:url";`

Remove import of `discoverConfigs`.

- [ ] **Step 5: Update `src/commands/run/register.ts`**

Change the wizard result handling from:
```typescript
const configPath = await wizard.run();
if (configPath === null) {
    process.exit(0);
}
await handler(configPath, argv.segments, argv["log-level"] as string | undefined);
```
To:
```typescript
const result = await wizard.run();
if (result === null) {
    process.exit(0);
}
await handler(result.configPath, result.preset, argv.segments, argv["log-level"] as string | undefined);
```

Also remove the `if (argv.config)` shortcut path (it previously bypassed the wizard; now everything goes through the wizard). Keep `--config` as an option for potential future use but route it through the wizard's preset selection only (or just remove the branch — the user said "everything will go through interactive CLI").

Actually, remove the `if (argv.config)` shortcut entirely. The `--config` flag no longer bypasses the wizard.

- [ ] **Step 6: Run wizard tests**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test __tests__/commands/run/wizard/TransferWizard.test.ts 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && git add src/commands/run/wizard/types.ts src/commands/run/wizard/TransferWizard.ts src/commands/run/register.ts __tests__/commands/run/wizard/TransferWizard.test.ts && git commit -m "$(cat <<'EOF'
feat: TransferWizard adds preset selection step, returns WizardResult

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update `run/handler.ts`

**Files:**
- Modify: `src/commands/run/handler.ts`

- [ ] **Step 1: Update `handler` signature and body**

Change:
```typescript
export async function handler(
    configPath: string,
    segmentsFilter?: number[],
    logLevel?: string
): Promise<void>
```
To:
```typescript
export async function handler(
    configPath: string,
    presetName: string,
    segmentsFilter?: number[],
    logLevel?: string
): Promise<void>
```

Replace:
```typescript
await presetLoader.load(config.pipeline.preset);
```
With:
```typescript
await presetLoader.load(presetName);
```

Update `logConfig` to remove the `config.storage` switch. Replace the storage-conditional log lines:
```typescript
if (config.storage === "ddb") {
    logger.info(`  Source Region: ${config.source.region}`);
    ...
} else {
    ...
}
```
With unified logging:
```typescript
logger.info(`  Preset: ${presetName}`);
logger.info(`  Source Region: ${config.source.region}`);
logger.info(`  Source DDB Table: ${config.source.dynamodb.tableName}`);
logger.info(`  Source S3 Bucket: ${config.source.s3.bucket}`);
if (config.source.opensearch) {
    logger.info(`  Source OS Table: ${config.source.opensearch.tableName}`);
}
logger.info(`  Target Region: ${config.target.region}`);
logger.info(`  Target DDB Table: ${config.target.dynamodb.tableName}`);
logger.info(`  Target S3 Bucket: ${config.target.s3.bucket}`);
if (config.target.opensearch) {
    logger.info(`  Target OS Table: ${config.target.opensearch.tableName}`);
    logger.info(`  OS Endpoint: ${config.target.opensearch.endpoint}`);
}
```

Also remove `logger.info(\`  Storage: ${config.storage}\`);` and `logger.info(\`  Preset: ${config.pipeline.preset}\`);` lines.

Update `LogConfigParams` interface — add `presetName: string`, remove any storage references:
```typescript
interface LogConfigParams {
    logger: Logger.Interface;
    config: MigrationConfig.Interface;
    runId: string;
    segments: number;
    segmentsToRun: number[];
    logLevel?: string;
    presetName: string;
}
```

Update `spawnWorker` to pass `--preset`:

Change signature:
```typescript
async function spawnWorker(
    segment: number,
    total: number,
    runId: string,
    configPath: string,
    presetName: string,
    logLevel?: string
): Promise<void>
```

Add to args array:
```typescript
"--preset", presetName,
```

Update the `spawnWorker` call site to pass `presetName`.

- [ ] **Step 2: Run type-check**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn ts-check 2>&1 | grep -v "node_modules" | head -40
```

Expected: 0 errors (or the same 5 pre-existing errors on `bruno/refactor/user-presets` — see AGENTS.md §7 "presetsDir feature").

- [ ] **Step 3: Commit**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && git add src/commands/run/handler.ts && git commit -m "$(cat <<'EOF'
feat: run/handler accepts presetName param, passes --preset to workers

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Public API, templates, project config, final verification

**Files:**
- Modify: `src/index.ts`
- Create: `templates/internal-project/config.ts`
- Delete: `templates/internal-project/ddb.transfer.config.ts`
- Delete: `templates/internal-project/os.transfer.config.ts`
- Modify: `projects/v5-to-v6/config.ts`

- [ ] **Step 1: Update `src/index.ts` — export `createConfig`, remove old exports**

Read `src/index.ts`. Remove the exports for `createDdbConfig`, `createOsConfig`, `DdbMigrationConfiguration`, `OsMigrationConfiguration`. Add export for `createConfig`. Keep all other exports unchanged.

Replace:
```typescript
export { createDdbConfig } from "~/features/MigrationConfig/createDdbConfig.ts";
export { createOsConfig } from "~/features/MigrationConfig/createOsConfig.ts";
```
With:
```typescript
export { createConfig } from "~/features/MigrationConfig/createConfig.ts";
```

Also remove type exports for `DdbMigrationConfiguration` and `OsMigrationConfiguration` if present.

- [ ] **Step 2: Create `templates/internal-project/config.ts`**

```typescript
import { createConfig, fromAwsProfile, fromEnv, loadEnv, numberFromEnv } from "@webiny/data-transfer";

// Loads .env from the same directory as this file. `.env*` is gitignored.
loadEnv(import.meta.url);

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_PROFILE = "default";

export default createConfig({
    source: {
        region: fromEnv("SOURCE_REGION", DEFAULT_REGION),
        credentials: fromAwsProfile({ profile: fromEnv("SOURCE_PROFILE", DEFAULT_PROFILE) }),
        dynamodb: { tableName: fromEnv("SOURCE_DDB_TABLE") },
        s3: { bucket: fromEnv("SOURCE_S3_BUCKET") },
        // Remove or set to null if your environment has no OpenSearch:
        opensearch: { tableName: fromEnv("SOURCE_OS_TABLE") }
    },
    target: {
        region: fromEnv("TARGET_REGION", DEFAULT_REGION),
        credentials: fromAwsProfile({ profile: fromEnv("TARGET_PROFILE", DEFAULT_PROFILE) }),
        dynamodb: { tableName: fromEnv("TARGET_DDB_TABLE") },
        s3: { bucket: fromEnv("TARGET_S3_BUCKET") },
        // Audit log table. Set tableName to null or omit the block to skip:
        auditLog: { dynamodb: { tableName: fromEnv("TARGET_AUDIT_LOGS_TABLE") } },
        // Remove or set to null if your target has no OpenSearch:
        opensearch: {
            endpoint: fromEnv("TARGET_OS_ENDPOINT"),
            tableName: fromEnv("TARGET_OS_TABLE"),
            service: "opensearch",
            indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
        }
    },
    pipeline: {
        segments: numberFromEnv("SEGMENTS", 4),
        modelsDir: fromEnv("MODELS_DIR", "./models"),
        presetsDir: "./presets"
    }
});
```

- [ ] **Step 3: Delete old templates**

```bash
rm /Users/brunozoric/work/webiny/webiny-v5-to-v6/templates/internal-project/ddb.transfer.config.ts
rm /Users/brunozoric/work/webiny/webiny-v5-to-v6/templates/internal-project/os.transfer.config.ts
```

- [ ] **Step 4: Finalize `projects/v5-to-v6/config.ts`**

The file already has the correct shape from an earlier sketch. Verify it matches the `createConfig` signature exactly (especially the import path — it should use `~/index.ts` since it's inside the repo). If the imports use `~/index.ts` already, it should be fine. Make any corrections needed.

- [ ] **Step 5: Run format, type-check, full test suite**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn format:fix && yarn ts-check 2>&1 | grep -v "node_modules" | head -40
```

Expected: 0 TypeScript errors.

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && yarn test 2>&1 | tail -40
```

Expected: all tests PASS, coverage thresholds met (lines ≥77%, functions ≥80%, branches ≥70%, statements ≥77%).

If any tests fail, investigate and fix before committing. Common failure areas:
- Tests that mock `loadConfig` and return `{ storage: "ddb", pipeline: { preset: "x" } }` → update mocks
- Tests using `config.storage` or `config.pipeline.preset` in assertions → remove those assertions
- Wizard tests that mock `discoverConfigs` (old function) → update to mock `discoverConfig` (new)

- [ ] **Step 6: Commit**

```bash
cd /Users/brunozoric/work/webiny/webiny-v5-to-v6 && git add src/index.ts templates/internal-project/config.ts projects/v5-to-v6/config.ts && git rm templates/internal-project/ddb.transfer.config.ts templates/internal-project/os.transfer.config.ts && git commit -m "$(cat <<'EOF'
feat: public API exports createConfig; unified config template; project config finalized

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

Spec coverage check:

| Requirement | Task |
|---|---|
| `createConfig` replaces `createDdbConfig` + `createOsConfig` | Tasks 1, 9 |
| `storage` discriminator removed | Task 1 |
| `pipeline.preset` removed from schema | Task 1 |
| Required: `source.dynamodb`, `source.s3`, `target.dynamodb`, `target.s3` | Task 1 |
| Optional: `source.opensearch`, `target.opensearch` (both-or-neither) | Task 1 |
| `loadConfig` validates with new schema | Task 2 |
| Bootstrap registers all processors always | Task 3 |
| OS client conditional on `target.opensearch != null` | Task 3 |
| Scanner/processor `storage` guards removed/replaced | Task 4 |
| Worker receives preset via `--preset` | Task 5 |
| `presetDiscovery.ts` lists built-ins + user presets | Task 6 |
| `configDiscovery.ts` simplified to `config.ts` only | Task 6 |
| `TransferWizard` adds preset selection step | Task 7 |
| `TransferWizard.run()` returns `WizardResult \| null` | Task 7 |
| `run/register.ts` uses `WizardResult` | Task 7 |
| `run/handler.ts` accepts `presetName` | Task 8 |
| `--preset` passed to worker spawn | Task 8 |
| `src/index.ts` exports `createConfig` | Task 9 |
| Unified template created | Task 9 |
| All tests green, coverage thresholds met | Task 9 |

All requirements covered. No gaps found.
