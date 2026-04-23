# OS Index Prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required `indexPrefix` field to the OS transfer config's `target.opensearch` and inject it as `OPENSEARCH_INDEX_PREFIX` before workers start so `updateOsIndex`'s `configurations.es()` call produces correctly-prefixed target index names.

**Architecture:** A Zod schema change makes `indexPrefix` required on `target.opensearch`; empty string means no prefix. A new `OsIndexPrefixHook` implementing `BeforeTransferHook` writes the value to `process.env.OPENSEARCH_INDEX_PREFIX` in the orchestrator before workers are spawned — workers inherit it via standard process environment.

**Tech Stack:** TypeScript, Zod, `@webiny/di`, Vitest

---

### Task 1: Schema — add `indexPrefix` to `osTargetAccountConfigSchema.opensearch`

**Files:**
- Modify: `src/features/MigrationConfig/schemas/os.schema.ts`
- Modify: `__tests__/features/MigrationConfig/createTransfer.test.ts`
- Modify: `__tests__/containers/os.ts`

- [ ] **Step 1: Write three failing tests**

Add at the end of the `describe("createOsTransfer")` block in `__tests__/features/MigrationConfig/createTransfer.test.ts`:

```typescript
it("throws when target indexPrefix is missing", () => {
    expect(() =>
        createOsTransfer({
            source: {
                region: "us-east-1",
                credentials: creds,
                dynamodb: { tableName: "src-primary" },
                opensearch: { tableName: "src-es" }
            },
            target: {
                region: "eu-central-1",
                credentials: creds,
                opensearch: {
                    endpoint: "https://search-xxx.es.amazonaws.com",
                    tableName: "tgt-es",
                    service: "opensearch"
                } as any
            },
            pipeline: { preset: "v5-to-v6-os" }
        })
    ).toThrow();
});

it("accepts empty string indexPrefix (no prefix)", () => {
    const config = createOsTransfer({
        source: {
            region: "us-east-1",
            credentials: creds,
            dynamodb: { tableName: "src-primary" },
            opensearch: { tableName: "src-es" }
        },
        target: {
            region: "eu-central-1",
            credentials: creds,
            opensearch: {
                endpoint: "https://search-xxx.es.amazonaws.com",
                tableName: "tgt-es",
                service: "opensearch",
                indexPrefix: ""
            }
        },
        pipeline: { preset: "v5-to-v6-os" }
    });
    expect(config.target.opensearch.indexPrefix).toBe("");
});

it("accepts and trims a non-empty indexPrefix", () => {
    const config = createOsTransfer({
        source: {
            region: "us-east-1",
            credentials: creds,
            dynamodb: { tableName: "src-primary" },
            opensearch: { tableName: "src-es" }
        },
        target: {
            region: "eu-central-1",
            credentials: creds,
            opensearch: {
                endpoint: "https://search-xxx.es.amazonaws.com",
                tableName: "tgt-es",
                service: "opensearch",
                indexPrefix: "  my-prefix-  "
            }
        },
        pipeline: { preset: "v5-to-v6-os" }
    });
    expect(config.target.opensearch.indexPrefix).toBe("my-prefix-");
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
yarn test __tests__/features/MigrationConfig/createTransfer.test.ts
```

Expected: first test FAILS (no throw), second/third FAIL (property does not exist on type).

- [ ] **Step 3: Add `indexPrefix` to the schema**

In `src/features/MigrationConfig/schemas/os.schema.ts`, update `osTargetAccountConfigSchema`:

```typescript
const osTargetAccountConfigSchema = z.object({
    region: trimmedString(),
    credentials: credentialsOrProviderSchema,
    opensearch: z.object({
        // Zod's `.url()` doesn't trim — wrap through trimmedString first.
        endpoint: trimmedString().url(),
        tableName: trimmedString(),
        service: z.enum(["opensearch", "opensearch-serverless"]),
        indexPrefix: z.string().trim()
    })
});
```

Note: use `z.string().trim()` — NOT `trimmedString()`. The `trimmedString()` helper requires `.min(1)` which would reject empty string. Empty string is valid here (means no prefix).

- [ ] **Step 4: Fix all existing `createOsTransfer` calls in the test file**

In `__tests__/features/MigrationConfig/createTransfer.test.ts`, update every `target.opensearch` object that doesn't already include `indexPrefix`. Add `indexPrefix: ""` to each:

