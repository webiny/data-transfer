# User Presets Directory Design

**Date:** 2026-05-05
**Branch:** bruno/refactor/user-presets
**Status:** Approved

## Problem

The repo currently ships a single `projects/v5-to-v6/` example project. Users who want to run transfers against their own environments must either modify that directory (tracked in git, pollutes commits) or maintain their own fork. There is no first-class way to have an untracked project directory that references both built-in presets and user-authored presets.

## Goal

Allow users to create project directories under `projects/` that are git-ignored by default, and to place their own preset files under `projects/<name>/presets/` (or any other directory) via an explicit `pipeline.presetsDir` config field.

## Design

### 1. Schema — `pipelineSettingsSchema`

Add one optional field to `pipelineSettingsSchema` in `src/features/MigrationConfig/schemas/shared.schema.ts`:

```typescript
presetsDir: trimmedString().optional()
```

Same shape as `modelsDir`. If omitted, only built-in presets are available (no behaviour change for existing configs).

### 2. Path resolution — `loadConfig.ts`

`loadConfig` already resolves `modelsDir` and path-shaped `preset` values to absolute paths relative to the config file's directory. Add the same pattern for `presetsDir`:

```typescript
if (config.pipeline?.presetsDir) {
    config.pipeline.presetsDir = resolve(configDir, config.pipeline.presetsDir);
}
```

By the time `MigrationConfig` is registered in the DI container, `presetsDir` is an absolute path. No consumer needs to know the config file location.

### 3. PresetLoader

**Dependency addition:** `PresetLoader` gains `MigrationConfig` as a 4th injected dependency (after `Logger`, `DirectoryTool`, `FileTool`). This is consistent with how other features read config values.

**Resolution order in `resolvePresetPath`:**
1. Built-in presets (`src/presets/`) — checked first, matching current behaviour.
2. User preset dir (`config.pipeline.presetsDir`) — checked only if set; uses the same extension loop as `findBuiltInPath`.
3. Explicit file path — if the name ends in `.ts` or `.js`, treated as a path and resolved from CWD (current behaviour).
4. Error — lists both built-in and user preset names in the hint.

**New private method:**

```typescript
private findUserPresetPath(presetName: string, presetsDir: string): string | null {
    for (const ext of PRESET_EXTENSIONS) {
        const candidate = join(presetsDir, `${presetName}${ext}`);
        if (this.fileTool.exists(candidate)) {
            return candidate;
        }
    }
    return null;
}
```

Mirrors the existing `findBuiltInPath` — same logic, different root directory.

**Error message** (when both built-in and user presets are known):

```
Unknown preset: "my-preset"
Available built-in presets: v5-to-v6-ddb, v5-to-v6-os
Available user presets (./presets): my-other-preset
Or provide a path to a custom preset file (e.g., ./my-preset.ts).
```

When `presetsDir` is not set, the message is unchanged.

**No interface change.** `PresetLoader.Interface` stays as-is — `load(presetNameOrPath)` and `getBuiltInPresets()`. The `presetsDir` lookup is an implementation detail.

### 4. Git — `.gitignore`

Append after the existing `projects/**/.env` and `projects/v5-to-v6/models/` lines:

```gitignore
# User project directories — not committed; v5-to-v6 is the committed example
projects/*/
!projects/v5-to-v6/
```

`projects/*/` ignores all immediate subdirectories of `projects/`. `!projects/v5-to-v6/` un-ignores the committed example so its existing specific rules (`models/`, `.env`) continue to apply. Existing tracked files in `v5-to-v6/` are unaffected (git never untracks already-tracked files from .gitignore alone).

## Usage (after this change)

```typescript
// projects/my-env/ddb.transfer.config.ts
export default createDdbConfig({
    source: { ... },
    target: { ... },
    pipeline: {
        preset: "v5-to-v6-ddb",          // built-in — works as before
        presetsDir: "./presets",           // scanned after built-ins
        segments: 4
    }
});
```

Or using a user preset:

```typescript
pipeline: {
    preset: "my-custom-preset",   // found in ./presets/my-custom-preset.ts
    presetsDir: "./presets",
}
```

`presetsDir` is relative to the config file's location and resolved to an absolute path at load time.

## Out of Scope

- Auto-discovering a `presets/` sibling directory without explicit config (option A, rejected in favour of explicitness).
- `init` command changes — the scaffolded config template may get a commented-out `presetsDir` line as a follow-up, but it is not part of this change.
- Listing user presets via a new public API method on `PresetLoader.Interface`.

## Files Changed

| File | Change |
|------|--------|
| `src/features/MigrationConfig/schemas/shared.schema.ts` | Add `presetsDir` to `pipelineSettingsSchema` |
| `src/features/MigrationConfig/loadConfig.ts` | Resolve `presetsDir` to absolute path |
| `src/features/PresetLoader/PresetLoader.ts` | Inject `MigrationConfig`; add user preset lookup; update error hint |
| `.gitignore` | `projects/*/` + `!projects/v5-to-v6/` |
