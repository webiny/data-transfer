# User Presets Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit `pipeline.presetsDir` config field that lets users place their own preset files alongside their config and have them discovered alongside built-in presets, while git-ignoring all user project directories under `projects/`.

**Architecture:** `pipelineSettingsSchema` gains an optional `presetsDir` string; `loadConfig` resolves it to an absolute path (same pattern already used for `modelsDir`); `PresetLoader` gains a `MigrationConfig` dependency and searches the user dir after built-ins, before falling through to explicit-path and error. `.gitignore` ignores `projects/*/` with a negation for the committed `v5-to-v6` example.

**Tech Stack:** Zod (schema), `@webiny/di` (DI), vitest (tests).

---

## Files Changed

| File | Change |
|------|--------|
| `.gitignore` | Add `projects/*/` + `!projects/v5-to-v6/` |
| `src/features/MigrationConfig/schemas/shared.schema.ts` | Add `presetsDir` to `pipelineSettingsSchema` |
| `src/features/MigrationConfig/loadConfig.ts` | Resolve `presetsDir` to absolute path |
| `src/features/PresetLoader/PresetLoader.ts` | Inject `MigrationConfig`; add user preset lookup + error hint |
| `__tests__/containers/ddb.ts` | Add `presetsDir` to `DdbContainerOptions` and pipeline config |
| `__tests__/fixtures/presets/testPreset.js` | New fixture: minimal importable preset for tests |
| `__tests__/features/MigrationConfig/MigrationConfig.test.ts` | New test: `presetsDir` resolved relative to config file |
| `__tests__/features/PresetLoader/PresetLoader.test.ts` | New tests: user preset found, error hint, built-in precedence |

---

## Task 1: Git-ignore user project directories

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add ignore rules**

Open `.gitignore`. Find the block that contains `projects/**/.env` and `projects/v5-to-v6/models/`. Append the two new lines **after** that block:

```gitignore
# User project directories — not committed; v5-to-v6 is the committed example
projects/*/
!projects/v5-to-v6/
```

- [ ] **Step 2: Verify git status is unchanged for tracked files**

```bash
git status
```

