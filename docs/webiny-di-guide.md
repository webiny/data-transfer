# `@webiny/di` — a pragmatic DI guide

A TypeScript-first, zero-decorator, reflect-metadata-backed dependency-injection container. Designed for domain-driven apps where you want clean abstractions, testability via DI seams, and no XML / no string identifiers scattered across the codebase.

This doc is written for an agent who needs to work in a codebase that uses `@webiny/di`. It covers:

- The two building blocks: `Abstraction` and `Container`.
- The project-level helpers layered on top (`createAbstraction`, `createFeature`).
- Dependency declaration syntax.
- Folder / file / export conventions.
- Common anti-patterns.

---

## 1. Mental model

Every service lives behind an **abstraction** — a typed token. Implementations are classes bound to an abstraction. Consumers resolve the abstraction, never the implementation:

```ts
// Abstraction = "what this thing can do"
export const Logger = createAbstraction<Logger.Interface>("Core/Logger");

// Implementation = "how it does it" — strategy-named (Pino) because there can
// be multiple loggers. When a feature has a SINGLE implementation, the impl
// export reuses the abstraction's short name via a local rename alias — see §6.
class PinoLoggerImpl implements Logger.Interface { ... }

export const PinoLogger = Logger.createImplementation({
    implementation: PinoLoggerImpl,
    dependencies: []
});

// Consumer sees only the abstraction
const logger = container.resolve(Logger);
```

This gives two seams for free:

1. **Testing** — swap `PinoLoggerImpl` for `TestLogger` in tests by registering a different implementation of the same abstraction.
2. **Decoration** — wrap an implementation with logging/caching/etc. via `createDecorator` (advanced; see §8).

---

## 2. Core API from the library

### `class Container`

The registry + resolver.

```ts
import { Container } from "@webiny/di";

const container = new Container();

container.register(PinoLogger);                     // Class-based registration
container.registerInstance(Logger, existingLogger); // Pre-built instance
container.registerFactory(Logger, () => new Pino()); // Lazy factory

const logger = container.resolve(Logger);           // Get an instance
const allHooks = container.resolveAll(SomeHook);    // Get all instances of an abstraction

const child = container.createChildContainer();     // Scoped overrides
```

**Key methods:**

- `register(ImplClass)` — registers an Implementation class (one created via `Abstraction.createImplementation`). Returns a `RegistrationBuilder` — chain `.inSingletonScope()` for singleton lifetime. Default is transient.
- `registerInstance(abstraction, value)` — registers a pre-built value. Always a "singleton" in effect.
- `registerFactory(abstraction, () => value)` — registers a lazy factory, called once per resolution in transient scope, or once total in singleton scope depending on how you want it.
- `resolve(abstraction)` — returns a single instance. Throws if nothing is registered.
- `resolveAll(abstraction)` — returns `[]` if nothing is registered, an array otherwise.
- `createChildContainer()` — child container that falls through to the parent on unresolved abstractions. Scoped overrides (e.g., per-request) live here.

### `class Abstraction<T>`

The token. You rarely instantiate it directly — use `createAbstraction(name)` (see §3).

```ts
const token = new Abstraction<Logger.Interface>("Core/Logger");

const Impl = token.createImplementation({ implementation: Class, dependencies: [] });
const Composite = token.createComposite({ implementation: Class, dependencies: [...] });
const Decorator = token.createDecorator({ decorator: Class, dependencies: [...] });
```

`name` is used only for debug / error messages. It's not a string-keyed registry — the actual uniqueness comes from the `token: symbol` field on each Abstraction instance. So two `createAbstraction("foo")` calls create two DIFFERENT tokens even though they share a name.

### `Abstraction.createImplementation({implementation, dependencies})`

Binds a constructor to this abstraction. The returned class tracks (via private fields) which abstraction it implements; when you call `container.register(ThatClass)`, the container reads that metadata to know which abstraction to register under.

```ts
export const PinoLogger = Logger.createImplementation({
    implementation: PinoLoggerImpl,   // must implement Logger.Interface
    dependencies: [Config, Clock]      // positional, matches constructor params
});
```

### `Abstraction.createComposite({implementation, dependencies})`

Same shape as `createImplementation`, but designed for the pattern where the abstraction's "canonical" instance is a composite that aggregates every registered implementation:

```ts
class AfterTransferHookCompositeImpl implements AfterTransferHook.Interface {
    public constructor(private readonly hooks: AfterTransferHook.Interface[]) {}
    public async execute(): Promise<void> {
        for (const hook of this.hooks) {
            await hook.execute();
        }
    }
}

export const AfterTransferHookComposite = AfterTransferHook.createComposite({
    implementation: AfterTransferHookCompositeImpl,
    dependencies: [[AfterTransferHook, { multiple: true }]] // resolveAll, inject array
});
```

