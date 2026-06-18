[Documentation](../../README.md) > [Configurations](../../README.md#configurations) > BeforeLoadPresetHook

# BeforeLoadPresetHook

Runs custom logic **before** the preset is loaded — in each worker process.

## When it runs

Each worker (`processSegment/handler.ts`) calls `beforeLoadPresetHook.execute(config)` after bootstrap and `config.register`, but before `presetLoader.load(presetName)`. Receives the resolved `MigrationConfig`.

## Default behavior

No built-in hooks are registered. The composite executes an empty list.

## Composite behavior

Hooks use `{ multiple: true }` — registering a hook **adds** to the list rather than replacing existing ones. Multiple hooks execute sequentially in registration order.

## Override example

Validate config preconditions before the preset wires up pipelines:

```typescript
// features/configValidator.ts
import { BeforeLoadPresetHook, type MigrationConfiguration } from "@webiny/data-transfer";

class ConfigValidator implements BeforeLoadPresetHook.Interface {
  public async execute(config: MigrationConfiguration): Promise<void> {
    if (!config.source.opensearch) {
      throw new Error("This project requires OpenSearch configuration.");
    }
  }
}

export const ConfigValidatorHook = BeforeLoadPresetHook.createImplementation({
  implementation: ConfigValidator,
  dependencies: []
});
```

Register it in the config:

```typescript
export default createConfig({
  // ...
  register: async container => {
    container.register(ConfigValidatorHook);
  }
});
```

## API

```typescript
interface BeforeLoadPresetHook.Interface {
    execute(config: MigrationConfiguration): Promise<void>;
}
```

**Source:** `src/features/PresetLifecycle/`
