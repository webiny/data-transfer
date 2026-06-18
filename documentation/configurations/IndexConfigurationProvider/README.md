# IndexConfigurationProvider

Controls the mappings and settings applied to OpenSearch indexes during a transfer.

## When it runs

`OsProcessor` calls `getConfiguration(indexName)` every time it touches an index:

- **New index** — the returned `mappings` and `settings` are passed to the `createIndex` call.
- **Existing index** — the returned `settings` are applied via `putIndexSettings` before data is written.

In both cases the transfer engine overrides `index.refresh_interval` to `"-1"` (disabled during transfer, restored after). All other settings from the provider are preserved.

## Default behavior

The built-in implementation calls `getBaseConfiguration()` from `@webiny/api-opensearch` and returns its mappings. No custom settings are applied.

## Override example

Increase the total fields limit and number of shards for all indexes:

```typescript
// features/myIndexConfig.ts
import { getBaseConfiguration } from "@webiny/api-opensearch/indexConfiguration/index.js";
import { IndexConfigurationProvider } from "@webiny/data-transfer";

class MyIndexConfigurationProvider implements IndexConfigurationProvider.Interface {
  public getConfiguration(_indexName: string): IndexConfigurationProvider.Configuration {
    const base = getBaseConfiguration();
    return {
      mappings: base.mappings as Record<string, unknown> | undefined,
      settings: {
        index: {
          "mapping.total_fields.limit": 2000,
          number_of_shards: 2
        }
      }
    };
  }
}

export const MyIndexConfigurationProviderImpl = IndexConfigurationProvider.createImplementation({
  implementation: MyIndexConfigurationProvider,
  dependencies: []
});
```

Register it in the config:

```typescript
import { createConfig, loadEnv, fromEnv, fromAwsProfile } from "@webiny/data-transfer";
import { MyIndexConfigurationProviderImpl } from "./features/myIndexConfig.ts";

loadEnv(import.meta.url);

export default createConfig({
  // ... source, target, pipeline ...
  register: async container => {
    container.register(MyIndexConfigurationProviderImpl);
  }
});
```

## Per-index configuration

The `indexName` parameter lets you return different settings per index:

```typescript
public getConfiguration(indexName: string): IndexConfigurationProvider.Configuration {
    const base = getBaseConfiguration();
    const mappings = base.mappings as Record<string, unknown> | undefined;

    if (indexName.startsWith("root-headless-cms-")) {
        return {
            mappings,
            settings: { index: { "mapping.total_fields.limit": 5000 } }
        };
    }

    return { mappings };
}
```

## API

```typescript
interface IndexConfigurationProvider.Interface {
    getConfiguration(indexName: string): IndexConfigurationProvider.Configuration;
}

interface IndexConfigurationProvider.Configuration {
    mappings?: Record<string, unknown>;
    settings?: Record<string, unknown>;
}
```

**Source:** `src/features/IndexConfigurationProvider/`