Container resolves the composite when asked for `AfterTransferHook` — the composite itself then iterates all individual registrations.

### `Abstraction.createDecorator({decorator, dependencies})`

Middleware-style wrapper. Last constructor parameter is the **wrapped** instance; preceding params are normal DI deps. Useful for cross-cutting concerns (caching, logging, metrics) you don't want to touch the implementation for.

```ts
class LoggingEventBusDecorator implements EventBus.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly inner: EventBus.Interface // <- wrapped; LAST param
    ) {}
    public publish(event: unknown): void {
        this.logger.info("publishing event");
        this.inner.publish(event);
    }
}

container.registerDecorator(
    EventBus.createDecorator({
        decorator: LoggingEventBusDecorator,
        dependencies: [Logger] // do NOT list EventBus itself; it's the tail
    })
);
```

### `Metadata`

`new Metadata(ImplClass).getAbstraction()` recovers the abstraction token from an Implementation class. Rarely needed in user code — the container handles it — but useful when you want to accept "an Impl class" as input and need to know which abstraction it binds to (e.g., a `PipelineBuilderFactory.create({ scanner, processors })` that infers types from impls).

---

## 3. Project helpers on top of the library

Most projects add two thin wrappers for ergonomics. These aren't part of `@webiny/di` itself but are standard in Webiny-family projects.

### `createAbstraction<T>(name)`

```ts
// src/base/createAbstraction.ts
import { Abstraction } from "@webiny/di";

export function createAbstraction<T>(name: string): Abstraction<T> {
    return new Abstraction<T>(name);
}
```

Same as `new Abstraction<T>(name)` — exists mostly so you can import one symbol (`createAbstraction`) instead of two (`Abstraction` + `new`). Also gives you a natural place to add project-wide defaults later without touching every call site.

**Naming convention**: `"Domain/Name"` — e.g., `"Core/Logger"`, `"Transfer/BeforeTransferHook"`, `"Cms/ModelProvider"`. The slash-prefix groups related abstractions visually in logs / debug output.

### `createFeature<TContext>({name, register})`

A "feature" is a bundle of related registrations grouped behind one name. Feature = composition root for a slice of the system.

```ts
// src/base/createFeature.ts
import type { Container } from "@webiny/di";

export type FeatureDefinition<TRegister = void> = [TRegister] extends [void]
    ? {
        name: string;
        register(container: Container): void;
    }
    : {
        name: string;
        register(container: Container, context: TRegister): void;
    };

export function createFeature<TRegister = void>(
    def: FeatureDefinition<TRegister>
): FeatureDefinition<TRegister> {
    const feature = {
        name: def.name,
        register: def.register
    };
    
    Reflect.defineMetadata("wby:isFeature", true, feature);
    
    return feature as FeatureDefinition<TRegister>;
}

```

**Usage:**

```ts
// src/features/Logger/feature.ts
import { createFeature } from "~/base/createFeature.ts";
import { Logger } from "./abstractions/Logger.ts";
import { PinoLogger } from "./PinoLogger.ts";

export interface LoggerOptions {
    logLevel: "debug" | "info" | "warn" | "error";
    json: boolean;
}

export const LoggerFeature = createFeature<LoggerOptions>({
    name: "Core/LoggerFeature",
    register(container, options) {
        container.registerInstance(Logger, new PinoLoggerImpl(options));
        // or: container.register(PinoLogger).inSingletonScope();
    }
});
```

**Calling a feature:**

```ts
LoggerFeature.register(container, { logLevel: "info", json: false });
```

Features compose — a larger feature can call other features in its `register`:

```ts
export const AppFeature = createFeature({
    name: "App/AppFeature",
    register(container) {
        LoggerFeature.register(container, { logLevel: "info", json: true });
        CacheFeature.register(container);
        DatabaseFeature.register(container);
    }
});
```

Bootstrap code then reduces to registering features, not individual tokens. Keeps the composition root tidy.

---

## 4. Dependency declaration

The `dependencies` array is **positional** — matches constructor parameters in order. Each slot is either:

```ts
// Shorthand: required single dep
Logger

// Explicit options
[Logger]
[Logger, { multiple: true }]        // resolveAll — inject array of all registered
[Logger, { optional: true }]         // may be undefined if not registered
[Logger, { multiple: true, optional: true }]  // may be empty array
```

**Example constructor → dependencies mapping:**

