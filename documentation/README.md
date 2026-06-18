## Curated list of available documentation

### Configurations

A user can configure the behavior of the application by providing their own implementations for an abstraction via the `register` hook in `createConfig()`.

```typescript
export default createConfig({
  // ... source, target, pipeline ...
  register: async container => {
    container.register(MyCustomImplementation);
  }
});
```

Each configuration has its own folder under `./configurations/` with a README describing what it does, the default behavior, and how to override it.

| Abstraction                  | Description                                                                          | Docs                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `IndexConfigurationProvider` | Controls OpenSearch index mappings and settings applied on index creation and update | [README](./configurations/IndexConfigurationProvider/README.md) |
| `ModelProvider`              | Loads CMS model definitions used by transformers for field metadata                  | [README](./configurations/ModelProvider/README.md)              |
| `BeforeTransferHook`         | Runs before the transfer starts (orchestrator only, after access checks)             | [README](./configurations/BeforeTransferHook/README.md)         |
| `AfterTransferHook`          | Runs after the transfer completes (orchestrator only, skipped on failure)            | [README](./configurations/AfterTransferHook/README.md)          |
| `BeforeLoadPresetHook`       | Runs before the preset is loaded (each worker, receives config)                      | [README](./configurations/BeforeLoadPresetHook/README.md)       |
| `AfterLoadPresetHook`        | Runs after the preset is loaded (each worker, receives config + preset)              | [README](./configurations/AfterLoadPresetHook/README.md)        |
