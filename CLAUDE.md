# AI Agent Guidelines

This document is read by AI agents (Claude Code, Copilot, Codex, etc.) when working on this codebase. It describes architecture patterns, conventions, and rules that must be followed.

**This document is updated as the codebase evolves.**

## Code Style

- Always wrap `if`/`for`/`while` bodies in curly braces, even for single statements
- Use `yarn` for package management, never `npm`
- File extensions in imports: use `.ts` in source files

## DI Architecture Patterns (`@webiny/di`)

This project uses `@webiny/di` for dependency injection with SOLID principles.

### Foundation: `src/base/`

The `src/base/` module provides wrappers and utilities on top of `@webiny/di`:

- `createAbstraction<T>(name)` — creates a typed DI token (`Abstraction<T>`)
- `createFeature({ name, register })` — defines a feature module that registers implementations into a `Container`
- `createImplementation` / `createDecorator` — re-exported from `@webiny/di`
- `Result<TValue, TError>` — functional ok/fail type for typed error handling
- `ResultAsync<TValue, TError>` — async version of Result
- `BaseError` — typed error base class with `code` and `data`

### Feature Structure

Each feature follows this directory layout:

```
src/features/FeatureName/
├── abstractions/
│   ├── FeatureName.ts    # Interface + abstraction token + namespace
│   └── index.ts          # Re-exports
├── FeatureName.ts        # Implementation class + createImplementation
├── feature.ts            # createFeature — registers into container
└── index.ts              # Public API (re-exports abstractions + feature)
```

### Step 1: Define the Abstraction

File: `abstractions/FeatureName.ts`

```typescript
import { createAbstraction } from "@/src/base/index.js";
import type { Result } from "@/src/base/index.js";

// Define the interface
export interface IFeatureName {
  doSomething(input: string): Promise<Result<Output, FeatureErrors>>;
}

// Define typed errors
export interface IFeatureNameErrorsRecord {
  connectionError: ConnectionError;
  validationError: ValidationError;
}

type IFeatureNameErrors = IFeatureNameErrorsRecord[keyof IFeatureNameErrorsRecord];

// Create the abstraction token
export const FeatureName = createAbstraction<IFeatureName>("Domain/FeatureName");

// Namespace for convenient type access
export namespace FeatureName {
  export type Interface = IFeatureName;
  export type Errors = IFeatureNameErrors;
}
```

**Key points:**
- Abstraction name uses domain prefix (e.g., `"Core/DynamoDbClient"`)
- Return types should use `Result<T, E>` for typed error handling
- Namespace pattern allows consumers to use `FeatureName.Interface` instead of importing the `I` prefixed interface
- Error types are explicitly defined so consumers know what to expect

### Step 2: Create the Implementation

File: `FeatureName.ts`

```typescript
import { FeatureName as FeatureNameAbstraction } from "./abstractions/FeatureName.js";

class FeatureNameImpl implements FeatureNameAbstraction.Interface {
  constructor(private someDep: SomeDep.Interface) {}

  async doSomething(input: string): Promise<Result<Output, FeatureErrors>> {
    // implementation
  }
}

export const FeatureName = FeatureNameAbstraction.createImplementation({
  implementation: FeatureNameImpl,
  dependencies: [SomeDep]
});
```

**Key points:**
- Import the abstraction, alias it to avoid name collision
- Implementation class implements `Abstraction.Interface` (via namespace)
- `createImplementation` is called on the abstraction token itself (not imported separately)
- Dependencies are abstraction tokens, resolved by the container

### Step 3: Create the Feature

File: `feature.ts`

```typescript
import { createFeature } from "@/src/base/index.js";
import { FeatureName } from "./FeatureName.js";

export const FeatureNameFeature = createFeature({
  name: "Domain/FeatureNameFeature",
  register(container) {
    container.register(FeatureName);
  }
});
```

### Step 4: Public API

File: `index.ts`

```typescript
export * from "./abstractions/index.js";
export { FeatureNameFeature } from "./feature.js";
```

### Decorator Pattern (Extending Behavior)

To add cross-cutting concerns without modifying the original:

```typescript
import { createDecorator } from "@/src/base/index.js";

class LoggingFeatureName implements FeatureName.Interface {
  constructor(
    private logger: Logger.Interface,
    private decoratee: FeatureName.Interface  // Last param = decorated instance
  ) {}

  async doSomething(input: string) {
    this.logger.log(`Doing something: ${input}`);
    return this.decoratee.doSomething(input);
  }
}

export const LoggingDecorator = createDecorator({
  abstraction: FeatureName,
  decorator: LoggingFeatureName,
  dependencies: [Logger]  // decoratee passed automatically as last param
});
```

### Conventions

- **Abstraction names**: Use domain prefix — `"Core/DynamoDbClient"`, `"Migration/ModelProvider"`
- **Feature names**: Suffix with `Feature` — `"Core/DynamoDbClientFeature"`
- **Interface prefix**: Use `I` prefix — `IDynamoDbClient`, `IModelProvider`
- **Singletons**: Use `.inSingletonScope()` for stateful services (DB clients, caches)
- **Result types**: Use `Result<T, E>` for operations that can fail with known error types
- **No throws**: Prefer returning `Result.fail(error)` over throwing exceptions

### Usage in Application

```typescript
import { Container } from "@webiny/di";

const container = new Container();
FeatureNameFeature.register(container);

const instance = container.resolve(FeatureName);
```
