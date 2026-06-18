[Documentation](../../README.md) > [Configurations](../../README.md#configurations) > BeforeTransferHook

# BeforeTransferHook

Runs custom logic **before** the transfer starts — after access checks pass, before workers are spawned.

## When it runs

The orchestrator (`run/handler.ts`) calls `beforeTransferHook.execute()` once, in the main process only (not in worker processes). Runs after `config.register`, preset configuration, and access checks all succeed.

## Default behavior

No built-in hooks are registered. The composite executes an empty list.

## Composite behavior

Hooks use `{ multiple: true }` — registering a hook **adds** to the list rather than replacing existing ones. Multiple hooks execute sequentially in registration order.

## Override example

Send a Slack notification before the transfer begins:

```typescript
// features/slackNotifyHook.ts
import { BeforeTransferHook } from "@webiny/data-transfer";

class SlackNotifyBeforeTransfer implements BeforeTransferHook.Interface {
  public async execute(): Promise<void> {
    await fetch("https://hooks.slack.com/...", {
      method: "POST",
      body: JSON.stringify({ text: "Transfer starting..." })
    });
  }
}

export const SlackNotifyBeforeTransferHook = BeforeTransferHook.createImplementation({
  implementation: SlackNotifyBeforeTransfer,
  dependencies: []
});
```

Register it in the config:

```typescript
export default createConfig({
  // ...
  register: async container => {
    container.register(SlackNotifyBeforeTransferHook);
  }
});
```

## API

```typescript
interface BeforeTransferHook.Interface {
    execute(): Promise<void>;
}
```

**Source:** `src/features/TransferLifecycle/`
