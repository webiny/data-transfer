[Documentation](../../README.md) > [Configurations](../../README.md#configurations) > AfterTransferHook

# AfterTransferHook

Runs custom logic **after** the transfer completes — after all workers finish, in the orchestrator process only.

## When it runs

The orchestrator (`run/handler.ts`) calls `afterTransferHook.execute()` once, after all worker shards have completed. **Skipped on shard failure** — if any worker fails, after-hooks do not run.

## Default behavior

No built-in hooks are registered. The composite executes an empty list.

## Composite behavior

Hooks use `{ multiple: true }` — registering a hook **adds** to the list rather than replacing existing ones. Multiple hooks execute sequentially in registration order.

## Override example

Log transfer completion to an external system:

```typescript
// features/completionHook.ts
import { AfterTransferHook } from "@webiny/data-transfer";

class LogCompletion implements AfterTransferHook.Interface {
  public async execute(): Promise<void> {
    await fetch("https://hooks.slack.com/...", {
      method: "POST",
      body: JSON.stringify({ text: "Transfer completed successfully." })
    });
  }
}

export const LogCompletionHook = AfterTransferHook.createImplementation({
  implementation: LogCompletion,
  dependencies: []
});
```

Register it in the config:

```typescript
export default createConfig({
  // ...
  register: async container => {
    container.register(LogCompletionHook);
  }
});
```

## API

```typescript
interface AfterTransferHook.Interface {
    execute(): Promise<void>;
}
```

**Source:** `src/features/TransferLifecycle/`