In `describe("createOsTransfer")` — update these four tests (the two error-throwing tests at the bottom of that block don't need it since they throw before reaching that field):

```typescript
// "should return a valid os config with storage set"
opensearch: {
    endpoint: "https://search-xxx.es.amazonaws.com",
    tableName: "tgt-es",
    service: "opensearch",
    indexPrefix: ""
}

// "should accept opensearch-serverless service"
opensearch: {
    endpoint: "https://xxx.aoss.amazonaws.com",
    tableName: "tgt-es",
    service: "opensearch-serverless",
    indexPrefix: ""
}
```

In `describe("createOsTransfer — source/target collision guard")`, update `baseOsTarget`:

```typescript
const baseOsTarget = {
    region: "eu-central-1",
    credentials: creds,
    opensearch: {
        endpoint: "https://search-xxx.example.com",
        tableName: "tgt-es-table",
        service: "opensearch" as const,
        indexPrefix: ""
    }
};
```

- [ ] **Step 5: Update `createOsContainer` to accept and forward `indexPrefix`**

In `__tests__/containers/os.ts`, add `indexPrefix?: string` to `OsContainerOptions` and thread it into the config:

```typescript
export interface OsContainerOptions {
    sourceRecords?: Record<string, SourceDynamoDbClient.Record[]>;
    modelsDir?: string;
    logLevel?: "debug" | "info" | "warn" | "error";
    pipelineOverride?: OsContainerPipelineOverride;
    indexPrefix?: string;
}

export function createOsContainer(options: OsContainerOptions = {}): Container {
    // ... existing code ...
    const config: MigrationConfig.Interface = {
        storage: "os",
        source: {
            region: "us-east-1",
            credentials: DEFAULT_CREDS,
            dynamodb: { tableName: "source-primary" },
            opensearch: { tableName: "source-os" }
        },
        target: {
            region: "eu-central-1",
            credentials: DEFAULT_CREDS,
            opensearch: {
                endpoint: "https://es.example.com",
                tableName: "target-os",
                service: "opensearch" as const,
                indexPrefix: options.indexPrefix ?? ""
            }
        },
        // ... rest of config unchanged ...
    };
```

- [ ] **Step 6: Run all config tests and confirm green**

```bash
yarn test __tests__/features/MigrationConfig/createTransfer.test.ts
```

Expected: all pass.

- [ ] **Step 7: Run the full test suite to check for regressions**

```bash
yarn test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/features/MigrationConfig/schemas/os.schema.ts \
        __tests__/features/MigrationConfig/createTransfer.test.ts \
        __tests__/containers/os.ts
git commit -m "feat(schema): add required indexPrefix to target.opensearch config"
```

---

### Task 2: `OsIndexPrefixHook` — implement and register

**Files:**
- Create: `src/features/OsProcessor/OsIndexPrefixHook.ts`
- Modify: `src/features/OsProcessor/feature.ts`
- Create: `__tests__/features/OsProcessor/OsIndexPrefixHook.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/OsProcessor/OsIndexPrefixHook.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOsContainer } from "../../containers/index.ts";
import { BeforeTransferHook } from "~/features/TransferLifecycle/index.ts";

describe("OsIndexPrefixHook", () => {
    let savedPrefix: string | undefined;

    beforeEach(() => {
        savedPrefix = process.env.OPENSEARCH_INDEX_PREFIX;
    });

    afterEach(() => {
        if (savedPrefix === undefined) {
            delete process.env.OPENSEARCH_INDEX_PREFIX;
        } else {
            process.env.OPENSEARCH_INDEX_PREFIX = savedPrefix;
        }
    });

    it("sets OPENSEARCH_INDEX_PREFIX to the configured target prefix", async () => {
        const container = createOsContainer({ indexPrefix: "tenant-" });
        const hook = container.resolve(BeforeTransferHook);
        await hook.execute();
        expect(process.env.OPENSEARCH_INDEX_PREFIX).toBe("tenant-");
    });

    it("sets OPENSEARCH_INDEX_PREFIX to empty string when prefix is empty", async () => {
        const container = createOsContainer({ indexPrefix: "" });
        const hook = container.resolve(BeforeTransferHook);
        await hook.execute();
        expect(process.env.OPENSEARCH_INDEX_PREFIX).toBe("");
    });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
yarn test __tests__/features/OsProcessor/OsIndexPrefixHook.test.ts
```

Expected: FAIL — `process.env.OPENSEARCH_INDEX_PREFIX` is not set by the hook (hook doesn't exist yet).

- [ ] **Step 3: Create `OsIndexPrefixHook.ts`**

Create `src/features/OsProcessor/OsIndexPrefixHook.ts`:

```typescript
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";
import { BeforeTransferHook } from "~/features/TransferLifecycle/index.ts";

class OsIndexPrefixHookImpl implements BeforeTransferHook.Interface {
    public constructor(private readonly config: MigrationConfig.Interface) {}

    public async execute(): Promise<void> {
        if (this.config.storage !== "os") {
            return;
        }
        process.env.OPENSEARCH_INDEX_PREFIX = this.config.target.opensearch.indexPrefix;
    }
}

export const OsIndexPrefixHook = BeforeTransferHook.createImplementation({
    implementation: OsIndexPrefixHookImpl,
    dependencies: [MigrationConfig]
});
```

- [ ] **Step 4: Register the hook in `OsProcessorFeature`**

Update `src/features/OsProcessor/feature.ts`:

```typescript
import { createFeature } from "~/base/index.ts";
import { OsProcessor } from "./OsProcessor.ts";
import { OsIndexPrefixHook } from "./OsIndexPrefixHook.ts";

export const OsProcessorFeature = createFeature({
    name: "Core/OsProcessorFeature",
    register(container) {
        container.register(OsProcessor).inSingletonScope();
        container.register(OsIndexPrefixHook);
    }
});
```

- [ ] **Step 5: Run the hook tests to confirm green**

```bash
yarn test __tests__/features/OsProcessor/OsIndexPrefixHook.test.ts
```

Expected: both pass.

- [ ] **Step 6: Run the full suite to confirm no regressions**

```bash
yarn test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/OsProcessor/OsIndexPrefixHook.ts \
        src/features/OsProcessor/feature.ts \
        __tests__/features/OsProcessor/OsIndexPrefixHook.test.ts
git commit -m "feat(os): add OsIndexPrefixHook to set OPENSEARCH_INDEX_PREFIX before transfer"
```

---

### Task 3: Update templates and JSDoc

**Files:**
- Modify: `templates/projects/example/os.transfer.config.ts`
- Modify: `projects/v5-to-v6/os.transfer.config.ts`
- Modify: `src/features/MigrationConfig/createOsTransfer.ts`

- [ ] **Step 1: Update the example template**

In `templates/projects/example/os.transfer.config.ts`, add `indexPrefix` to `target.opensearch`:

```typescript
opensearch: {
    endpoint: fromEnv("TARGET_OS_ENDPOINT"),
    tableName: fromEnv("TARGET_OS_TABLE"),
    service: "opensearch",
    indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
}
```

- [ ] **Step 2: Update the internal project config**

In `projects/v5-to-v6/os.transfer.config.ts`, add `indexPrefix` to `target.opensearch`:

```typescript
opensearch: {
    endpoint: fromEnv("TARGET_OS_ENDPOINT"),
    tableName: fromEnv("TARGET_OS_TABLE"),
    service: "opensearch",
    indexPrefix: fromEnv("TARGET_OS_INDEX_PREFIX", "")
}
```

- [ ] **Step 3: Update the JSDoc example in `createOsTransfer.ts`**

In `src/features/MigrationConfig/createOsTransfer.ts`, update the `@example` block to include `indexPrefix`:

```typescript
 * @example
 * ```typescript
 * import { createOsTransfer } from "@webiny/data-transfer";
 *
 * export default createOsTransfer({
 *   source: {
 *     region: "us-east-1",
 *     credentials: { accessKeyId: "...", secretAccessKey: "..." },
 *     dynamodb: { tableName: "webiny-v5-table" },
 *     opensearch: { tableName: "webiny-v5-es-table" }
 *   },
 *   target: {
 *     region: "us-east-1",
 *     credentials: { accessKeyId: "...", secretAccessKey: "..." },
 *     opensearch: {
 *       endpoint: "https://search-xxx.us-east-1.es.amazonaws.com",
 *       tableName: "webiny-v6-es-table",
 *       service: "opensearch",
 *       indexPrefix: ""
 *     }
 *   },
 *   pipeline: { preset: "v5-to-v6-os", segments: 4 }
 * });
 * ```
```

- [ ] **Step 4: Run the full suite one final time**

```bash
yarn test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add templates/projects/example/os.transfer.config.ts \
        projects/v5-to-v6/os.transfer.config.ts \
        src/features/MigrationConfig/createOsTransfer.ts
git commit -m "docs(os): add indexPrefix to config templates and JSDoc example"
```