```ts
class PipelineRunnerImpl {
    public constructor(
        private readonly container: Container,           // self
        private readonly logger: Logger.Interface,        // required
        private readonly hooks: BeforeHook.Interface[],   // all-of
        private readonly tracer?: Tracer.Interface         // optional
    ) {}
}

Logger.createImplementation({
    implementation: PipelineRunnerImpl,
    dependencies: [
        ContainerToken,
        Logger,
        [BeforeHook, { multiple: true }],
        [Tracer, { optional: true }]
    ]
});
```

**Type safety**: the library's `Dependencies<T>` generic statically enforces the positional match. TypeScript will reject a `dependencies` array that doesn't line up with the constructor's parameter types.

### Container self-reference — `ContainerToken`

If a service legitimately needs the container (e.g., a dispatcher that resolves handlers dynamically), use:

```ts
// src/base/Container.ts
import { Container } from "@webiny/di";
import { createAbstraction } from "./createAbstraction.ts";

export const ContainerToken = createAbstraction<Container>("Core/Container");
```

Bootstrap registers the container under itself:

```ts
const container = new Container();
container.registerInstance(ContainerToken, container);
```

Now any service can declare `ContainerToken` in its dependencies.

Use sparingly — it's a service locator escape hatch. 99% of the time you want explicit abstractions.

---

## 5. `reflect-metadata` — DO NOT import manually

`@webiny/di` loads `reflect-metadata` internally (via its own `import "reflect-metadata"` side-effect import). User code **must not** add its own `import "reflect-metadata"` — duplicate loads can create distinct metadata registries and silently break DI.

If your ESLint/TS setup suggests importing it, suppress that suggestion for your project.

---

## 6. Folder / file / export conventions

This is the house style for Webiny-family projects. Not enforced by the library, but deeply consistent across codebases that use it.

### Folder layout per feature

```
src/features/FeatureName/
├── abstractions/
│   ├── FeatureName.ts    # Interface + abstraction token + namespace types
│   └── index.ts          # Only token re-exports; NO type re-exports at this level
├── FeatureName.ts        # Class + createImplementation
├── feature.ts            # createFeature call
└── index.ts              # Public API surface for this feature
```

Variants:

- Some features have multiple implementations: `FeatureName.ts` + `FeatureNameTwo.ts` alongside. The `feature.ts` picks which to register (or registers both under different abstractions).
- Some features have supporting classes (e.g., a Composite): those sit alongside `FeatureName.ts` without a separate subdirectory.

### The five file templates

#### `abstractions/FeatureName.ts`

```ts
import { createAbstraction } from "~/base/createAbstraction.ts";

interface IFeatureName {
    doThing(x: string): Promise<void>;
}

export const FeatureName = createAbstraction<IFeatureName>("Area/FeatureName");

export namespace FeatureName {
    // Consumers reach types via `FeatureName.Interface`, never via a
    // bare `IFeatureName` import. Interface is ALWAYS the public type name.
    export type Interface = IFeatureName;
    // Nested types live here too:
    export interface Options { level: number }
}
```

#### `abstractions/index.ts`

```ts
// Tokens only. Types are accessed via the FeatureName namespace,
// so re-exporting them here creates a second import path that
// drifts out of sync.
export { FeatureName } from "./FeatureName.ts";
```

#### `FeatureName.ts` (the implementation)

**Key convention: the short name `FeatureName` is reused at two layers** — as the abstraction token (what consumers import) AND as the `createImplementation` export (what the feature registers). The impl file uses a **local rename alias** to avoid the name clash, so consumers never see a `DefaultX` / `XAbstraction` suffix.

```ts
// Local alias only — "Abstraction" suffix never leaks out of this file.
import { FeatureName as FeatureNameAbstraction } from "./abstractions/index.ts";
import { Logger } from "~/tools/Logger/index.ts";
import { Config } from "~/features/Config/index.ts";

class FeatureNameImpl implements FeatureNameAbstraction.Interface {
    public constructor(
        private readonly logger: Logger.Interface,
        private readonly config: Config.Interface
    ) {}

    public async doThing(x: string): Promise<void> {
        this.logger.info(`doing ${x}`);
    }
}

// Same short name as the abstraction token. Consumers never import this —
// the feature registers it, that's where it's used.
export const FeatureName = FeatureNameAbstraction.createImplementation({
    implementation: FeatureNameImpl,
    dependencies: [Logger, Config]
});
```

**Why the alias:** consumers import `FeatureName` from the feature's `index.ts`, which re-exports the **abstraction**. They write `dependencies: [FeatureName]` and `private readonly featureName: FeatureName.Interface` — clean short name, no `Abstraction` suffix visible anywhere in their code. The impl file needs a different local binding for the abstraction because it wants to export its own `const FeatureName = ...createImplementation(...)`. That's the only place the alias is needed.

