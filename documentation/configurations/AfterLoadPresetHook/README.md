[Documentation](../../README.md) > [Configurations](../../README.md#configurations) > AfterLoadPresetHook

# AfterLoadPresetHook

Runs custom logic **after** the preset is loaded and configured — in each worker process.

## When it runs

Each worker (`processSegment/handler.ts`) calls `afterLoadPresetHook.execute(config, preset)` after `preset.configure({...})` completes, before the pipeline runner starts processing records. Receives both the resolved config and the loaded preset.

## Default behavior

One built-in hook is registered: **`ModelPreloaderHook`** — preloads tenant/locale pairs from the source table and then calls `modelProvider.preloadModels(tenantLocales)`. This ensures CMS model definitions are available to transformers before any records flow.

## Composite behavior

Hooks use `{ multiple: true }` — registering a hook **adds** to the list rather than replacing existing ones. Your hook runs after the built-in `ModelPreloaderHook`. Multiple hooks execute sequentially in registration order.

## Override example

Log which preset was loaded and how many pipelines it registered:

```typescript
// features/presetLogger.ts
import {
  AfterLoadPresetHook,
  type MigrationConfiguration,
  type MigrationPreset
} from "@webiny/data-transfer";

class PresetLogger implements AfterLoadPresetHook.Interface {
  public async execute(_config: MigrationConfiguration, preset: MigrationPreset): Promise<void> {
    console.log(`Loaded preset: ${preset.name} — ${preset.description}`);
  }
}

export const PresetLoggerHook = AfterLoadPresetHook.createImplementation({
  implementation: PresetLogger,
  dependencies: []
});
```

Register it in the config:

```typescript
export default createConfig({
  // ...
  register: async container => {
    container.register(PresetLoggerHook);
  }
});
```

## API

```typescript
interface AfterLoadPresetHook.Interface {
    execute(config: MigrationConfiguration, preset: MigrationPreset): Promise<void>;
}
```

**Source:** `src/features/PresetLifecycle/`
