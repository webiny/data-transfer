[Documentation](../../README.md) > [Configurations](../../README.md#configurations) > IndexConfigurationProvider

# IndexConfigurationProvider

Controls the mappings and settings applied to OpenSearch indexes during a transfer.

## When it runs

`OsProcessor` calls `getConfiguration(indexName, base)` every time it touches an index. The `base` parameter contains the default Webiny mappings — your implementation receives it and returns a (possibly modified) configuration:

- **New index** — the returned `mappings` and `settings` are passed to the `createIndex` call.
- **Existing index** — the returned `settings` are applied via `putIndexSettings` before data is written.

In both cases the transfer engine overrides `index.refresh_interval` to `"-1"` (disabled during transfer, restored after). All other settings from the provider are preserved.

## Default behavior

The built-in implementation returns the `base` configuration unchanged — the default Webiny mappings with no custom settings.

## Override example

Increase the total fields limit and number of shards for all indexes:

```typescript
// features/myIndexConfig.ts
import { IndexConfigurationProvider } from "@webiny/data-transfer";

class MyIndexConfigurationProvider implements IndexConfigurationProvider.Interface {
  public getConfiguration(
    _indexName: string,
    base: IndexConfigurationProvider.Configuration
  ): IndexConfigurationProvider.Configuration {
    return {
      ...base,
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
import { createConfig, loadEnv } from "@webiny/data-transfer";
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
public getConfiguration(
    indexName: string,
    base: IndexConfigurationProvider.Configuration
): IndexConfigurationProvider.Configuration {
    if (indexName.startsWith("root-headless-cms-")) {
        return {
            ...base,
            settings: { index: { "mapping.total_fields.limit": 5000 } }
        };
    }

    return base;
}
```

## API

```typescript
interface IndexConfigurationProvider.Interface {
    getConfiguration(indexName: string, base: Configuration): Configuration;
}

// Configuration uses the real OpenSearch SDK types from @webiny/api-opensearch:
//   mappings → TypeMapping (from @opensearch-project/opensearch)
//   settings → IndexSettings (from @opensearch-project/opensearch)
type IndexConfigurationProvider.Configuration = Pick<OpenSearchIndexRequestBody, "mappings" | "settings">;
```

**Source:** `src/features/IndexConfigurationProvider/`