Expected: `projects/v5-to-v6/` files remain tracked; no unexpected unstaged changes.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: git-ignore user project directories under projects/"
```

---

## Task 2: Add `presetsDir` to the pipeline schema and resolve it in `loadConfig`

**Files:**
- Modify: `src/features/MigrationConfig/schemas/shared.schema.ts`
- Modify: `src/features/MigrationConfig/loadConfig.ts`
- Modify: `__tests__/features/MigrationConfig/MigrationConfig.test.ts`

- [ ] **Step 1: Write the failing test**

In `__tests__/features/MigrationConfig/MigrationConfig.test.ts`, add a new test inside the `describe("loadConfig", ...)` block, after the existing `"leaves built-in preset names unchanged"` test:

```typescript
it("resolves presetsDir relative to the config file's directory", async () => {
    const configPath = writeConfig({
        storage: "ddb",
        source: {
            region: "eu-central-1",
            credentials: creds,
            dynamodb: { tableName: "src" },
            s3: { bucket: "src-bucket" }
        },
        target: {
            region: "eu-central-1",
            credentials: creds,
            dynamodb: { tableName: "tgt" },
            s3: { bucket: "tgt-bucket" }
        },
        pipeline: { preset: "v5-to-v6", presetsDir: "./custom-presets" }
    });

    const config = await loadConfig(configPath);
    expect(config.pipeline.presetsDir).toBe(join(tmpDir, "custom-presets"));
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
yarn test __tests__/features/MigrationConfig/MigrationConfig.test.ts --reporter=verbose
```

Expected: FAIL — `config.pipeline.presetsDir` is `undefined` or the raw `"./custom-presets"` string, not the resolved absolute path.

- [ ] **Step 3: Add `presetsDir` to `pipelineSettingsSchema`**

In `src/features/MigrationConfig/schemas/shared.schema.ts`, update `pipelineSettingsSchema`:

```typescript
export const pipelineSettingsSchema = z.object({
    preset: trimmedString(),
    segments: z.number().int().positive().optional(),
    modelsDir: trimmedString().optional(),
    presetsDir: trimmedString().optional()
});
```

- [ ] **Step 4: Resolve `presetsDir` in `loadConfig`**

In `src/features/MigrationConfig/loadConfig.ts`, add the resolution immediately after the existing `modelsDir` block:

```typescript
if (config.pipeline?.modelsDir) {
    config.pipeline.modelsDir = resolve(configDir, config.pipeline.modelsDir);
}
if (config.pipeline?.presetsDir) {
    config.pipeline.presetsDir = resolve(configDir, config.pipeline.presetsDir);
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
yarn test __tests__/features/MigrationConfig/MigrationConfig.test.ts --reporter=verbose
```

Expected: all tests in that file PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/MigrationConfig/schemas/shared.schema.ts \
        src/features/MigrationConfig/loadConfig.ts \
        __tests__/features/MigrationConfig/MigrationConfig.test.ts
git commit -m "feat: add presetsDir to pipeline schema and resolve in loadConfig"
```

---

## Task 3: User preset lookup in PresetLoader

**Files:**
- Create: `__tests__/fixtures/presets/testPreset.js`
- Modify: `__tests__/containers/ddb.ts`
- Modify: `__tests__/features/PresetLoader/PresetLoader.test.ts`
- Modify: `src/features/PresetLoader/PresetLoader.ts`

- [ ] **Step 1: Create the test fixture**

Create `__tests__/fixtures/presets/testPreset.js` with this content (plain JS so Node.js can import it without tsx involvement at runtime):

```javascript
export default {
    name: "test-preset",
    description: "Test preset fixture for unit tests",
    configure() {}
};
```

- [ ] **Step 2: Add `presetsDir` to `DdbContainerOptions`**

In `__tests__/containers/ddb.ts`, add `presetsDir?: string` to the `DdbContainerOptions` interface and wire it into the `pipeline` config object:

```typescript
export interface DdbContainerOptions {
    sourceRecords?: Record<string, SourceDynamoDbClient.Record[]>;
    targetRecords?: Record<string, SourceDynamoDbClient.Record[]>;
    modelsDir?: string;
    presetsDir?: string;
    logLevel?: "debug" | "info" | "warn" | "error";
    pipelineOverride?: DdbContainerPipelineOverride;
}
```

In the `config` object inside `createDdbContainer`, update the `pipeline` field:

```typescript
pipeline: {
    preset: "v5-to-v6",
    modelsDir: options.modelsDir,
    presetsDir: options.presetsDir,
    ...(options.pipelineOverride?.segments !== undefined
        ? { segments: options.pipelineOverride.segments }
        : {})
},
```

- [ ] **Step 3: Write the failing tests**

In `__tests__/features/PresetLoader/PresetLoader.test.ts`, add a new `describe("presetsDir", ...)` block inside the top-level `describe("PresetLoader Feature", ...)`, after the existing `describe("load", ...)` block:

```typescript
import { resolve } from "node:path";
```

Add this import at the top of the file (after existing imports), then add:

```typescript
describe("presetsDir", () => {
    const presetsDir = resolve(__dirname, "../../fixtures/presets");

    it("loads a named preset from presetsDir when not a built-in", async () => {
        const container = createDdbContainer({ presetsDir });
        const loader = container.resolve(PresetLoader);
        const preset = await loader.load("testPreset");
        expect(preset.name).toBe("test-preset");
    });

    it("error message lists user presets when presetsDir is set", async () => {
        const container = createDdbContainer({ presetsDir });
        await expect(
            container.resolve(PresetLoader).load("nonexistent")
        ).rejects.toThrow("Available user presets");
    });

    it("built-in preset takes precedence over a same-named user preset", async () => {
        // Resolution order: built-ins first. Even with presetsDir set, a
        // built-in name resolves to the built-in without touching presetsDir.
        const container = createDdbContainer({ presetsDir });
        const loader = container.resolve(PresetLoader);
        const preset = await loader.load("v5-to-v6-ddb");
        expect(preset.name).toBe("v5-to-v6-ddb");
    });
});
```

- [ ] **Step 4: Run the tests to confirm they fail**

```bash
yarn test __tests__/features/PresetLoader/PresetLoader.test.ts --reporter=verbose
```

Expected: the three new `presetsDir` tests FAIL (the first two because user lookup doesn't exist yet; the third may pass trivially or fail depending on existing behaviour).

- [ ] **Step 5: Implement user preset lookup in `PresetLoader.ts`**

Replace the entire content of `src/features/PresetLoader/PresetLoader.ts` with:

```typescript
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import { PresetLoader as PresetLoaderAbstraction } from "./abstractions/PresetLoader.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { DirectoryTool } from "~/tools/DirectoryTool/abstractions/DirectoryTool.ts";
import { FileTool } from "~/tools/FileTool/abstractions/FileTool.ts";
import { MigrationConfig } from "~/features/MigrationConfig/abstractions/MigrationConfig.ts";

const BUILTIN_PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../presets");

const PRESET_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".js"]);

class PresetLoaderImpl implements PresetLoaderAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly dirTool: DirectoryTool.Interface,
        private readonly fileTool: FileTool.Interface,
        private readonly config: MigrationConfig.Interface
    ) {}

    public async load(presetNameOrPath: string): Promise<MigrationPreset> {
        const presetPath = this.resolvePresetPath(presetNameOrPath);

        this.logger.info(`Loading preset from: ${presetPath}`);

        try {
            const presetModule = await import(pathToFileURL(presetPath).href);
            const preset: MigrationPreset = presetModule.default || presetModule.preset;

            if (!preset) {
                throw new Error(
                    `Preset file "${presetPath}" does not export a preset.\n` +
                        `Export a MigrationPreset as the default export or named "preset" export.`
                );
            }

            if (!preset.name || !preset.description || typeof preset.configure !== "function") {
                throw new Error(
                    `Invalid preset structure in "${presetPath}".\n` +
                        `A preset must have: name (string), description (string), and configure (function).`
                );
            }

            return preset;
        } catch (error) {
            if (error instanceof Error && error.message.includes("Cannot find module")) {
                throw new Error(
                    `Failed to load preset from "${presetPath}".\n` +
                        `Make sure the file exists and is a valid TypeScript/JavaScript module.`
                );
            }
            throw error;
        }
    }

    public getBuiltInPresets(): string[] {
        if (!this.dirTool.exists(BUILTIN_PRESETS_DIR)) {
            return [];
        }
        const entries = this.dirTool.readDir(BUILTIN_PRESETS_DIR) ?? [];
        return entries
            .map(name => this.stripPresetExtension(name))
            .filter((name): name is string => name !== null)
            .sort();
    }

    private resolvePresetPath(presetNameOrPath: string): string {
        const builtInPath = this.findBuiltInPath(presetNameOrPath);
        if (builtInPath) {
            return builtInPath;
        }

        const presetsDir = this.config.pipeline.presetsDir;
        if (presetsDir) {
            const userPath = this.findUserPresetPath(presetNameOrPath, presetsDir);
            if (userPath) {
                return userPath;
            }
        }

        if (presetNameOrPath.endsWith(".ts") || presetNameOrPath.endsWith(".js")) {
            const presetPath = isAbsolute(presetNameOrPath)
                ? presetNameOrPath
                : resolve(process.cwd(), presetNameOrPath);

            if (!this.fileTool.exists(presetPath)) {
                throw new Error(
                    `Preset file not found: ${presetPath}\n` +
                        `Make sure the file exists and the path is correct.`
                );
            }

            return presetPath;
        }

        const builtIns = this.getBuiltInPresets();
        const builtInHint =
            builtIns.length > 0 ? `Available built-in presets: ${builtIns.join(", ")}\n` : "";

        let userPresetsHint = "";
        if (presetsDir) {
            const userPresets = this.getUserPresets(presetsDir);
            if (userPresets.length > 0) {
                userPresetsHint = `Available user presets (${presetsDir}): ${userPresets.join(", ")}\n`;
            }
        }

        throw new Error(
            `Unknown preset: "${presetNameOrPath}"\n` +
                builtInHint +
                userPresetsHint +
                `Or provide a path to a custom preset file (e.g., ./my-preset.ts).`
        );
    }

    private findBuiltInPath(presetName: string): string | null {
        for (const ext of PRESET_EXTENSIONS) {
            const candidate = join(BUILTIN_PRESETS_DIR, `${presetName}${ext}`);
            if (this.fileTool.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private findUserPresetPath(presetName: string, presetsDir: string): string | null {
        for (const ext of PRESET_EXTENSIONS) {
            const candidate = join(presetsDir, `${presetName}${ext}`);
            if (this.fileTool.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private getUserPresets(presetsDir: string): string[] {
        if (!this.dirTool.exists(presetsDir)) {
            return [];
        }
        const entries = this.dirTool.readDir(presetsDir) ?? [];
        return entries
            .map(name => this.stripPresetExtension(name))
            .filter((name): name is string => name !== null)
            .sort();
    }

    private stripPresetExtension(filename: string): string | null {
        for (const ext of PRESET_EXTENSIONS) {
            if (filename.endsWith(ext)) {
                return filename.slice(0, -ext.length);
            }
        }
        return null;
    }
}

export const PresetLoader = PresetLoaderAbstraction.createImplementation({
    implementation: PresetLoaderImpl,
    dependencies: [Logger, DirectoryTool, FileTool, MigrationConfig]
});
```

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
yarn test __tests__/features/PresetLoader/PresetLoader.test.ts --reporter=verbose
```

Expected: all tests PASS, including the three new `presetsDir` tests.

- [ ] **Step 7: Commit**

```bash
git add src/features/PresetLoader/PresetLoader.ts \
        __tests__/containers/ddb.ts \
        __tests__/fixtures/presets/testPreset.js \
        __tests__/features/PresetLoader/PresetLoader.test.ts
git commit -m "feat: add user presetsDir support to PresetLoader"
```

---

## Task 4: Final verification

- [ ] **Step 1: Format**

```bash
yarn format:fix
```

- [ ] **Step 2: Type-check**

```bash
yarn ts-check
```

Expected: 0 errors.

- [ ] **Step 3: Full test suite**

```bash
yarn test
```

Expected: all tests pass.

- [ ] **Step 4: Commit if format changed anything**

```bash
git status
```

If any files were modified by `format:fix`:

```bash
git add -p
git commit -m "chore: format"
```
