[Documentation](../../README.md) > [Configurations](../../README.md#configurations) > ModelProvider

# ModelProvider

Loads CMS model definitions used by transformers that need field metadata (e.g. rich-text visitor, field-type guards).

## When it runs

`ModelPreloaderHook` (an `AfterLoadPresetHook`) calls `preloadModels(tenantLocales)` once per worker, after the preset is loaded and before any records are processed. Transformers then call `getModel(modelId)` during record transformation.

## Default behavior

The built-in implementation:

1. Queries the source DynamoDB table for model records (`T#<tenant>#L#<locale>#CMS#CM`).
2. If `pipeline.modelsDir` is set, reads JSON files from that directory. JSON models override DB models (user-provided takes precedence).
3. Accepted JSON shapes (auto-detected, mixed OK in same dir):
   - Single model: `{ modelId, fields: [...], ... }`
   - Array of models: `[{ modelId, fields, ... }, ...]`
   - Webiny export: `{ groups: [...], models: [...] }`

## Override example

Replace the built-in model loading with a custom source (e.g. an API or a different DB table):

```typescript
// features/myModelProvider.ts
import { ModelProvider } from "@webiny/data-transfer";

class MyModelProvider implements ModelProvider.Interface {
  public async preloadModels(_tenantLocales: Map<string, string>): Promise<void> {
    // Load models from your custom source
  }

  public getModel(modelId: string): ModelProvider.ModelType | undefined {
    // Return model by ID
    return undefined;
  }

  public getModelIds(): string[] {
    // Return all known model IDs
    return [];
  }
}

export const MyModelProviderImpl = ModelProvider.createImplementation({
  implementation: MyModelProvider,
  dependencies: []
});
```

Register it in the config:

```typescript
export default createConfig({
  // ...
  register: async container => {
    container.register(MyModelProviderImpl);
  }
});
```

## API

```typescript
interface ModelProvider.Interface {
    preloadModels(tenantLocales: Map<string, string>): Promise<void>;
    getModel(modelId: string): ModelProvider.ModelType | undefined;
    getModelIds(): string[];
}

interface ModelProvider.ModelType {
    PK: string;
    SK: string;
    modelId: string;
    name: string;
    fields: ModelProvider.Field[];
    layout?: string[][];
    locale?: string;
    tenant?: string;
    titleFieldId?: string;
    [key: string]: unknown;
}
```

**Source:** `src/features/ModelProvider/`