**When there are multiple implementations** of the same abstraction, the impls get strategy-prefixed names instead (`PinoLogger`, `ConsoleLogger`) — the short-name reuse is specifically for the single-impl case. (See §10.4 for the ambiguity around registering two under the same abstraction.)

**House rule**: every class method has an explicit `public` / `private` / `protected` modifier. Single-line `if` / `for` always with braces. No inline structural types in generics / params / return types — extract to a named `interface` / `type`. Every constructor dep is `private readonly` with explicit type from the dep's `XxxAbstraction.Interface` or `Xxx.Interface` namespace.

#### `feature.ts`

```ts
import { createFeature } from "~/base/createFeature.ts";
import { FeatureName } from "./FeatureName.ts";  // the createImplementation export

export const FeatureNameFeature = createFeature({
    name: "Area/FeatureNameFeature",
    register(container) {
        container.register(FeatureName).inSingletonScope();
    }
});
```

Note: `FeatureName` here is the createImplementation output from `./FeatureName.ts` — NOT the abstraction from `./abstractions/`. The name is the same; the path is different. This file is the one place inside the feature that imports the impl.

#### `index.ts` (public surface)

```ts
// The abstraction is the public API; the implementation stays inside the
// feature folder and is only touched by feature.ts.
export { FeatureName } from "./abstractions/index.ts";
export { FeatureNameFeature } from "./feature.ts";
```

The `FeatureName` exported here is the **abstraction token**, imported from `./abstractions/index.ts`. The `createImplementation` result in `./FeatureName.ts` shares the same short name but is a different symbol; it is NEVER re-exported from this file. Consumers register features (not classes) and resolve / depend on abstractions (not impls).

### What NOT to export

- Bare `interface IFeatureName` — always accessed via `FeatureName.Interface`, no direct export.
- Implementation classes (`FeatureNameImpl`) — stay inside the feature folder.
- createImplementation outputs — the `const FeatureName = FeatureNameAbstraction.createImplementation(...)` in `./FeatureName.ts` is for `./feature.ts` only. Do not re-export it from the feature's `index.ts`.
- `reflect-metadata` — imported by the library, never by user code.

### Path aliases

Projects use `~/*` mapped to `src/*` via `tsconfig.json paths`. All intra-project imports go through the alias:

```ts
// ✗ Bad
import { Logger } from "../../../tools/Logger/abstractions/Logger.ts";

// ✓ Good
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
```

---

## 7. Bootstrap pattern

Typical composition root:

```ts
// src/bootstrap.ts
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/Container.ts";
import { LoggerFeature } from "~/tools/Logger/index.ts";
import { CacheFeature } from "~/tools/Cache/index.ts";
import { ConfigFeature } from "~/features/Config/index.ts";

export function bootstrap(input: { config: Config.Interface }): Container {
    const container = new Container();

    // Every container registers itself under ContainerToken so services
    // that legitimately need access can resolve it.
    container.registerInstance(ContainerToken, container);

    // Tools (no deps on features)
    LoggerFeature.register(container, { logLevel: "info", json: true });
    CacheFeature.register(container);

    // Domain features
    ConfigFeature.register(container, { config: input.config });

    // … more features …

    return container;
}
```

Call site then:

```ts
const container = bootstrap({ config });
const runner = container.resolve(PipelineRunner);
await runner.run(...);
```

---

## 8. Lifetime scopes

```ts
container.register(Impl);                   // Transient (default) — new instance per resolve
container.register(Impl).inSingletonScope(); // Singleton — one instance per container
container.registerInstance(Abs, obj);        // Always "singleton" semantics (one obj)
```

Singleton scope is per-container. Child containers get fresh singletons unless they resolve from the parent (they do, by default).

**House rule**: use singletons for stateless services (loggers, clients, repositories). Transient for anything that holds per-operation state (request handlers, contexts).

---

## 9. Testing patterns

Tests resolve services from a container rather than constructing them manually. Two common harnesses:

### Hand-rolled per-file

```ts
const container = new Container();
container.registerInstance(ContainerToken, container);
container.registerInstance(Logger, new TestLogger());
container.register(SomeFeatureImpl).inSingletonScope();

const subject = container.resolve(SomeFeature);
```

### Shared `create*Container` helper

```ts
// __tests__/containers/createAppContainer.ts
export function createAppContainer(options = {}): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    LoggerFeature.register(container, { logLevel: "error", json: false });
    // …
    return container;
}
```

Used by all tests that need a "real-ish" container without the full bootstrap.

**Rule**: NEVER construct an implementation class directly in a test (`new SomeFeatureImpl(dep1, dep2)`). Always resolve via the container — that way the test exercises the same wiring as production.

---

## 10. Common anti-patterns (don't)

### 1. Direct interface export from abstractions

```ts
// ✗ Bad
export interface LoggerInterface { info(msg: string): void }
export const Logger = createAbstraction<LoggerInterface>("Core/Logger");

// ✓ Good — namespace merge
interface ILogger { info(msg: string): void }
export const Logger = createAbstraction<ILogger>("Core/Logger");
export namespace Logger {
    export type Interface = ILogger;
}
```

Callers write `Logger.Interface` everywhere. One import, types + token together.

### 2. Manual `import "reflect-metadata"`

Breaks the metadata registry. Remove it.

### 3. Resolving the container to look up services on demand

```ts
// ✗ Bad — service locator
class FooImpl {
    constructor(private container: Container) {}
    doThing() {
        this.container.resolve(Logger).info(...); // runtime dep, invisible to tests
    }
}

// ✓ Good — explicit DI
class FooImpl {
    constructor(private logger: Logger.Interface) {}
    doThing() { this.logger.info(...); }
}
```

### 4. Implementing an abstraction twice in the same feature file

```ts
// ✗ Bad
export const FooImpl1 = Foo.createImplementation({ ... });
export const FooImpl2 = Foo.createImplementation({ ... });
// feature.ts registers both — which one wins?
```

Registering two implementations of the same abstraction in the same container is ambiguous. Either:
- Use `createComposite` to aggregate them.
- Register under different abstractions.
- Pick one; delete the other.

### 5. Forgetting `.inSingletonScope()` for stateful services

```ts
// ✗ Bad — every resolve gets a fresh cache
container.register(InMemoryCache);

// ✓ Good
container.register(InMemoryCache).inSingletonScope();
```

### 6. Using string names to identify abstractions

```ts
// ✗ Bad — DI without types, duplicated strings, typos
container.resolve("Logger");

// ✓ Good — typed token
container.resolve(Logger);
```

### 7. Mixing `@webiny/di` containers across boundaries

Each process / worker gets its OWN container. Passing a container to a spawned child process via serialized config doesn't work — symbols don't serialize. If you need shared state across processes, serialize the state itself, not the container.

---

## 11. Minimum TypeScript config

The library relies on decorators metadata and modern module resolution:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ES2022",
        "moduleResolution": "bundler",
        "strict": true,
        "experimentalDecorators": false,
        "emitDecoratorMetadata": false,
        "esModuleInterop": true,
        "allowImportingTsExtensions": true
    }
}
```

(Reflect-metadata + library internals handle decoration at runtime; no TS-compile-time decorators are used.)

Install:

```sh
yarn add @webiny/di
# or
npm install @webiny/di
```

---

## 12. Glossary

| Term | What it is |
| --- | --- |
| **Abstraction** | A typed token identifying a service contract. Created via `createAbstraction(name)`. |
| **Implementation class** | A class bound to an abstraction via `Abstraction.createImplementation(...)`. Knows which abstraction it implements. |
| **Composite** | An Implementation that fans out to multiple registered instances of the same abstraction — aggregator pattern. |
| **Decorator** | An Implementation that WRAPS another instance of the same abstraction — middleware pattern. |
| **Feature** | A named bundle of registrations (abstractions + implementations + instances). `createFeature({name, register})`. |
| **Container** | The registry + resolver. `new Container()`. |
| **Token** | The runtime `symbol` inside an Abstraction used for registry keys. |
| **ContainerToken** | Project convention — `createAbstraction<Container>("Core/Container")` so services can receive the container itself as a dep. |

---

## 13. When things go wrong

**"No registration for abstraction X"** — you resolved an abstraction that was never registered. Either (a) you forgot to register, (b) you wired up a DIFFERENT container in bootstrap and are resolving from an empty one, (c) a feature you depend on wasn't registered before the service that needs it.

**"Cannot read property 'X' of undefined"** inside a constructor — a dependency was undefined. Check `{ optional: true }` on the declaration OR missing `registerInstance` in bootstrap.

**Metadata mismatches (rare)** — usually `reflect-metadata` imported twice. Run `grep -r "reflect-metadata" src` and remove any hits.

**Singleton state bleeding across tests** — the shared container held state between tests. Build a fresh container per `describe` / `beforeEach`.

**Type error on `dependencies`** — positional mismatch between `constructor(...)` params and the `dependencies: [...]` array. Line them up.
