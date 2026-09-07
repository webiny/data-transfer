# CLI Command Menu + `fix-live` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement steps 7–10 of `docs/superpowers/specs/2026-09-04-fix-live-field-and-command-menu-design.md`: `Prompts` / `UI` abstractions backed by `@clack/prompts`, a `Command` token + `CommandRegistry`, a new `src/cli.ts` that opens a guided menu when invoked with no arguments while keeping `yarn transfer --config --preset` and `yarn transfer <folder>` working, the move of `src/commands/run/` to `src/commands/transfer/`, the `FixLiveCommand` guided flow, guide/AGENTS/hard-won-decision updates, and a `minor` changeset.

**Architecture:** Everything new lives under `src/commands/` (a `src/cli/` directory would collide with `src/cli.ts` under module resolution). `Command` is one DI token with many implementations, collected by `CommandRegistry` via `container.resolveAll(Command)` on first use so nothing heavy is constructed at CLI start. Commands depend only on `Prompts` and `UI` in their constructors; `FixLiveCommand.run()` builds the per-project container the way `run/handler.ts` does today (`discoverConfig` → `loadConfig` → `bootstrap({ config, runId })`) and resolves `SourceDynamoDbClient` or `TargetDynamoDbClient` for the chosen system. Step modules are plain functions (like `src/commands/init/steps/*.ts`) returning a `StepOutcome<T>` discriminated union (`ok` / `cancelled` / `refused`) so the command maps outcomes to exit codes `0` / `130` / `1` without any `process.exit` in testable code.

**Contract with the sibling plan (`docs/superpowers/plans/2026-09-04-fix-live-reconciler.md`).** This plan imports the following from `~/features/FixLive/index.js` and does not re-specify them. Given verbatim by the spec: `LiveFieldReconciler` (namespace: `ChangeReason`, `SkipReason`), `LiveFieldRunner` (namespace: `Interface`, `Mode`, `Options { mode, report, onProgress }`, `Stats`), `ChangeReport` (token; `Interface` appends JSONL lines), `FixLiveState` (namespace: `RunSummary`, `LiveRunSummary`, `File`). Expected from the sibling but named here — **Task 8 Step 1 verifies the real names in `src/features/FixLive/index.ts` and adjusts only `runTable.ts` / `FixLiveCommand.ts` imports if they differ**:

**Reconciled against the sibling plan on 2026-09-04.** The sibling exposes the names below. Code blocks in Tasks 7–8 still use the placeholder names `LiveFieldRunnerFactory` and `FixLiveStateStore`; apply these substitutions in Task 8 Step 1 before writing any file.

| Real export (from `~/features/FixLive/index.js`) | Real shape | Replaces in this plan |
| --- | --- | --- |
| `FixLiveFeature` | `createFeature`; registered in `bootstrap.ts` by the sibling (its Task 8). No extra `register` call needed. | same name |
| `DdbLiveFieldRunner`, `OsLiveFieldRunner` | two tokens, both `LiveFieldRunner.Interface`. Resolve `container.resolve(table === "ddb" ? DdbLiveFieldRunner : OsLiveFieldRunner)`. | `LiveFieldRunnerFactory` / `runnerFactory.create({...})` |
| `LiveFieldRunner.Options` | `{ mode: LiveFieldRunner.Mode; target: LiveFieldRunner.Target; report: ChangeReport.Interface; onProgress(stats: LiveFieldRunner.Stats): void }` | `runner.run({ mode, report, onProgress })` — add `target` |
| `LiveFieldRunner.Target` | `{ client: SourceDynamoDbClient.Interface; tableName: string; segments: number; concurrency?: number; writeConcurrency?: number }` | the `create({ table, client, tableName, segments, concurrency })` input; `table` is implied by the token |
| `FixLiveState` | token. `read(key: FixLiveState.Key): FixLiveState.File \| null`, `recordDryRun(key, summary: FixLiveState.RunSummary): void`, `recordLiveRun(key, summary: FixLiveState.LiveRunSummary): void`, `pathFor(key): string`. `Key = { project: string; system: "source" \| "target" }`. | `FixLiveStateStore` — `read(project, system)` becomes `read({ project, system })`; `write(project, system, file)` becomes `recordDryRun(key, summary)` or `recordLiveRun(key, summary)` depending on mode; tests mock `recordDryRun` / `recordLiveRun` instead of `write` |
| `ScanOptions.limit`, `ScanOptions.sortKeyEquals` | on `IDynamoDbClient.scan` and `MockDynamoDbClient` (sibling Task 2) | same |

`runTable.ts` must accept `target: LiveFieldRunner.Target` and forward it in `runner.run(...)`. `FixLiveCommand.run` builds `target` per table: `{ client, tableName, segments: config.pipeline.segments, concurrency: options.concurrency }`. Rename the local `const state = stateStore.read(...)` to `const fixLiveState = container.resolve(FixLiveState); const state = fixLiveState.read(key);` so the later `recordDryRun` / `recordLiveRun` calls have the token in scope.

**Tech Stack:** TypeScript (nodenext, `~/` alias), `@webiny/di`, `yargs` 18, `@clack/prompts` 1.7.0, Vitest, oxfmt / oxlint / adio.

## Global Constraints

Derived from `docs/architecture.md`, `docs/webiny-di-guide.md` §6 and the code under `src/commands/`, `src/features/AccessChecker/`:

- Types accessed only via namespace (`Prompts.Interface`, `Command.Argv`); abstraction files export `IFoo` + token + `namespace Foo`. `abstractions/index.ts` re-exports tokens only.
- Impl files use the local rename alias `import { Foo as FooAbstraction } from "./abstractions/Foo.ts"`; the impl export reuses the short name (`export const Foo = FooAbstraction.createImplementation({...})`).
- `public` / `private` / `protected` on every class member; `readonly` where applicable.
- Braces always — no single-line `if` / `for`.
- No `reflect-metadata` imports.
- `~/` imports use `.js` extensions; relative imports use `.ts` extensions. In `__tests__/`, `~/` for `src/` imports, relative for test-only infra (`../prompts/StubPrompts.ts`).
- Named `interface` / `type` for every structural shape — no inline `{ ... }` in generic or parameter positions.
- Function-module files camelCase (`selectProject.ts`), class files PascalCase (`FixLiveCommand.ts`).
- Commands never import `@clack/prompts` directly — only `ClackPrompts.ts`, `ClackUI.ts`, `ClackSpinner.ts` do.
- No `process.exit` in step modules or `Command.run`; return exit codes (`EXIT_OK = 0`, `EXIT_FAILURE = 1`, `EXIT_CANCELLED = 130`). The one exception is `UI.exitOnCancel` (spec 3.4).
- Feature names prefixed `Cli/` (existing: `Core/`, `Base/`, `Transfer/`).
- oxfmt formatting (4-space indent under `src/` and `__tests__/`, double quotes, no trailing commas, `printWidth` 100). `yarn`, never `npm`.
- Coverage thresholds (`lines 79 / functions 84 / branches 71 / statements 79`) must not drop; every new module ships a test. `index.ts` / `feature.ts` are excluded from coverage.
- Any CLI behaviour change updates `docs/guides/commands.md` (AGENTS.md §6).
- Commit after each task; run `yarn full` before the final commit (memory: `feedback_run_verification.md`).

---

### Task 1: `Prompts` + `UI` abstractions, clack implementations, test stubs

**Files:**
- Modify: `package.json` (add `"@clack/prompts": "^1.7.0"` to `dependencies`, alphabetically after `@aws-sdk/credential-providers`)
- Create: `src/commands/exitCodes.ts`
- Create: `src/commands/prompts/abstractions/Prompts.ts`
- Create: `src/commands/prompts/abstractions/UI.ts`
- Create: `src/commands/prompts/abstractions/index.ts`
- Create: `src/commands/prompts/ClackPrompts.ts`
- Create: `src/commands/prompts/ClackSpinner.ts`
- Create: `src/commands/prompts/ClackUI.ts`
- Create: `src/commands/prompts/feature.ts`
- Create: `src/commands/prompts/index.ts`
- Test: `__tests__/commands/prompts/StubPrompts.ts`, `__tests__/commands/prompts/StubUI.ts`, `__tests__/commands/prompts/ClackPrompts.test.ts`, `__tests__/commands/prompts/StubPrompts.test.ts`

**Interfaces:**
- Consumes: `createAbstraction`, `createFeature` from `~/base/index.js`; `@clack/prompts`
- Produces: `Prompts` / `UI` tokens + namespaces, `PromptsFeature`, `EXIT_*` constants, `StubPrompts` / `StubUI` — used by Tasks 2–8

- [ ] **Step 1: Add the dependency**

```bash
yarn add @clack/prompts@^1.7.0
```

- [ ] **Step 2: Exit codes**

Create `src/commands/exitCodes.ts`:

```ts
export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
/** Conventional "interrupted by user" code — returned on prompt cancel. */
export const EXIT_CANCELLED = 130;
```

- [ ] **Step 3: Abstractions**

Create `src/commands/prompts/abstractions/Prompts.ts`:

```ts
import { createAbstraction } from "~/base/index.js";

export interface PromptSelectOption<T> {
    value: T;
    label: string;
    hint?: string;
    disabled?: boolean;
}

export interface PromptSelectOptions<T> {
    message: string;
    options: PromptSelectOption<T>[];
    initialValue?: T;
}

export interface PromptMultiselectOptions<T> {
    message: string;
    options: PromptSelectOption<T>[];
    required?: boolean;
    initialValues?: T[];
}

export interface PromptConfirmOptions {
    message: string;
    initialValue?: boolean;
}

export interface PromptTextOptions {
    message: string;
    placeholder?: string;
    defaultValue?: string;
    validate?: (value: string) => string | undefined;
}

/** Every method resolves `null` when the user cancels. Never exits the process. */
export interface IPrompts {
    select<T>(options: PromptSelectOptions<T>): Promise<T | null>;
    multiselect<T>(options: PromptMultiselectOptions<T>): Promise<T[] | null>;
    confirm(options: PromptConfirmOptions): Promise<boolean | null>;
    text(options: PromptTextOptions): Promise<string | null>;
}

export const Prompts = createAbstraction<IPrompts>("Cli/Prompts");

export namespace Prompts {
    export type Interface = IPrompts;
    export type SelectOption<T> = PromptSelectOption<T>;
    export type SelectOptions<T> = PromptSelectOptions<T>;
    export type MultiselectOptions<T> = PromptMultiselectOptions<T>;
    export type ConfirmOptions = PromptConfirmOptions;
    export type TextOptions = PromptTextOptions;
}
```

Create `src/commands/prompts/abstractions/UI.ts`:

```ts
import { createAbstraction } from "~/base/index.js";

export interface UISpinner {
    start(message: string): void;
    message(message: string): void;
    stop(message: string): void;
}

export interface IUI {
    intro(title: string): void;
    outro(message: string): void;
    note(message: string, title?: string): void;
    warn(message: string): void;
    error(message: string): void;
    cancel(message: string): void;
    spinner(): UISpinner;
    /** Prints "Cancelled." and exits 130 when `value` is null; otherwise returns it. */
    exitOnCancel<T>(value: T | null): T;
}

export const UI = createAbstraction<IUI>("Cli/UI");

export namespace UI {
    export type Interface = IUI;
    export type Spinner = UISpinner;
}
```

Create `src/commands/prompts/abstractions/index.ts`:

```ts
export { Prompts } from "./Prompts.ts";
export { UI } from "./UI.ts";
```

- [ ] **Step 4: Failing test for the clack adapter**

Create `__tests__/commands/prompts/ClackPrompts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const CANCEL = Symbol("clack:cancel");

vi.mock("@clack/prompts", () => ({
    select: vi.fn(),
    multiselect: vi.fn(),
    confirm: vi.fn(),
    text: vi.fn(),
    isCancel: (value: unknown) => value === CANCEL
}));

import * as clack from "@clack/prompts";
import { ClackPrompts } from "~/commands/prompts/ClackPrompts.js";

const mockSelect = vi.mocked(clack.select);
const mockConfirm = vi.mocked(clack.confirm);
const mockText = vi.mocked(clack.text);

beforeEach(() => {
    vi.resetAllMocks();
});

describe("ClackPrompts", () => {
    it("select returns the chosen value", async () => {
        mockSelect.mockResolvedValue("b");
        const prompts = new ClackPrompts();
        const result = await prompts.select<string>({
            message: "Pick",
            options: [{ value: "a", label: "A" }, { value: "b", label: "B" }]
        });
        expect(result).toBe("b");
        expect(mockSelect).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Pick", options: expect.any(Array) })
        );
    });

    it("select returns null on cancel", async () => {
        mockSelect.mockResolvedValue(CANCEL);
        const result = await new ClackPrompts().select<string>({
            message: "Pick",
            options: [{ value: "a", label: "A" }]
        });
        expect(result).toBeNull();
    });

    it("confirm returns null on cancel and the boolean otherwise", async () => {
        mockConfirm.mockResolvedValueOnce(CANCEL).mockResolvedValueOnce(false);
        const prompts = new ClackPrompts();
        expect(await prompts.confirm({ message: "Sure?" })).toBeNull();
        expect(await prompts.confirm({ message: "Sure?" })).toBe(false);
    });

    it("text passes validate through and returns null on cancel", async () => {
        mockText.mockResolvedValue(CANCEL);
        const validate = (value: string) => (value ? undefined : "required");
        expect(await new ClackPrompts().text({ message: "Name", validate })).toBeNull();
        const passed = mockText.mock.calls[0]![0];
        expect(passed.validate).toBeTypeOf("function");
    });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/prompts 2>&1 | tail -20`
Expected: FAIL — cannot resolve `~/commands/prompts/ClackPrompts.js`.

- [ ] **Step 6: Clack implementations**

Create `src/commands/prompts/ClackPrompts.ts`:

```ts
import * as p from "@clack/prompts";
import { Prompts as PromptsAbstraction } from "./abstractions/Prompts.ts";

class ClackPromptsImpl implements PromptsAbstraction.Interface {
    public async select<T>(options: PromptsAbstraction.SelectOptions<T>): Promise<T | null> {
        const result = await p.select<T>({
            message: options.message,
            options: options.options as p.Option<T>[],
            initialValue: options.initialValue
        });
        if (p.isCancel(result)) {
            return null;
        }
        return result;
    }

    public async multiselect<T>(
        options: PromptsAbstraction.MultiselectOptions<T>
    ): Promise<T[] | null> {
        const result = await p.multiselect<T>({
            message: options.message,
            options: options.options as p.Option<T>[],
            required: options.required ?? false,
            initialValues: options.initialValues
        });
        if (p.isCancel(result)) {
            return null;
        }
        return result;
    }

    public async confirm(options: PromptsAbstraction.ConfirmOptions): Promise<boolean | null> {
        const result = await p.confirm({
            message: options.message,
            initialValue: options.initialValue
        });
        if (p.isCancel(result)) {
            return null;
        }
        return result;
    }

    public async text(options: PromptsAbstraction.TextOptions): Promise<string | null> {
        const validate = options.validate;
        const result = await p.text({
            message: options.message,
            placeholder: options.placeholder,
            defaultValue: options.defaultValue,
            validate: validate ? value => validate(value ?? "") : undefined
        });
        if (p.isCancel(result)) {
            return null;
        }
        return result;
    }
}

export const ClackPrompts = PromptsAbstraction.createImplementation({
    implementation: ClackPromptsImpl,
    dependencies: []
});
```

Create `src/commands/prompts/ClackSpinner.ts`:

```ts
import * as p from "@clack/prompts";
import type { UI } from "./abstractions/UI.ts";

export class ClackSpinner implements UI.Spinner {
    private readonly spinner: ReturnType<typeof p.spinner>;

    public constructor() {
        this.spinner = p.spinner();
    }

    public start(message: string): void {
        this.spinner.start(message);
    }

    public message(message: string): void {
        this.spinner.message(message);
    }

    public stop(message: string): void {
        this.spinner.stop(message);
    }
}
```

Create `src/commands/prompts/ClackUI.ts`:

```ts
import * as p from "@clack/prompts";
import { UI as UIAbstraction } from "./abstractions/UI.ts";
import { ClackSpinner } from "./ClackSpinner.ts";
import { EXIT_CANCELLED } from "~/commands/exitCodes.js";

class ClackUIImpl implements UIAbstraction.Interface {
    public intro(title: string): void {
        p.intro(title);
    }

    public outro(message: string): void {
        p.outro(message);
    }

    public note(message: string, title?: string): void {
        p.note(message, title);
    }

    public warn(message: string): void {
        p.log.warn(message);
    }

    public error(message: string): void {
        p.log.error(message);
    }

    public cancel(message: string): void {
        p.cancel(message);
    }

    public spinner(): UIAbstraction.Spinner {
        return new ClackSpinner();
    }

    public exitOnCancel<T>(value: T | null): T {
        if (value === null) {
            this.cancel("Cancelled.");
            process.exit(EXIT_CANCELLED);
        }
        return value;
    }
}

export const ClackUI = UIAbstraction.createImplementation({
    implementation: ClackUIImpl,
    dependencies: []
});
```

Create `src/commands/prompts/feature.ts`:

```ts
import { createFeature } from "~/base/index.js";
import { ClackPrompts } from "./ClackPrompts.ts";
import { ClackUI } from "./ClackUI.ts";

export const PromptsFeature = createFeature({
    name: "Cli/PromptsFeature",
    register(container) {
        container.register(ClackPrompts).inSingletonScope();
        container.register(ClackUI).inSingletonScope();
    }
});
```

Create `src/commands/prompts/index.ts`:

```ts
export { Prompts, UI } from "./abstractions/index.ts";
export { PromptsFeature } from "./feature.ts";
```

- [ ] **Step 7: Test stubs**

Create `__tests__/commands/prompts/StubPrompts.ts`:

```ts
import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";

export interface StubPromptsScript {
    select?: (unknown | null)[];
    multiselect?: (unknown[] | null)[];
    confirm?: (boolean | null)[];
    text?: (string | null)[];
}

/**
 * Scripted prompts. Each method shifts the next queued answer; an exhausted
 * queue answers `null` (cancel). Every call's options are recorded.
 */
export class StubPrompts implements Prompts.Interface {
    private readonly selects: (unknown | null)[];
    private readonly multiselects: (unknown[] | null)[];
    private readonly confirms: (boolean | null)[];
    private readonly texts: (string | null)[];

    public readonly selectCalls: Prompts.SelectOptions<unknown>[] = [];
    public readonly multiselectCalls: Prompts.MultiselectOptions<unknown>[] = [];
    public readonly confirmCalls: Prompts.ConfirmOptions[] = [];
    public readonly textCalls: Prompts.TextOptions[] = [];

    public constructor(script: StubPromptsScript = {}) {
        this.selects = [...(script.select ?? [])];
        this.multiselects = [...(script.multiselect ?? [])];
        this.confirms = [...(script.confirm ?? [])];
        this.texts = [...(script.text ?? [])];
    }

    public async select<T>(options: Prompts.SelectOptions<T>): Promise<T | null> {
        this.selectCalls.push(options as Prompts.SelectOptions<unknown>);
        const next = this.selects.shift();
        return next === undefined ? null : (next as T);
    }

    public async multiselect<T>(options: Prompts.MultiselectOptions<T>): Promise<T[] | null> {
        this.multiselectCalls.push(options as Prompts.MultiselectOptions<unknown>);
        const next = this.multiselects.shift();
        return next === undefined ? null : (next as T[]);
    }

    public async confirm(options: Prompts.ConfirmOptions): Promise<boolean | null> {
        this.confirmCalls.push(options);
        const next = this.confirms.shift();
        return next === undefined ? null : next;
    }

    public async text(options: Prompts.TextOptions): Promise<string | null> {
        this.textCalls.push(options);
        const next = this.texts.shift();
        return next === undefined ? null : next;
    }
}
```

Create `__tests__/commands/prompts/StubUI.ts`:

```ts
import type { UI } from "~/commands/prompts/abstractions/UI.js";

export class StubCancelError extends Error {
    public constructor() {
        super("StubUI.exitOnCancel: cancelled");
        this.name = "StubCancelError";
    }
}

export interface StubNote {
    message: string;
    title?: string;
}

/** Records every UI call; `exitOnCancel(null)` throws instead of exiting. */
export class StubUI implements UI.Interface {
    public readonly intros: string[] = [];
    public readonly outros: string[] = [];
    public readonly notes: StubNote[] = [];
    public readonly warns: string[] = [];
    public readonly errors: string[] = [];
    public readonly cancels: string[] = [];
    public readonly spinnerMessages: string[] = [];

    public intro(title: string): void {
        this.intros.push(title);
    }

    public outro(message: string): void {
        this.outros.push(message);
    }

    public note(message: string, title?: string): void {
        this.notes.push({ message, title });
    }

    public warn(message: string): void {
        this.warns.push(message);
    }

    public error(message: string): void {
        this.errors.push(message);
    }

    public cancel(message: string): void {
        this.cancels.push(message);
    }

    public spinner(): UI.Spinner {
        const messages = this.spinnerMessages;
        return {
            start(message: string): void {
                messages.push(message);
            },
            message(message: string): void {
                messages.push(message);
            },
            stop(message: string): void {
                messages.push(message);
            }
        };
    }

    public exitOnCancel<T>(value: T | null): T {
        if (value === null) {
            this.cancel("Cancelled.");
            throw new StubCancelError();
        }
        return value;
    }
}
```

Create `__tests__/commands/prompts/StubPrompts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { StubPrompts } from "./StubPrompts.ts";
import { StubUI, StubCancelError } from "./StubUI.ts";

describe("StubPrompts", () => {
    it("answers in order and cancels when exhausted", async () => {
        const prompts = new StubPrompts({ select: ["a"], confirm: [true] });
        expect(await prompts.select({ message: "m", options: [] })).toBe("a");
        expect(await prompts.select({ message: "m", options: [] })).toBeNull();
        expect(await prompts.confirm({ message: "c" })).toBe(true);
        expect(await prompts.confirm({ message: "c" })).toBeNull();
        expect(prompts.selectCalls).toHaveLength(2);
    });
});

describe("StubUI", () => {
    it("exitOnCancel throws on null and passes values through", () => {
        const ui = new StubUI();
        expect(ui.exitOnCancel("x")).toBe("x");
        expect(() => ui.exitOnCancel(null)).toThrow(StubCancelError);
        expect(ui.cancels).toEqual(["Cancelled."]);
    });
});
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `yarn vitest run __tests__/commands/prompts 2>&1 | tail -20`
Expected: All PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json yarn.lock src/commands/exitCodes.ts src/commands/prompts __tests__/commands/prompts
git commit -m "feat(cli): add Prompts and UI abstractions with @clack/prompts implementations"
```

---

### Task 2: `Command` token + `CommandRegistry`

**Files:**
- Create: `src/commands/registry/abstractions/Command.ts`
- Create: `src/commands/registry/abstractions/CommandRegistry.ts`
- Create: `src/commands/registry/abstractions/index.ts`
- Create: `src/commands/registry/CommandRegistry.ts`
- Create: `src/commands/registry/feature.ts`
- Create: `src/commands/registry/index.ts`
- Test: `__tests__/commands/registry/CommandRegistry.test.ts`

**Interfaces:**
- Consumes: `createAbstraction`, `createFeature`, `ContainerToken` from `~/base/index.js`; `Argv` from `yargs`
- Produces: `Command` token (`Command.Interface`, `Command.Argv`), `CommandRegistry` token (`list()`, `menu()`, `get(name)`), `CommandRegistryFeature` — used by Tasks 3–9

- [ ] **Step 1: Write the failing test**

Create `__tests__/commands/registry/CommandRegistry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Argv } from "yargs";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.js";
import { Command } from "~/commands/registry/abstractions/Command.js";
import { CommandRegistry } from "~/commands/registry/abstractions/CommandRegistry.js";
import { CommandRegistryFeature } from "~/commands/registry/feature.js";

let constructed = 0;

class VisibleCommandImpl implements Command.Interface {
    public readonly name = "visible";
    public readonly description = "A visible command";
    public constructor() {
        constructed++;
    }
    public configure(yargs: Argv): Argv {
        return yargs;
    }
    public async run(): Promise<number> {
        return 0;
    }
}

class HiddenCommandImpl implements Command.Interface {
    public readonly name = "hidden <arg>";
    public readonly description = "A hidden command";
    public readonly hidden = true;
    public constructor() {
        constructed++;
    }
    public configure(yargs: Argv): Argv {
        return yargs;
    }
    public async run(): Promise<number> {
        return 7;
    }
}

const VisibleCommand = Command.createImplementation({
    implementation: VisibleCommandImpl,
    dependencies: []
});
const HiddenCommand = Command.createImplementation({
    implementation: HiddenCommandImpl,
    dependencies: []
});

function createContainer(): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    container.register(VisibleCommand).inSingletonScope();
    container.register(HiddenCommand).inSingletonScope();
    CommandRegistryFeature.register(container);
    return container;
}

describe("CommandRegistry", () => {
    it("lists every command in registration order", () => {
        const registry = createContainer().resolve(CommandRegistry);
        expect(registry.list().map(c => c.name)).toEqual(["visible", "hidden <arg>"]);
    });

    it("menu() excludes hidden commands", () => {
        const registry = createContainer().resolve(CommandRegistry);
        expect(registry.menu().map(c => c.name)).toEqual(["visible"]);
    });

    it("get() matches on the first token of the yargs command string", () => {
        const registry = createContainer().resolve(CommandRegistry);
        expect(registry.get("hidden").description).toBe("A hidden command");
    });

    it("get() throws for unknown names", () => {
        const registry = createContainer().resolve(CommandRegistry);
        expect(() => registry.get("nope")).toThrow(/Unknown command "nope"/);
    });

    it("resolves commands lazily on first access", () => {
        constructed = 0;
        const registry = createContainer().resolve(CommandRegistry);
        expect(constructed).toBe(0);
        registry.list();
        registry.list();
        expect(constructed).toBe(2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/registry 2>&1 | tail -20`
Expected: FAIL — modules not found.

- [ ] **Step 3: Abstractions**

Create `src/commands/registry/abstractions/Command.ts`:

```ts
import type { Argv as YargsArgv } from "yargs";
import { createAbstraction } from "~/base/index.js";

export type CommandArgv = Record<string, unknown>;

export interface ICommand {
    /** yargs command string, e.g. "fix-live" or "init <project-name>". */
    readonly name: string;
    /** Shown in the menu and in `--help`. */
    readonly description: string;
    /** Not offered in the interactive menu (still registered with yargs). */
    readonly hidden?: boolean;
    configure(yargs: YargsArgv): YargsArgv;
    /** Resolves the process exit code. */
    run(argv: CommandArgv): Promise<number>;
}

export const Command = createAbstraction<ICommand>("Cli/Command");

export namespace Command {
    export type Interface = ICommand;
    export type Argv = CommandArgv;
}
```

Create `src/commands/registry/abstractions/CommandRegistry.ts`:

```ts
import { createAbstraction } from "~/base/index.js";
import type { Command } from "./Command.ts";

export interface ICommandRegistry {
    /** Every registered command, registration order. */
    list(): Command.Interface[];
    /** Commands offered in the interactive menu (`hidden !== true`). */
    menu(): Command.Interface[];
    /** Lookup by the first token of the command string ("init" matches "init <project-name>"). */
    get(name: string): Command.Interface;
}

export const CommandRegistry = createAbstraction<ICommandRegistry>("Cli/CommandRegistry");

export namespace CommandRegistry {
    export type Interface = ICommandRegistry;
}
```

Create `src/commands/registry/abstractions/index.ts`:

```ts
export { Command } from "./Command.ts";
export { CommandRegistry } from "./CommandRegistry.ts";
```

- [ ] **Step 4: Implementation + feature**

Create `src/commands/registry/CommandRegistry.ts`:

```ts
import type { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.js";
import { Command } from "./abstractions/Command.ts";
import { CommandRegistry as CommandRegistryAbstraction } from "./abstractions/CommandRegistry.ts";

const baseName = (name: string): string => name.split(" ")[0]!;

/**
 * Collects every `Command` implementation. Resolution is deferred to the first
 * call so `container.resolve(CommandRegistry)` at CLI start constructs nothing.
 * Command constructors must stay cheap (Prompts / UI only); heavy work belongs
 * in `run()`.
 */
class CommandRegistryImpl implements CommandRegistryAbstraction.Interface {
    private commands: Command.Interface[] | null = null;

    public constructor(private readonly container: Container) {}

    public list(): Command.Interface[] {
        if (this.commands === null) {
            this.commands = this.container.resolveAll(Command);
        }
        return this.commands;
    }

    public menu(): Command.Interface[] {
        return this.list().filter(command => command.hidden !== true);
    }

    public get(name: string): Command.Interface {
        const found = this.list().find(command => baseName(command.name) === name);
        if (!found) {
            const known = this.list()
                .map(command => baseName(command.name))
                .join(", ");
            throw new Error(`Unknown command "${name}". Known commands: ${known}`);
        }
        return found;
    }
}

export const CommandRegistry = CommandRegistryAbstraction.createImplementation({
    implementation: CommandRegistryImpl,
    dependencies: [ContainerToken]
});
```

Create `src/commands/registry/feature.ts`:

```ts
import { createFeature } from "~/base/index.js";
import { CommandRegistry } from "./CommandRegistry.ts";

export const CommandRegistryFeature = createFeature({
    name: "Cli/CommandRegistryFeature",
    register(container) {
        container.register(CommandRegistry).inSingletonScope();
    }
});
```

Create `src/commands/registry/index.ts`:

```ts
export { Command, CommandRegistry } from "./abstractions/index.ts";
export { CommandRegistryFeature } from "./feature.ts";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/registry 2>&1 | tail -20`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/registry __tests__/commands/registry
git commit -m "feat(cli): add Command token and CommandRegistry"
```

---

### Task 3: Move `src/commands/run/` to `src/commands/transfer/` as `TransferCommand`

**Files:**
- Move: `src/commands/run/**` → `src/commands/transfer/**` (bodies of `handler.ts`, `segmentsFilter.ts`, `wizard/**` unchanged)
- Delete: `src/commands/transfer/register.ts` (after the move)
- Create: `src/commands/transfer/TransferCommand.ts`
- Move: `__tests__/commands/run/**` → `__tests__/commands/transfer/**`; update relative imports there and in `__tests__/commands/segmentsFilter.test.ts`
- Modify: `docs/guides/commands.md` (path on the "Re-running specific shards" line), `docs/project-structure.md`, `docs/pino-logger-implementation.md`, `docs/mcp/guides/pipelineRuntime.md` (path strings only)
- Test: `__tests__/commands/transfer/TransferCommand.test.ts`

**Interfaces:**
- Consumes: `Command`, `EXIT_*`, `handler`, `TransferWizard`, `parseSegmentsFilter`
- Produces: `TransferCommand` (`name: "transfer"`) — used by Tasks 5 and 6

- [ ] **Step 1: Move files**

```bash
git mv src/commands/run src/commands/transfer
git mv __tests__/commands/run __tests__/commands/transfer
sed -i '' 's#src/commands/run/#src/commands/transfer/#g' \
  __tests__/commands/segmentsFilter.test.ts \
  $(grep -rl "src/commands/run/" __tests__/commands/transfer)
sed -i '' 's#src/commands/run/#src/commands/transfer/#g' \
  docs/guides/commands.md docs/project-structure.md docs/pino-logger-implementation.md docs/mcp/guides/pipelineRuntime.md
```

Also in `docs/project-structure.md` rename the tree entry `│   ├── run/                  # Main orchestrator ($0)` to `│   ├── transfer/             # System-to-system transfer (TransferCommand)` and replace the `register.ts` line with `│   │   ├── TransferCommand.ts   # Command impl; --config+--preset → handler, otherwise TransferWizard.run()`.

- [ ] **Step 2: Write the failing test**

Create `__tests__/commands/transfer/TransferCommand.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExitPromptError } from "@inquirer/core";

const handlerSpy = vi.fn(async () => undefined);
const wizardRun = vi.fn();

vi.mock("~/commands/transfer/handler.ts", () => ({ handler: handlerSpy }));
vi.mock("~/commands/transfer/wizard/TransferWizard.ts", () => ({
    TransferWizard: class {
        public run = wizardRun;
    }
}));

import { TransferCommand } from "~/commands/transfer/TransferCommand.js";

beforeEach(() => {
    handlerSpy.mockClear();
    wizardRun.mockReset();
});

describe("TransferCommand", () => {
    it("has the yargs name and is visible in the menu", () => {
        const command = new TransferCommand();
        expect(command.name).toBe("transfer");
        expect(command.hidden).toBeUndefined();
    });

    it("--config + --preset skips the wizard and runs the handler", async () => {
        const code = await new TransferCommand().run({
            config: "./p/config.ts",
            preset: "copy-ddb",
            "dry-run": true,
            segments: [1, 3],
            "log-level": "warn"
        });
        expect(code).toBe(0);
        expect(handlerSpy).toHaveBeenCalledWith("./p/config.ts", "copy-ddb", [1, 3], "warn", true);
        expect(wizardRun).not.toHaveBeenCalled();
    });

    it("wizard returning null (env written) exits 0 without running", async () => {
        wizardRun.mockResolvedValue(null);
        expect(await new TransferCommand().run({})).toBe(0);
        expect(handlerSpy).not.toHaveBeenCalled();
    });

    it("wizard result is passed to the handler", async () => {
        wizardRun.mockResolvedValue({ configPath: "/c.ts", preset: "v5-to-v6-ddb", dryRun: false });
        expect(await new TransferCommand().run({})).toBe(0);
        expect(handlerSpy).toHaveBeenCalledWith("/c.ts", "v5-to-v6-ddb", undefined, undefined, false);
    });

    it("inquirer cancel exits 130", async () => {
        wizardRun.mockRejectedValue(new ExitPromptError("cancelled"));
        expect(await new TransferCommand().run({})).toBe(130);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/transfer/TransferCommand.test.ts 2>&1 | tail -20`
Expected: FAIL — `TransferCommand` module not found.

- [ ] **Step 4: Create `TransferCommand.ts`, delete `register.ts`**

Create `src/commands/transfer/TransferCommand.ts` (option definitions copied verbatim from `register.ts`):

```ts
import type { Argv } from "yargs";
import { ExitPromptError } from "@inquirer/core";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { EXIT_CANCELLED, EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";
import { parseSegmentsFilter } from "./segmentsFilter.ts";
import { TransferWizard } from "./wizard/TransferWizard.ts";

class TransferCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "transfer";
    public readonly description = "Transfer Webiny data from a source system to a target system";

    public configure(yargs: Argv): Argv {
        return yargs
            .option("config", {
                type: "string",
                demandOption: false,
                description: "Path to configuration file"
            })
            .option("preset", {
                type: "string",
                demandOption: false,
                description: "Preset name to run"
            })
            .option("dry-run", {
                type: "boolean",
                default: false,
                description: "Read source but skip all writes to target"
            })
            .option("segments", {
                type: "string",
                description:
                    "Comma-separated list of segment indices to run (e.g. `1,3`). " +
                    "Use to re-run specific shards after a failure. Defaults to all."
            })
            .coerce("segments", parseSegmentsFilter)
            .option("log-level", {
                type: "string",
                choices: ["debug", "info", "warn", "error"] as const,
                description: "Log level (default: info)"
            });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        const configPath = argv.config as string | undefined;
        const preset = argv.preset as string | undefined;
        const logLevel = argv["log-level"] as string | undefined;
        const dryRun = Boolean(argv["dry-run"]);
        const segments = argv.segments as number[] | undefined;

        if (configPath && preset) {
            await handler(configPath, preset, segments, logLevel, dryRun);
            return EXIT_OK;
        }

        const wizard = new TransferWizard(process.cwd());
        try {
            const result = await wizard.run();
            if (result === null) {
                return EXIT_OK;
            }
            await handler(result.configPath, result.preset, segments, logLevel, result.dryRun);
            return EXIT_OK;
        } catch (error) {
            if (error instanceof ExitPromptError) {
                return EXIT_CANCELLED;
            }
            throw error;
        }
    }
}

export const TransferCommand = CommandAbstraction.createImplementation({
    implementation: TransferCommandImpl,
    dependencies: []
});
```

```bash
git rm src/commands/transfer/register.ts
```

`src/commands/index.ts` and `src/cli.ts` are now broken; Task 4 and Task 5 fix them. Type-check is expected to fail until then.

- [ ] **Step 5: Run the moved tests**

Run: `yarn vitest run __tests__/commands 2>&1 | tail -20`
Expected: All PASS (wizard tests unchanged apart from paths; `TransferCommand.test.ts` green).

- [ ] **Step 6: Commit**

```bash
git add -A src/commands/transfer __tests__/commands docs/guides/commands.md docs/project-structure.md docs/pino-logger-implementation.md docs/mcp/guides/pipelineRuntime.md
git commit -m "refactor(cli): move commands/run to commands/transfer as TransferCommand"
```

---

### Task 4: Wrap `init`, `init-project`, `process-segment`, `update-skills` as `Command` implementations

**Files:**
- Create: `src/commands/init/InitCommand.ts`, `src/commands/initProject/InitProjectCommand.ts`, `src/commands/processSegment/ProcessSegmentCommand.ts`, `src/commands/updateSkills/UpdateSkillsCommand.ts`
- Delete: the four `register.ts` files
- Modify: `src/commands/index.ts`
- Test: `__tests__/commands/commandWrappers.test.ts`

**Interfaces:**
- Consumes: existing `handler` functions (bodies untouched), `Command`, `EXIT_OK`
- Produces: four `Command` implementations, all `hidden: true` (need positionals or are worker/maintenance entry points) — used by Task 5

- [ ] **Step 1: Write the failing test**

Create `__tests__/commands/commandWrappers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const initHandler = vi.fn(async () => undefined);
const initProjectHandler = vi.fn(async () => undefined);
const processSegmentHandler = vi.fn(async () => undefined);
const updateSkillsHandler = vi.fn();

vi.mock("~/commands/init/handler.ts", () => ({ handler: initHandler }));
vi.mock("~/commands/initProject/handler.ts", () => ({ handler: initProjectHandler }));
vi.mock("~/commands/processSegment/handler.ts", () => ({ handler: processSegmentHandler }));
vi.mock("~/commands/updateSkills/handler.ts", () => ({ handler: updateSkillsHandler }));

import { InitCommand } from "~/commands/init/InitCommand.js";
import { InitProjectCommand } from "~/commands/initProject/InitProjectCommand.js";
import { ProcessSegmentCommand } from "~/commands/processSegment/ProcessSegmentCommand.js";
import { UpdateSkillsCommand } from "~/commands/updateSkills/UpdateSkillsCommand.js";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("command wrappers", () => {
    it("are hidden from the menu and keep their yargs command strings", () => {
        expect(new InitCommand().name).toBe("init <project-name>");
        expect(new InitProjectCommand().name).toBe("init-project <name>");
        expect(new ProcessSegmentCommand().name).toBe("process-segment");
        expect(new UpdateSkillsCommand().name).toBe("update-skills");
        for (const command of [
            new InitCommand(),
            new InitProjectCommand(),
            new ProcessSegmentCommand(),
            new UpdateSkillsCommand()
        ]) {
            expect(command.hidden).toBe(true);
        }
    });

    it("init maps project-name", async () => {
        expect(await new InitCommand().run({ "project-name": "my-app" })).toBe(0);
        expect(initHandler).toHaveBeenCalledWith({ projectName: "my-app" });
    });

    it("init-project passes the name", async () => {
        expect(await new InitProjectCommand().run({ name: "prod" })).toBe(0);
        expect(initProjectHandler).toHaveBeenCalledWith("prod");
    });

    it("process-segment maps kebab-case flags", async () => {
        const code = await new ProcessSegmentCommand().run({
            runId: "r1",
            segment: 2,
            total: 4,
            config: "/c.ts",
            preset: "copy-ddb",
            "log-level": "info",
            "dry-run": true
        });
        expect(code).toBe(0);
        expect(processSegmentHandler).toHaveBeenCalledWith({
            runId: "r1",
            segment: 2,
            total: 4,
            config: "/c.ts",
            preset: "copy-ddb",
            logLevel: "info",
            dryRun: true
        });
    });

    it("update-skills calls its handler", async () => {
        expect(await new UpdateSkillsCommand().run({})).toBe(0);
        expect(updateSkillsHandler).toHaveBeenCalledOnce();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run __tests__/commands/commandWrappers.test.ts 2>&1 | tail -20`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the wrappers**

Create `src/commands/init/InitCommand.ts`:

```ts
import type { Argv } from "yargs";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";

class InitCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "init <project-name>";
    public readonly description = "Scaffold a new data transfer project";
    // Needs a positional argument — not runnable from the menu.
    public readonly hidden = true;

    public configure(yargs: Argv): Argv {
        return yargs.positional("project-name", {
            type: "string",
            demandOption: true,
            description: "Name of the project directory to create"
        });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        await handler({ projectName: argv["project-name"] as string });
        return EXIT_OK;
    }
}

export const InitCommand = CommandAbstraction.createImplementation({
    implementation: InitCommandImpl,
    dependencies: []
});
```

Create `src/commands/initProject/InitProjectCommand.ts`:

```ts
import type { Argv } from "yargs";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";

class InitProjectCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "init-project <name>";
    public readonly description = "Scaffold a new project in the projects/ directory";
    // Needs a positional argument — not runnable from the menu.
    public readonly hidden = true;

    public configure(yargs: Argv): Argv {
        return yargs.positional("name", {
            type: "string",
            demandOption: true,
            description: "Name of the project folder to create under projects/"
        });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        await handler(argv.name as string);
        return EXIT_OK;
    }
}

export const InitProjectCommand = CommandAbstraction.createImplementation({
    implementation: InitProjectCommandImpl,
    dependencies: []
});
```

Create `src/commands/processSegment/ProcessSegmentCommand.ts` (options verbatim from `register.ts`):

```ts
import type { Argv } from "yargs";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";

class ProcessSegmentCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "process-segment";
    public readonly description =
        "Process a specific DDB segment (used internally by worker processes)";
    // Worker entry point spawned by the transfer orchestrator — never offered in the menu.
    public readonly hidden = true;

    public configure(yargs: Argv): Argv {
        return yargs
            .option("runId", { type: "string", demandOption: true, description: "Run ID" })
            .option("segment", { type: "number", demandOption: true, description: "Segment number" })
            .option("total", { type: "number", demandOption: true, description: "Total segments" })
            .option("config", { type: "string", demandOption: true, description: "Config file path" })
            .option("preset", {
                type: "string",
                demandOption: true,
                description: "Preset name to use for this segment"
            })
            .option("log-level", {
                type: "string",
                choices: ["debug", "info", "warn", "error"] as const,
                description: "Log level"
            })
            .option("dry-run", {
                type: "boolean",
                default: false,
                description: "Skip all writes to the target system"
            });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        await handler({
            runId: argv.runId as string,
            segment: argv.segment as number,
            total: argv.total as number,
            config: argv.config as string,
            preset: argv.preset as string,
            logLevel: argv["log-level"] as string | undefined,
            dryRun: argv["dry-run"] as boolean | undefined
        });
        return EXIT_OK;
    }
}

export const ProcessSegmentCommand = CommandAbstraction.createImplementation({
    implementation: ProcessSegmentCommandImpl,
    dependencies: []
});
```

Create `src/commands/updateSkills/UpdateSkillsCommand.ts`:

```ts
import type { Argv } from "yargs";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { EXIT_OK } from "~/commands/exitCodes.js";
import { handler } from "./handler.ts";

class UpdateSkillsCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "update-skills";
    public readonly description =
        "Update Claude Code skills from the installed @webiny/data-transfer package";
    public readonly hidden = true;

    public configure(yargs: Argv): Argv {
        return yargs;
    }

    public async run(): Promise<number> {
        handler();
        return EXIT_OK;
    }
}

export const UpdateSkillsCommand = CommandAbstraction.createImplementation({
    implementation: UpdateSkillsCommandImpl,
    dependencies: []
});
```

```bash
git rm src/commands/init/register.ts src/commands/initProject/register.ts \
       src/commands/processSegment/register.ts src/commands/updateSkills/register.ts
```

Replace `src/commands/index.ts` with:

```ts
export { TransferCommand } from "./transfer/TransferCommand.ts";
export { InitCommand } from "./init/InitCommand.ts";
export { InitProjectCommand } from "./initProject/InitProjectCommand.ts";
export { ProcessSegmentCommand } from "./processSegment/ProcessSegmentCommand.ts";
export { UpdateSkillsCommand } from "./updateSkills/UpdateSkillsCommand.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run __tests__/commands/commandWrappers.test.ts 2>&1 | tail -20`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/commands __tests__/commands/commandWrappers.test.ts
git commit -m "refactor(cli): wrap init, init-project, process-segment, update-skills as Command implementations"
```

---

### Task 5: CLI container, menu, default dispatch, new `src/cli.ts`

**Files:**
- Create: `src/commands/cliContainer.ts`, `src/commands/openMenu.ts`, `src/commands/dispatchDefault.ts`
- Modify: `src/cli.ts`
- Test: `__tests__/commands/openMenu.test.ts`, `__tests__/commands/dispatchDefault.test.ts`

**Interfaces:**
- Consumes: `PromptsFeature`, `CommandRegistryFeature`, the five `Command` implementations, `Prompts`, `UI`
- Produces: `createCliContainer()`, `openMenu(input)`, `dispatchDefault(input)`; `yarn transfer` → menu, `yarn transfer --config --preset` → transfer, `yarn transfer <folder>` → init

- [ ] **Step 1: Write the failing tests**

Create `__tests__/commands/dispatchDefault.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { Command } from "~/commands/registry/abstractions/Command.js";
import type { CommandRegistry } from "~/commands/registry/abstractions/CommandRegistry.js";
import { dispatchDefault } from "~/commands/dispatchDefault.js";

function fakeRegistry(runs: Record<string, ReturnType<typeof vi.fn>>): CommandRegistry.Interface {
    const commands = Object.entries(runs).map(
        ([name, run]) => ({ name, description: name, configure: y => y, run }) as Command.Interface
    );
    return {
        list: () => commands,
        menu: () => commands,
        get: (name: string) => commands.find(c => c.name === name)!
    };
}

describe("dispatchDefault", () => {
    it("`yarn transfer <folder>` runs init with the folder as project-name", async () => {
        const init = vi.fn(async () => 0);
        const openMenu = vi.fn(async () => 130);
        const code = await dispatchDefault({
            argv: { folder: "my-folder" },
            registry: fakeRegistry({ init, transfer: vi.fn() }),
            openMenu
        });
        expect(code).toBe(0);
        expect(init).toHaveBeenCalledWith({ folder: "my-folder", "project-name": "my-folder" });
        expect(openMenu).not.toHaveBeenCalled();
    });

    it("`yarn transfer --config --preset` runs the transfer command", async () => {
        const transfer = vi.fn(async () => 0);
        const argv = { config: "./c.ts", preset: "copy-ddb" };
        const code = await dispatchDefault({
            argv,
            registry: fakeRegistry({ init: vi.fn(), transfer }),
            openMenu: vi.fn(async () => 130)
        });
        expect(code).toBe(0);
        expect(transfer).toHaveBeenCalledWith(argv);
    });

    it("`--config` alone still routes to transfer (wizard prompts for the rest)", async () => {
        const transfer = vi.fn(async () => 0);
        await dispatchDefault({
            argv: { config: "./c.ts" },
            registry: fakeRegistry({ init: vi.fn(), transfer }),
            openMenu: vi.fn(async () => 130)
        });
        expect(transfer).toHaveBeenCalledOnce();
    });

    it("no arguments opens the menu and returns its exit code", async () => {
        const openMenu = vi.fn(async () => 130);
        const code = await dispatchDefault({
            argv: {},
            registry: fakeRegistry({ init: vi.fn(), transfer: vi.fn() }),
            openMenu
        });
        expect(code).toBe(130);
        expect(openMenu).toHaveBeenCalledOnce();
    });
});
```

Create `__tests__/commands/openMenu.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { Command } from "~/commands/registry/abstractions/Command.js";
import type { CommandRegistry } from "~/commands/registry/abstractions/CommandRegistry.js";
import { openMenu } from "~/commands/openMenu.js";
import { StubPrompts } from "./prompts/StubPrompts.ts";
import { StubUI } from "./prompts/StubUI.ts";

const command = (name: string, run: Command.Interface["run"], hidden?: boolean) =>
    ({ name, description: `${name} desc`, hidden, configure: y => y, run }) as Command.Interface;

function registry(commands: Command.Interface[]): CommandRegistry.Interface {
    return {
        list: () => commands,
        menu: () => commands.filter(c => c.hidden !== true),
        get: (name: string) => commands.find(c => c.name === name)!
    };
}

describe("openMenu", () => {
    it("offers only non-hidden commands with descriptions as hints", async () => {
        const prompts = new StubPrompts({ select: ["transfer"] });
        const transfer = vi.fn(async () => 0);
        await openMenu({
            prompts,
            ui: new StubUI(),
            registry: registry([
                command("transfer", transfer),
                command("fix-live", vi.fn()),
                command("process-segment", vi.fn(), true)
            ])
        });
        expect(prompts.selectCalls[0]!.options).toEqual([
            { value: "transfer", label: "transfer", hint: "transfer desc" },
            { value: "fix-live", label: "fix-live", hint: "fix-live desc" }
        ]);
        expect(transfer).toHaveBeenCalledWith({});
    });

    it("returns the chosen command's exit code", async () => {
        const code = await openMenu({
            prompts: new StubPrompts({ select: ["fix-live"] }),
            ui: new StubUI(),
            registry: registry([command("transfer", vi.fn()), command("fix-live", async () => 1)])
        });
        expect(code).toBe(1);
    });

    it("exits 130 on cancel", async () => {
        const ui = new StubUI();
        const code = await openMenu({
            prompts: new StubPrompts(),
            ui,
            registry: registry([command("transfer", vi.fn())])
        });
        expect(code).toBe(130);
        expect(ui.cancels).toEqual(["Cancelled."]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run __tests__/commands/openMenu.test.ts __tests__/commands/dispatchDefault.test.ts 2>&1 | tail -20`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `src/commands/dispatchDefault.ts`:

```ts
import type { Command } from "./registry/abstractions/Command.ts";
import type { CommandRegistry } from "./registry/abstractions/CommandRegistry.ts";

export interface DispatchDefaultInput {
    argv: Command.Argv;
    registry: CommandRegistry.Interface;
    openMenu: () => Promise<number>;
}

/**
 * Handler for the `$0 [folder]` default command. Preserves the two historical
 * no-command invocations before falling back to the interactive menu:
 *   `yarn transfer my-folder`              → init my-folder
 *   `yarn transfer --config=… --preset=…`  → transfer
 */
export async function dispatchDefault(input: DispatchDefaultInput): Promise<number> {
    const { argv, registry, openMenu } = input;
    const folder = argv.folder;
    if (typeof folder === "string" && folder.length > 0) {
        return registry.get("init").run({ ...argv, "project-name": folder });
    }
    if (argv.config || argv.preset) {
        return registry.get("transfer").run(argv);
    }
    return openMenu();
}
```

Create `src/commands/openMenu.ts`:

```ts
import type { Prompts } from "./prompts/abstractions/Prompts.ts";
import type { UI } from "./prompts/abstractions/UI.ts";
import type { CommandRegistry } from "./registry/abstractions/CommandRegistry.ts";
import { EXIT_CANCELLED } from "./exitCodes.ts";

export interface OpenMenuInput {
    prompts: Prompts.Interface;
    ui: UI.Interface;
    registry: CommandRegistry.Interface;
}

export async function openMenu(input: OpenMenuInput): Promise<number> {
    const { prompts, ui, registry } = input;
    ui.intro("Webiny data transfer");
    const chosen = await prompts.select<string>({
        message: "What do you want to do?",
        options: registry.menu().map(command => ({
            value: command.name,
            label: command.name,
            hint: command.description
        }))
    });
    if (chosen === null) {
        ui.cancel("Cancelled.");
        return EXIT_CANCELLED;
    }
    // Empty argv: the command prompts for everything it needs.
    return registry.get(chosen).run({});
}
```

Create `src/commands/cliContainer.ts`:

```ts
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.js";
import { PromptsFeature } from "./prompts/feature.ts";
import { CommandRegistryFeature } from "./registry/feature.ts";
import {
    TransferCommand,
    InitCommand,
    InitProjectCommand,
    ProcessSegmentCommand,
    UpdateSkillsCommand
} from "./index.ts";

/**
 * Lightweight container for the CLI shell. It knows nothing about a project
 * config — commands build the per-project container (`bootstrap`) inside `run()`.
 */
export function createCliContainer(): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    PromptsFeature.register(container);
    CommandRegistryFeature.register(container);
    container.register(TransferCommand).inSingletonScope();
    container.register(InitCommand).inSingletonScope();
    container.register(InitProjectCommand).inSingletonScope();
    container.register(ProcessSegmentCommand).inSingletonScope();
    container.register(UpdateSkillsCommand).inSingletonScope();
    return container;
}
```

Replace the section of `src/cli.ts` from `import yargs` to the end (keep the `tsx` register, the `suppressDeprecations` import and the `unhandledRejection` block exactly as they are):

```ts
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createCliContainer } from "./commands/cliContainer.ts";
import { CommandRegistry } from "./commands/registry/index.ts";
import { Prompts, UI } from "./commands/prompts/index.ts";
import { openMenu } from "./commands/openMenu.ts";
import { dispatchDefault } from "./commands/dispatchDefault.ts";

// … unhandledRejection block unchanged …

const container = createCliContainer();
const registry = container.resolve(CommandRegistry);
const transfer = registry.get("transfer");

let cli = yargs(hideBin(process.argv)).scriptName("transfer");

for (const command of registry.list()) {
    cli = cli.command(
        command.name,
        command.description,
        y => command.configure(y),
        async argv => {
            process.exitCode = await command.run(argv);
        }
    );
}

// Default command: keeps `yarn transfer <folder>` and `yarn transfer --config --preset`
// working; with no arguments it opens the menu.
cli = cli.command(
    "$0 [folder]",
    false,
    y =>
        transfer.configure(y).positional("folder", {
            type: "string",
            description: "Scaffold a new project folder (same as `init <folder>`)"
        }),
    async argv => {
        process.exitCode = await dispatchDefault({
            argv,
            registry,
            openMenu: () =>
                openMenu({
                    prompts: container.resolve(Prompts),
                    ui: container.resolve(UI),
                    registry
                })
        });
    }
);

await cli.strict().help().parseAsync();
```

Delete the old `KNOWN_COMMANDS` block and the `registerXCommand` imports.

- [ ] **Step 4: Run tests and type-check**

Run: `yarn vitest run __tests__/commands 2>&1 | tail -20 && yarn ts-check`
Expected: All PASS; 0 type errors.

- [ ] **Step 5: Smoke the three entry paths manually**

```bash
yarn transfer --help | head -20          # lists transfer, fix-live (after Task 8), init…, process-segment
yarn transfer transfer --help | head -5  # transfer flags
yarn transfer                            # menu appears; Ctrl+C → exit code 130 (echo $?)
```

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts src/commands/cliContainer.ts src/commands/openMenu.ts src/commands/dispatchDefault.ts __tests__/commands/openMenu.test.ts __tests__/commands/dispatchDefault.test.ts
git commit -m "feat(cli): command menu with backwards-compatible default dispatch"
```

---

### Task 6: `fix-live` steps — outcome type, `selectProject`, `selectSystem`, `confirmSystem`

**Files:**
- Create: `src/commands/fixLive/types.ts`, `src/commands/fixLive/steps/outcome.ts`, `src/commands/fixLive/steps/selectProject.ts`, `src/commands/fixLive/steps/selectSystem.ts`, `src/commands/fixLive/steps/confirmSystem.ts`
- Test: `__tests__/commands/fixLive/steps/selectProject.test.ts`, `selectSystem.test.ts`, `confirmSystem.test.ts`

**Interfaces:**
- Consumes: `Prompts`, `UI`, `discoverProjects` (`~/commands/transfer/wizard/projectDiscovery.js`), `MigrationConfig.Interface`
- Produces: `StepOutcome<T>` + `ok` / `cancelled` / `refused` helpers, `SystemName`, `TableKind`, `SystemConfig`, three step functions — used by Task 8

- [ ] **Step 1: Shared types**

Create `src/commands/fixLive/types.ts`:

```ts
import type { MigrationConfig } from "~/features/MigrationConfig/index.js";

export type SystemName = "source" | "target";
export type TableKind = "ddb" | "os";
export type SystemConfig = MigrationConfig.Interface["source"] | MigrationConfig.Interface["target"];
```

Create `src/commands/fixLive/steps/outcome.ts`:

```ts
export interface StepOk<T> {
    kind: "ok";
    value: T;
}

export interface StepCancelled {
    kind: "cancelled";
}

export interface StepRefused {
    kind: "refused";
    message: string;
}

export type StepOutcome<T> = StepOk<T> | StepCancelled | StepRefused;

export const ok = <T>(value: T): StepOk<T> => ({ kind: "ok", value });
export const cancelled = (): StepCancelled => ({ kind: "cancelled" });
export const refused = (message: string): StepRefused => ({ kind: "refused", message });
```

- [ ] **Step 2: Failing tests**

Create `__tests__/commands/fixLive/steps/selectProject.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("~/commands/transfer/wizard/projectDiscovery.ts", () => ({
    discoverProjects: vi.fn(async () => ["acme", "beta"])
}));

import { selectProject } from "~/commands/fixLive/steps/selectProject.js";
import { StubPrompts } from "../../prompts/StubPrompts.ts";

describe("selectProject", () => {
    it("uses --project when it exists", async () => {
        const prompts = new StubPrompts();
        const result = await selectProject({ prompts, cwd: "/w", projectArg: "beta" });
        expect(result).toEqual({ kind: "ok", value: "beta" });
        expect(prompts.selectCalls).toHaveLength(0);
    });

    it("refuses an unknown --project", async () => {
        const result = await selectProject({ prompts: new StubPrompts(), cwd: "/w", projectArg: "x" });
        expect(result.kind).toBe("refused");
        expect((result as { message: string }).message).toMatch(/Project "x" not found.*acme, beta/);
    });

    it("prompts and returns the choice", async () => {
        const prompts = new StubPrompts({ select: ["acme"] });
        expect(await selectProject({ prompts, cwd: "/w" })).toEqual({ kind: "ok", value: "acme" });
        expect(prompts.selectCalls[0]!.message).toBe("Select a project");
    });

    it("cancel → cancelled", async () => {
        expect(await selectProject({ prompts: new StubPrompts(), cwd: "/w" })).toEqual({
            kind: "cancelled"
        });
    });
});
```

Create `__tests__/commands/fixLive/steps/selectSystem.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { MigrationConfig } from "~/features/MigrationConfig/index.js";
import { selectSystem, formatSystemHint } from "~/commands/fixLive/steps/selectSystem.js";
import { StubPrompts } from "../../prompts/StubPrompts.ts";

const CREDS = { accessKeyId: "a", secretAccessKey: "b" };

export const CONFIG: MigrationConfig.Interface = {
    source: {
        region: "eu-central-1",
        credentials: CREDS,
        dynamodb: { tableName: "acme-src-ddb" },
        s3: { bucket: "acme-src-s3" }
    },
    target: {
        region: "us-east-1",
        credentials: CREDS,
        accountId: "123456789012",
        dynamodb: { tableName: "acme-prod-ddb" },
        s3: { bucket: "acme-prod-s3" },
        opensearch: {
            endpoint: "https://os.example.com",
            tableName: "acme-prod-os",
            service: "opensearch",
            indexPrefix: ""
        }
    },
    pipeline: { segments: 4 }
};

describe("selectSystem", () => {
    it("formats the hint with ddb table, region and os table or none", () => {
        expect(formatSystemHint(CONFIG.source)).toBe(
            "ddb: acme-src-ddb · region: eu-central-1 · os table: none"
        );
        expect(formatSystemHint(CONFIG.target)).toBe(
            "ddb: acme-prod-ddb · region: us-east-1 · os table: acme-prod-os"
        );
    });

    it("uses --system without prompting", async () => {
        const prompts = new StubPrompts();
        expect(await selectSystem({ prompts, config: CONFIG, systemArg: "target" })).toEqual({
            kind: "ok",
            value: "target"
        });
        expect(prompts.selectCalls).toHaveLength(0);
    });

    it("prompts with hints and returns the choice; cancel → cancelled", async () => {
        const prompts = new StubPrompts({ select: ["source"] });
        expect(await selectSystem({ prompts, config: CONFIG })).toEqual({ kind: "ok", value: "source" });
        expect(prompts.selectCalls[0]!.options.map(o => o.hint)).toEqual([
            formatSystemHint(CONFIG.source),
            formatSystemHint(CONFIG.target)
        ]);
        expect(await selectSystem({ prompts: new StubPrompts(), config: CONFIG })).toEqual({
            kind: "cancelled"
        });
    });
});
```

Create `__tests__/commands/fixLive/steps/confirmSystem.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { confirmSystem, formatSystemSummary } from "~/commands/fixLive/steps/confirmSystem.js";
import { StubPrompts } from "../../prompts/StubPrompts.ts";
import { StubUI } from "../../prompts/StubUI.ts";
import { CONFIG } from "./selectSystem.test.ts";

describe("confirmSystem", () => {
    it("summary shows endpoint only for target and account id or unknown", () => {
        const target = formatSystemSummary("target", CONFIG.target);
        expect(target).toContain("os endpoint:  https://os.example.com");
        expect(target).toContain("account id:   123456789012");
        const source = formatSystemSummary("source", CONFIG.source);
        expect(source).not.toContain("os endpoint");
        expect(source).toContain("os table:     none");
        expect(source).toContain("account id:   unknown");
    });

    it("--yes skips the confirm but still prints the note", async () => {
        const ui = new StubUI();
        const prompts = new StubPrompts();
        const result = await confirmSystem({ prompts, ui, system: "target", config: CONFIG.target, yes: true });
        expect(result).toEqual({ kind: "ok", value: true });
        expect(ui.notes[0]!.title).toBe("System summary");
        expect(prompts.confirmCalls).toHaveLength(0);
    });

    it("confirm defaults to no; yes → ok, no or cancel → cancelled", async () => {
        const yes = new StubPrompts({ confirm: [true] });
        expect(
            await confirmSystem({ prompts: yes, ui: new StubUI(), system: "target", config: CONFIG.target, yes: false })
        ).toEqual({ kind: "ok", value: true });
        expect(yes.confirmCalls[0]!.initialValue).toBe(false);
        expect(yes.confirmCalls[0]!.message).toBe(
            "This is the system whose records will be modified. Continue?"
        );
        const no = new StubPrompts({ confirm: [false] });
        expect(
            await confirmSystem({ prompts: no, ui: new StubUI(), system: "target", config: CONFIG.target, yes: false })
        ).toEqual({ kind: "cancelled" });
        expect(
            await confirmSystem({ prompts: new StubPrompts(), ui: new StubUI(), system: "target", config: CONFIG.target, yes: false })
        ).toEqual({ kind: "cancelled" });
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn vitest run __tests__/commands/fixLive 2>&1 | tail -20`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the steps**

Create `src/commands/fixLive/steps/selectProject.ts`:

```ts
import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import { discoverProjects } from "~/commands/transfer/wizard/projectDiscovery.js";
import { type StepOutcome, ok, cancelled, refused } from "./outcome.ts";

export interface SelectProjectInput {
    prompts: Prompts.Interface;
    cwd: string;
    projectArg?: string;
}

export async function selectProject(input: SelectProjectInput): Promise<StepOutcome<string>> {
    const projects = await discoverProjects(input.cwd);

    if (input.projectArg) {
        if (!projects.includes(input.projectArg)) {
            return refused(
                `Project "${input.projectArg}" not found under projects/. Available: ${projects.join(", ") || "none"}`
            );
        }
        return ok(input.projectArg);
    }

    if (projects.length === 0) {
        return refused(
            "No projects found under projects/. Run `yarn transfer init-project <name>` first."
        );
    }

    const chosen = await input.prompts.select<string>({
        message: "Select a project",
        options: projects.map(project => ({ value: project, label: project }))
    });
    if (chosen === null) {
        return cancelled();
    }
    return ok(chosen);
}
```

Create `src/commands/fixLive/steps/selectSystem.ts`:

```ts
import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import type { MigrationConfig } from "~/features/MigrationConfig/index.js";
import type { SystemConfig, SystemName } from "../types.ts";
import { type StepOutcome, ok, cancelled } from "./outcome.ts";

export interface SelectSystemInput {
    prompts: Prompts.Interface;
    config: MigrationConfig.Interface;
    systemArg?: SystemName;
}

export function formatSystemHint(system: SystemConfig): string {
    const osTable = system.opensearch ? system.opensearch.tableName : "none";
    return `ddb: ${system.dynamodb.tableName} · region: ${system.region} · os table: ${osTable}`;
}

export async function selectSystem(input: SelectSystemInput): Promise<StepOutcome<SystemName>> {
    if (input.systemArg) {
        return ok(input.systemArg);
    }
    const chosen = await input.prompts.select<SystemName>({
        message: "Which system?",
        options: [
            { value: "source", label: "source", hint: formatSystemHint(input.config.source) },
            { value: "target", label: "target", hint: formatSystemHint(input.config.target) }
        ]
    });
    if (chosen === null) {
        return cancelled();
    }
    return ok(chosen);
}
```

Create `src/commands/fixLive/steps/confirmSystem.ts`:

```ts
import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import type { UI } from "~/commands/prompts/abstractions/UI.js";
import type { SystemConfig, SystemName } from "../types.ts";
import { type StepOutcome, ok, cancelled } from "./outcome.ts";

export interface ConfirmSystemInput {
    prompts: Prompts.Interface;
    ui: UI.Interface;
    system: SystemName;
    config: SystemConfig;
    yes: boolean;
}

export function formatSystemSummary(system: SystemName, config: SystemConfig): string {
    const lines = [
        `system:       ${system}`,
        `region:       ${config.region}`,
        `ddb table:    ${config.dynamodb.tableName}`,
        `os table:     ${config.opensearch ? config.opensearch.tableName : "none"}`
    ];
    // Source systems have no endpoint in the config schema (unified.schema.ts).
    if (config.opensearch && "endpoint" in config.opensearch) {
        lines.push(`os endpoint:  ${config.opensearch.endpoint}`);
    }
    lines.push(`account id:   ${config.accountId ?? "unknown"}`);
    return lines.join("\n");
}

export async function confirmSystem(input: ConfirmSystemInput): Promise<StepOutcome<true>> {
    input.ui.note(formatSystemSummary(input.system, input.config), "System summary");
    if (input.yes) {
        return ok(true);
    }
    const answer = await input.prompts.confirm({
        message: "This is the system whose records will be modified. Continue?",
        initialValue: false
    });
    if (answer !== true) {
        return cancelled();
    }
    return ok(true);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn vitest run __tests__/commands/fixLive 2>&1 | tail -20`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/fixLive __tests__/commands/fixLive
git commit -m "feat(fix-live): project, system and confirm steps"
```

---

### Task 7: `fix-live` steps — `guardV6`, `selectMode`

**Files:**
- Create: `src/commands/fixLive/steps/guardV6.ts`, `src/commands/fixLive/steps/selectMode.ts`
- Test: `__tests__/commands/fixLive/steps/guardV6.test.ts`, `__tests__/commands/fixLive/steps/selectMode.test.ts`

**Interfaces:**
- Consumes: `SourceDynamoDbClient.Interface` (`scan` with `sortKeyEquals` / `limit` — sibling plan step 2), `isCmsEntry` / `isFmFile` from `~/domain/transform/filters.js`, `FixLiveState.File`, `LiveFieldRunner.Mode` from `~/features/FixLive/index.js`
- Produces: `guardV6(input)`, `selectMode(input)`, `NO_DRY_RUN_MESSAGE` — used by Task 8

- [ ] **Step 1: Failing tests**

Create `__tests__/commands/fixLive/steps/guardV6.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { guardV6 } from "~/commands/fixLive/steps/guardV6.js";
import { MockDynamoDbClient } from "../../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { StubUI } from "../../prompts/StubUI.ts";

const base = { _et: "CmsEntries", _ct: "2026-01-01T00:00:00.000Z", _md: "2026-01-01T00:00:00.000Z" };

const v6Entry = {
    ...base,
    PK: "T#root#L#en-US#CMS#CME#abc",
    SK: "L",
    TYPE: "cms.entry.l",
    data: { modelId: "article", version: 1, status: "draft" }
};
const v5Entry = {
    ...base,
    PK: "T#root#L#en-US#CMS#CME#abc",
    SK: "L",
    TYPE: "cms.entry.l",
    modelId: "article",
    version: 1,
    status: "draft"
};
const fmFile = {
    ...base,
    PK: "T#root#L#en-US#CMS#CME#file1",
    SK: "L",
    TYPE: "cms.entry.l",
    data: { modelId: "fmFile", version: 1 }
};
const settings = { ...base, PK: "T#root#SETTINGS", SK: "A", TYPE: "settings" };

const run = (rows: object[]) =>
    guardV6({
        client: new MockDynamoDbClient({ t: rows as never }),
        tableName: "t",
        region: "eu-central-1",
        ui: new StubUI()
    });

describe("guardV6", () => {
    it("passes on a v6 CMS entry (data object at the root)", async () => {
        expect(await run([settings, fmFile, v6Entry])).toEqual({ kind: "ok", value: "v6" });
    });

    it("refuses a v5 table with the table name and region", async () => {
        const result = await run([settings, v5Entry]);
        expect(result.kind).toBe("refused");
        expect((result as { message: string }).message).toBe(
            'Table "t" in eu-central-1 holds v5 records. fix-live only runs against migrated v6 systems.'
        );
    });

    it("refuses when no CMS entry is found (internal models do not count)", async () => {
        const result = await run([settings, fmFile]);
        expect(result.kind).toBe("refused");
        expect((result as { message: string }).message).toBe(
            "Could not find a CMS entry record to verify the schema version."
        );
    });

    it("reports the spinner lifecycle", async () => {
        const ui = new StubUI();
        await guardV6({
            client: new MockDynamoDbClient({ t: [v6Entry] as never }),
            tableName: "t",
            region: "r",
            ui
        });
        expect(ui.spinnerMessages[0]).toBe("Checking schema version…");
        expect(ui.spinnerMessages.at(-1)).toBe("Schema version: v6");
    });
});
```

Create `__tests__/commands/fixLive/steps/selectMode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectMode, NO_DRY_RUN_MESSAGE } from "~/commands/fixLive/steps/selectMode.js";
import { StubPrompts } from "../../prompts/StubPrompts.ts";

const withDryRun = {
    lastDryRun: { runId: "1", at: "2026-09-04T09:12:00.000Z", changes: 2118, skips: 4 }
};

describe("selectMode", () => {
    it("--dry-run needs no state", async () => {
        expect(await selectMode({ prompts: new StubPrompts(), state: null, modeArg: "dry-run", yes: false })).toEqual({
            kind: "ok",
            value: "dry-run"
        });
    });

    it("--live without a dry run is refused with the shared message", async () => {
        expect(await selectMode({ prompts: new StubPrompts(), state: null, modeArg: "live", yes: false })).toEqual({
            kind: "refused",
            message: NO_DRY_RUN_MESSAGE
        });
    });

    it("--live --yes skips the proceed confirm", async () => {
        const prompts = new StubPrompts();
        expect(await selectMode({ prompts, state: withDryRun, modeArg: "live", yes: true })).toEqual({
            kind: "ok",
            value: "live"
        });
        expect(prompts.confirmCalls).toHaveLength(0);
    });

    it("menu disables live with a hint when there is no state", async () => {
        const prompts = new StubPrompts({ select: ["dry-run"] });
        await selectMode({ prompts, state: null, yes: false });
        const live = prompts.selectCalls[0]!.options[1]!;
        expect(live.disabled).toBe(true);
        expect(live.hint).toBe("run a dry run first");
        expect(prompts.selectCalls[0]!.initialValue).toBe("dry-run");
    });

    it("live from the menu asks to proceed with the last dry run summary", async () => {
        const prompts = new StubPrompts({ select: ["live"], confirm: [true] });
        expect(await selectMode({ prompts, state: withDryRun, yes: false })).toEqual({ kind: "ok", value: "live" });
        expect(prompts.confirmCalls[0]!.message).toMatch(/^Last dry run: 2 118 changes, 2026-09-04 09:12\. Proceed\?$/);
        expect(prompts.confirmCalls[0]!.initialValue).toBe(false);
    });

    it("cancel or decline → cancelled", async () => {
        expect(await selectMode({ prompts: new StubPrompts(), state: withDryRun, yes: false })).toEqual({ kind: "cancelled" });
        expect(
            await selectMode({ prompts: new StubPrompts({ select: ["live"], confirm: [false] }), state: withDryRun, yes: false })
        ).toEqual({ kind: "cancelled" });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run __tests__/commands/fixLive/steps/guardV6.test.ts __tests__/commands/fixLive/steps/selectMode.test.ts 2>&1 | tail -20`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `guardV6`**

Create `src/commands/fixLive/steps/guardV6.ts`:

```ts
import type { UI } from "~/commands/prompts/abstractions/UI.js";
import type { SourceDynamoDbClient } from "~/services/DynamoDbClient/index.js";
import type { BaseRecord } from "~/domain/transform/types/records.js";
import { isCmsEntry, isFmFile } from "~/domain/transform/filters.js";
import { formatError } from "~/base/index.js";
import { type StepOutcome, ok, refused } from "./outcome.ts";

export interface GuardV6Input {
    client: SourceDynamoDbClient.Interface;
    tableName: string;
    region: string;
    ui: UI.Interface;
}

const GUARD_SEGMENTS = 4;
const FIRST_PASS_LIMIT = 100;
const MAX_ROWS = 5000;

export const NO_PROBE_MESSAGE = "Could not find a CMS entry record to verify the schema version.";

// Same exclusion `addLiveField` applies (fmFile / wbyFmFile never carry `live`).
const isProbeCandidate = (row: BaseRecord): boolean => isCmsEntry(row) && !isFmFile(row);

const isV6 = (row: BaseRecord): boolean =>
    typeof row.data === "object" && row.data !== null && !Array.isArray(row.data);

const isV5 = (row: BaseRecord): boolean => row.data === undefined && typeof row.modelId === "string";

async function scanForProbe(
    client: SourceDynamoDbClient.Interface,
    tableName: string,
    limit: number | undefined,
    budget: number
): Promise<BaseRecord | null> {
    let read = 0;
    for (let segment = 0; segment < GUARD_SEGMENTS; segment++) {
        const rows = client.scan<BaseRecord>(tableName, {
            segment,
            totalSegments: GUARD_SEGMENTS,
            sortKeyEquals: "L",
            limit
        });
        for await (const row of rows) {
            read++;
            if (isProbeCandidate(row)) {
                return row;
            }
            if (read >= budget) {
                return null;
            }
        }
    }
    return null;
}

/**
 * Runs on the DDB table before the system confirm so nobody is asked to
 * confirm a system that will be refused. v6 marker: CMS entry `L` record
 * carries a `data` object at the root; v5 keeps fields flat.
 */
export async function guardV6(input: GuardV6Input): Promise<StepOutcome<"v6">> {
    const spinner = input.ui.spinner();
    spinner.start("Checking schema version…");

    let probe: BaseRecord | null;
    try {
        probe = await scanForProbe(
            input.client,
            input.tableName,
            FIRST_PASS_LIMIT,
            GUARD_SEGMENTS * FIRST_PASS_LIMIT
        );
        if (!probe) {
            probe = await scanForProbe(input.client, input.tableName, undefined, MAX_ROWS);
        }
    } catch (error) {
        spinner.stop("Schema check failed");
        return refused(
            `Could not read table "${input.tableName}" in ${input.region}: ${formatError(error, false)}`
        );
    }

    if (probe && isV6(probe)) {
        spinner.stop("Schema version: v6");
        return ok("v6");
    }
    spinner.stop("Schema check failed");
    if (probe && isV5(probe)) {
        return refused(
            `Table "${input.tableName}" in ${input.region} holds v5 records. fix-live only runs against migrated v6 systems.`
        );
    }
    return refused(NO_PROBE_MESSAGE);
}
```

If `SourceDynamoDbClient.Scan` does not yet have `sortKeyEquals` / `limit`, the sibling plan's step 2 has not landed — stop and land it first; do not add the fields here.

- [ ] **Step 4: Implement `selectMode`**

Create `src/commands/fixLive/steps/selectMode.ts`:

```ts
import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import type { FixLiveState, LiveFieldRunner } from "~/features/FixLive/index.js";
import { formatCount, formatTimestamp } from "./format.ts";
import { type StepOutcome, ok, cancelled, refused } from "./outcome.ts";

export interface SelectModeInput {
    prompts: Prompts.Interface;
    state: FixLiveState.File | null;
    modeArg?: LiveFieldRunner.Mode;
    yes: boolean;
}

export const NO_DRY_RUN_MESSAGE =
    "No completed dry run found for this project and system. Run a dry run first.";

export async function selectMode(input: SelectModeInput): Promise<StepOutcome<LiveFieldRunner.Mode>> {
    const lastDryRun = input.state?.lastDryRun;

    let mode = input.modeArg;
    if (mode === "live" && !lastDryRun) {
        return refused(NO_DRY_RUN_MESSAGE);
    }

    if (!mode) {
        const chosen = await input.prompts.select<LiveFieldRunner.Mode>({
            message: "Run mode",
            initialValue: "dry-run",
            options: [
                { value: "dry-run", label: "dry run", hint: "report only, nothing is written" },
                {
                    value: "live",
                    label: "live",
                    disabled: !lastDryRun,
                    hint: lastDryRun
                        ? `last dry run: ${formatCount(lastDryRun.changes)} changes, ${formatTimestamp(lastDryRun.at)}`
                        : "run a dry run first"
                }
            ]
        });
        if (chosen === null) {
            return cancelled();
        }
        mode = chosen;
    }

    if (mode === "live" && !input.yes && lastDryRun) {
        const proceed = await input.prompts.confirm({
            message: `Last dry run: ${formatCount(lastDryRun.changes)} changes, ${formatTimestamp(lastDryRun.at)}. Proceed?`,
            initialValue: false
        });
        if (proceed !== true) {
            return cancelled();
        }
    }

    return ok(mode);
}
```

Create `src/commands/fixLive/steps/format.ts`:

```ts
/** 148203 → "148 203" (thin grouping, matches the summary layout in the spec). */
export function formatCount(value: number): string {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** ISO string → "2026-09-04 09:12" (UTC). */
export function formatTimestamp(iso: string): string {
    return iso.slice(0, 16).replace("T", " ");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn vitest run __tests__/commands/fixLive 2>&1 | tail -20`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/fixLive __tests__/commands/fixLive
git commit -m "feat(fix-live): v6 guard and run-mode steps"
```

---

### Task 8: `runTable`, `summarise`, `FixLiveCommand`, registration

**Files:**
- Create: `src/commands/fixLive/steps/runTable.ts`, `src/commands/fixLive/steps/summarise.ts`, `src/commands/fixLive/FixLiveCommand.ts`, `src/commands/fixLive/feature.ts`
- Modify: `src/commands/cliContainer.ts` (register `FixLiveCommandFeature`)
- Test: `__tests__/commands/fixLive/steps/runTable.test.ts`, `__tests__/commands/fixLive/steps/summarise.test.ts`, `__tests__/commands/fixLive/FixLiveCommand.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 6–7; `bootstrap`, `loadConfig`, `discoverConfig`, `SourceDynamoDbClient` / `TargetDynamoDbClient`, `TransferContext`; from `~/features/FixLive/index.js`: `LiveFieldRunner`, `ChangeReport`, `FixLiveState`, `LiveFieldRunnerFactory`, `FixLiveStateStore` (see contract table)
- Produces: `FixLiveCommand` (`name: "fix-live"`), flags `--project --system --dry-run|--live --yes --table --concurrency --log-level`, exit codes 0 / 1 / 130

- [ ] **Step 1: Contract check**

```bash
cat src/features/FixLive/index.ts
grep -n "FixLive" src/bootstrap.ts
```

Confirm the names in the contract table at the top of this plan. If the sibling exposes differently named equivalents, use them in `runTable.ts` / `FixLiveCommand.ts` and update the table. If `bootstrap.ts` does not register `FixLiveFeature`, add `FixLiveFeature.register(container)` immediately after `bootstrap(...)` in `FixLiveCommand.run` (Step 5).

- [ ] **Step 2: Failing tests for `runTable` and `summarise`**

Create `__tests__/commands/fixLive/steps/runTable.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { LiveFieldRunner, ChangeReport } from "~/features/FixLive/index.js";
import { runTable } from "~/commands/fixLive/steps/runTable.js";
import { StubUI } from "../../prompts/StubUI.ts";

export const STATS: LiveFieldRunner.Stats = {
    scanned: 148203,
    entries: 31440,
    changes: { "missing-live": 1902, "empty-live": 201, "wrong-version": 9, "stale-live": 6 },
    skips: {
        "no-latest-record": 0,
        "invalid-version": 1,
        "revision-record-missing": 0,
        "revision-version-mismatch": 3,
        "latest-status-contradicts-published": 0,
        "latest-status-contradicts-unpublished": 0,
        "decompress-failed": 0,
        "changed-during-run": 0
    },
    written: 0,
    conditionFailed: 0
};

export const fakeRunner = (stats: LiveFieldRunner.Stats): LiveFieldRunner.Interface => ({
    async run(options) {
        options.onProgress({ ...stats, scanned: 10, entries: 2 });
        options.onProgress(stats);
        return stats;
    }
});

const report = {} as ChangeReport.Interface;

describe("runTable", () => {
    it("drives the spinner with live counters and returns the stats", async () => {
        const ui = new StubUI();
        const result = await runTable({
            table: "ddb",
            tableName: "acme-prod-ddb",
            region: "eu-central-1",
            runner: fakeRunner(STATS),
            mode: "dry-run",
            report,
            ui
        });
        expect(result).toEqual({ table: "ddb", tableName: "acme-prod-ddb", region: "eu-central-1", stats: STATS });
        expect(ui.spinnerMessages[0]).toBe("Scanning DynamoDB…");
        expect(ui.spinnerMessages).toContain("Scanning DynamoDB… 10 rows / 2 entries");
        expect(ui.spinnerMessages.at(-1)).toBe("DynamoDB scanned: 148 203 rows / 31 440 entries");
    });

    it("labels the OpenSearch table", async () => {
        const ui = new StubUI();
        await runTable({ table: "os", tableName: "t", region: "r", runner: fakeRunner(STATS), mode: "live", report, ui });
        expect(ui.spinnerMessages[0]).toBe("Scanning OpenSearch…");
    });
});
```

Create `__tests__/commands/fixLive/steps/summarise.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatSummary, summarise, totalChanges } from "~/commands/fixLive/steps/summarise.js";
import { StubUI } from "../../prompts/StubUI.ts";
import { STATS } from "./runTable.test.ts";

const results = [
    { table: "ddb" as const, tableName: "acme-prod-ddb", region: "eu-central-1", stats: STATS },
    { table: "os" as const, tableName: "acme-prod-os", region: "eu-central-1", stats: { ...STATS, scanned: 62880 } }
];

describe("formatSummary", () => {
    it("renders one block per table with counts and non-zero breakdowns", () => {
        const text = formatSummary({
            project: "acme",
            system: "target",
            mode: "dry-run",
            results,
            reportPath: ".transfer/1/fix-live-report.jsonl",
            statePath: ".transfer/state/fix-live/acme__target.json"
        });
        expect(text).toContain("Fix live field — dry run (project: acme, system: target)");
        expect(text).toContain("DynamoDB  acme-prod-ddb (eu-central-1)");
        expect(text).toContain("scanned          148 203");
        expect(text).toContain("changes            2 118   missing-live 1 902 · empty-live 201 · wrong-version 9 · stale-live 6");
        expect(text).toContain("skips                  4   invalid-version 1 · revision-version-mismatch 3");
        expect(text).toContain("OpenSearch  acme-prod-os (eu-central-1)");
        expect(text).toContain("Report: .transfer/1/fix-live-report.jsonl");
        expect(text).toContain('Run again and choose "live" to apply these changes.');
    });

    it("live mode shows written / condition-failed instead of the dry-run hint", () => {
        const text = formatSummary({
            project: "acme",
            system: "target",
            mode: "live",
            results: [{ ...results[0]!, stats: { ...STATS, written: 2100, conditionFailed: 18 } }],
            reportPath: "r",
            statePath: "s"
        });
        expect(text).toContain("written            2 100");
        expect(text).toContain("changed during run    18");
        expect(text).not.toContain("choose \"live\"");
    });
});

describe("summarise", () => {
    it("warns when a live run's change count differs from the last dry run", () => {
        const ui = new StubUI();
        summarise({
            ui,
            project: "acme",
            system: "target",
            mode: "live",
            results,
            reportPath: "r",
            statePath: "s",
            lastDryRun: { runId: "0", at: "2026-09-04T09:12:00.000Z", changes: 2118, skips: 4 }
        });
        expect(totalChanges(results)).toBe(4236);
        expect(ui.warns[0]).toBe("Last dry run reported 2 118 changes, this live run found 4 236.");
        expect(ui.notes[0]!.title).toBe("Summary");
        expect(ui.outros).toEqual(["Done."]);
    });
});
```

- [ ] **Step 3: Implement `runTable` and `summarise`**

Create `src/commands/fixLive/steps/runTable.ts`:

```ts
import type { UI } from "~/commands/prompts/abstractions/UI.js";
import type { ChangeReport, LiveFieldRunner } from "~/features/FixLive/index.js";
import type { TableKind } from "../types.ts";
import { formatCount } from "./format.ts";

export interface RunTableInput {
    table: TableKind;
    tableName: string;
    region: string;
    runner: LiveFieldRunner.Interface;
    mode: LiveFieldRunner.Mode;
    report: ChangeReport.Interface;
    ui: UI.Interface;
}

export interface TableRunResult {
    table: TableKind;
    tableName: string;
    region: string;
    stats: LiveFieldRunner.Stats;
}

export const tableLabel = (table: TableKind): string => (table === "ddb" ? "DynamoDB" : "OpenSearch");

export async function runTable(input: RunTableInput): Promise<TableRunResult> {
    const label = tableLabel(input.table);
    const spinner = input.ui.spinner();
    spinner.start(`Scanning ${label}…`);

    const stats = await input.runner.run({
        mode: input.mode,
        report: input.report,
        onProgress: progress => {
            spinner.message(
                `Scanning ${label}… ${formatCount(progress.scanned)} rows / ${formatCount(progress.entries)} entries`
            );
        }
    });

    spinner.stop(
        `${label} scanned: ${formatCount(stats.scanned)} rows / ${formatCount(stats.entries)} entries`
    );
    return { table: input.table, tableName: input.tableName, region: input.region, stats };
}
```

Create `src/commands/fixLive/steps/summarise.ts`:

```ts
import type { UI } from "~/commands/prompts/abstractions/UI.js";
import type { FixLiveState, LiveFieldRunner } from "~/features/FixLive/index.js";
import type { SystemName } from "../types.ts";
import { formatCount } from "./format.ts";
import { tableLabel, type TableRunResult } from "./runTable.ts";

export interface SummaryInput {
    project: string;
    system: SystemName;
    mode: LiveFieldRunner.Mode;
    results: TableRunResult[];
    reportPath: string;
    statePath: string;
}

export interface SummariseInput extends SummaryInput {
    ui: UI.Interface;
    lastDryRun?: FixLiveState.RunSummary;
}

const sum = (counts: Record<string, number>): number =>
    Object.values(counts).reduce((total, count) => total + count, 0);

const breakdown = (counts: Record<string, number>): string =>
    Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => `${reason} ${formatCount(count)}`)
        .join(" · ");

const row = (label: string, value: number, detail = ""): string => {
    const line = `    ${label.padEnd(14)} ${formatCount(value).padStart(9)}`;
    return detail ? `${line}   ${detail}` : line;
};

export const totalChanges = (results: TableRunResult[]): number =>
    results.reduce((total, result) => total + sum(result.stats.changes), 0);

export const totalSkips = (results: TableRunResult[]): number =>
    results.reduce((total, result) => total + sum(result.stats.skips), 0);

export function formatSummary(input: SummaryInput): string {
    const modeLabel = input.mode === "dry-run" ? "dry run" : "live run";
    const lines: string[] = [
        `Fix live field — ${modeLabel} (project: ${input.project}, system: ${input.system})`,
        ""
    ];
    for (const result of input.results) {
        const { stats } = result;
        lines.push(`  ${tableLabel(result.table)}  ${result.tableName} (${result.region})`);
        lines.push(row("scanned", stats.scanned));
        lines.push(row("cms entries", stats.entries));
        lines.push(row("changes", sum(stats.changes), breakdown(stats.changes)));
        lines.push(row("skips", sum(stats.skips), breakdown(stats.skips)));
        if (input.mode === "live") {
            lines.push(row("written", stats.written));
            lines.push(row("changed during run", stats.conditionFailed));
        }
        lines.push("");
    }
    lines.push(`Report: ${input.reportPath}`);
    lines.push(`State:  ${input.statePath}`);
    if (input.mode === "dry-run") {
        lines.push("");
        lines.push('Run again and choose "live" to apply these changes.');
    }
    return lines.join("\n");
}

export function summarise(input: SummariseInput): void {
    if (input.mode === "live" && input.lastDryRun) {
        const found = totalChanges(input.results);
        if (found !== input.lastDryRun.changes) {
            input.ui.warn(
                `Last dry run reported ${formatCount(input.lastDryRun.changes)} changes, this live run found ${formatCount(found)}.`
            );
        }
    }
    input.ui.note(formatSummary(input), "Summary");
    input.ui.outro("Done.");
}
```

Run: `yarn vitest run __tests__/commands/fixLive/steps 2>&1 | tail -20` — expected: all PASS.

- [ ] **Step 4: Failing test for `FixLiveCommand`**

Create `__tests__/commands/fixLive/FixLiveCommand.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FixLiveState } from "~/features/FixLive/index.js";
import { SourceDynamoDbClient, TargetDynamoDbClient } from "~/services/DynamoDbClient/index.js";
import { TransferContext } from "~/features/TransferLifecycle/index.js";
import { ChangeReport, FixLiveStateStore, LiveFieldRunnerFactory } from "~/features/FixLive/index.js";
import { MockDynamoDbClient } from "../../services/DynamoDbClient/MockDynamoDbClient.ts";
import { StubPrompts } from "../prompts/StubPrompts.ts";
import { StubUI } from "../prompts/StubUI.ts";
import { CONFIG } from "./steps/selectSystem.test.ts";
import { STATS, fakeRunner } from "./steps/runTable.test.ts";

const resolveMap = new Map<unknown, unknown>();
const registerInstance = vi.fn();

vi.mock("~/commands/transfer/wizard/projectDiscovery.ts", () => ({
    discoverProjects: vi.fn(async () => ["acme"])
}));
vi.mock("~/commands/transfer/wizard/configDiscovery.ts", () => ({
    discoverConfig: vi.fn(async () => "/w/projects/acme/config.ts")
}));
vi.mock("~/features/MigrationConfig/loadConfig.ts", () => ({
    loadConfig: vi.fn(async () => CONFIG)
}));
vi.mock("~/bootstrap.ts", () => ({
    bootstrap: vi.fn(() => ({
        resolve: (token: unknown) => resolveMap.get(token),
        registerInstance
    }))
}));

import { FixLiveCommand } from "~/commands/fixLive/FixLiveCommand.js";

const v6Row = {
    PK: "T#root#L#en-US#CMS#CME#abc",
    SK: "L",
    TYPE: "cms.entry.l",
    _et: "CmsEntries",
    _ct: "x",
    _md: "x",
    data: { modelId: "article", version: 1, status: "draft" }
};
const v5Row = { ...v6Row, data: undefined, modelId: "article", version: 1 };

let stateFile: FixLiveState.File | null;
const stateWrite = vi.fn();
const factoryCreate = vi.fn(() => fakeRunner(STATS));

beforeEach(() => {
    resolveMap.clear();
    registerInstance.mockReset();
    stateWrite.mockReset();
    factoryCreate.mockClear();
    stateFile = null;
    resolveMap.set(SourceDynamoDbClient, new MockDynamoDbClient({ "acme-src-ddb": [v5Row] as never }));
    resolveMap.set(TargetDynamoDbClient, new MockDynamoDbClient({ "acme-prod-ddb": [v6Row] as never }));
    resolveMap.set(ChangeReport, {});
    resolveMap.set(FixLiveStateStore, { read: () => stateFile, write: stateWrite });
    resolveMap.set(LiveFieldRunnerFactory, { create: factoryCreate });
});

const command = (prompts: StubPrompts, ui = new StubUI()) => new FixLiveCommand(prompts, ui);

describe("FixLiveCommand", () => {
    it("cancel at project select → 130", async () => {
        expect(await command(new StubPrompts()).run({})).toBe(130);
    });

    it("cancel at system select → 130", async () => {
        expect(await command(new StubPrompts({ select: ["acme"] })).run({})).toBe(130);
    });

    it("v5 system is refused before the confirm → 1", async () => {
        const prompts = new StubPrompts({ select: ["acme", "source"], confirm: [true] });
        const ui = new StubUI();
        expect(await command(prompts, ui).run({})).toBe(1);
        expect(prompts.confirmCalls).toHaveLength(0);
        expect(ui.errors[0]).toMatch(/holds v5 records/);
    });

    it("cancel at the system confirm → 130", async () => {
        expect(await command(new StubPrompts({ select: ["acme", "target"] })).run({})).toBe(130);
    });

    it("cancel at the mode select → 130", async () => {
        const prompts = new StubPrompts({ select: ["acme", "target"], confirm: [true] });
        expect(await command(prompts).run({})).toBe(130);
    });

    it("--live without a dry run → 1 with the refusal message", async () => {
        const ui = new StubUI();
        const code = await command(new StubPrompts(), ui).run({
            project: "acme",
            system: "target",
            live: true,
            yes: true
        });
        expect(code).toBe(1);
        expect(ui.errors[0]).toMatch(/Run a dry run first/);
        expect(factoryCreate).not.toHaveBeenCalled();
    });

    it("--yes --dry-run runs both tables, writes lastDryRun, asks nothing", async () => {
        const prompts = new StubPrompts();
        const ui = new StubUI();
        const code = await command(prompts, ui).run({
            project: "acme",
            system: "target",
            "dry-run": true,
            yes: true,
            concurrency: 4
        });
        expect(code).toBe(0);
        expect(prompts.confirmCalls).toHaveLength(0);
        expect(prompts.selectCalls).toHaveLength(0);
        expect(factoryCreate.mock.calls.map(([input]) => (input as { table: string }).table)).toEqual(["ddb", "os"]);
        expect(factoryCreate.mock.calls[0]![0]).toMatchObject({
            table: "ddb",
            tableName: "acme-prod-ddb",
            segments: 4,
            concurrency: 4
        });
        expect(registerInstance).toHaveBeenCalledWith(TransferContext, expect.objectContaining({ dryRun: true }));
        expect(stateWrite).toHaveBeenCalledWith(
            "acme",
            "target",
            expect.objectContaining({ lastDryRun: expect.objectContaining({ changes: 4236, skips: 8 }) })
        );
        expect(ui.outros).toEqual(["Done."]);
    });

    it("--table=ddb restricts to one table", async () => {
        await command(new StubPrompts()).run({ project: "acme", system: "target", "dry-run": true, yes: true, table: "ddb" });
        expect(factoryCreate).toHaveBeenCalledOnce();
    });

    it("--table=os on a system without OpenSearch → 1", async () => {
        resolveMap.set(SourceDynamoDbClient, new MockDynamoDbClient({ "acme-src-ddb": [v6Row] as never }));
        const ui = new StubUI();
        expect(
            await command(new StubPrompts(), ui).run({ project: "acme", system: "source", "dry-run": true, yes: true, table: "os" })
        ).toBe(1);
        expect(ui.errors[0]).toMatch(/no OpenSearch table/);
    });

    it("--live --yes with state writes lastLiveRun", async () => {
        stateFile = { lastDryRun: { runId: "0", at: "2026-09-04T09:12:00.000Z", changes: 4236, skips: 8 } };
        const code = await command(new StubPrompts()).run({ project: "acme", system: "target", live: true, yes: true });
        expect(code).toBe(0);
        expect(stateWrite).toHaveBeenCalledWith(
            "acme",
            "target",
            expect.objectContaining({
                lastDryRun: stateFile.lastDryRun,
                lastLiveRun: expect.objectContaining({ written: 0, conditionFailed: 0 })
            })
        );
    });
});
```

- [ ] **Step 5: Implement `FixLiveCommand` and register it**

Create `src/commands/fixLive/FixLiveCommand.ts`:

```ts
import type { Argv } from "yargs";
import { join, resolve } from "node:path";
import type { Container } from "@webiny/di";
import { Command as CommandAbstraction } from "~/commands/registry/abstractions/Command.js";
import { Prompts } from "~/commands/prompts/abstractions/Prompts.js";
import { UI } from "~/commands/prompts/abstractions/UI.js";
import { EXIT_CANCELLED, EXIT_FAILURE, EXIT_OK } from "~/commands/exitCodes.js";
import { discoverConfig } from "~/commands/transfer/wizard/configDiscovery.js";
import { bootstrap } from "~/bootstrap.js";
import { formatError } from "~/base/index.js";
import { loadConfig } from "~/features/MigrationConfig/loadConfig.js";
import type { MigrationConfig } from "~/features/MigrationConfig/index.js";
import { TransferContext } from "~/features/TransferLifecycle/index.js";
import { SourceDynamoDbClient, TargetDynamoDbClient } from "~/services/DynamoDbClient/index.js";
import {
    ChangeReport,
    FixLiveStateStore,
    LiveFieldRunnerFactory,
    type FixLiveState,
    type LiveFieldRunner
} from "~/features/FixLive/index.js";
import type { SystemConfig, SystemName, TableKind } from "./types.ts";
import type { StepCancelled, StepRefused } from "./steps/outcome.ts";
import { selectProject } from "./steps/selectProject.ts";
import { selectSystem } from "./steps/selectSystem.ts";
import { guardV6 } from "./steps/guardV6.ts";
import { confirmSystem } from "./steps/confirmSystem.ts";
import { selectMode } from "./steps/selectMode.ts";
import { runTable, type TableRunResult } from "./steps/runTable.ts";
import { summarise, totalChanges, totalSkips } from "./steps/summarise.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

interface FixLiveOptions {
    project?: string;
    system?: SystemName;
    mode?: LiveFieldRunner.Mode;
    yes: boolean;
    table?: TableKind;
    concurrency: number;
    logLevel?: LogLevel;
}

const DEFAULT_CONCURRENCY = 4;

function parseOptions(argv: CommandAbstraction.Argv): FixLiveOptions {
    let mode: LiveFieldRunner.Mode | undefined;
    if (argv.live === true) {
        mode = "live";
    } else if (argv["dry-run"] === true) {
        mode = "dry-run";
    }
    return {
        project: argv.project as string | undefined,
        system: argv.system as SystemName | undefined,
        mode,
        yes: argv.yes === true,
        table: argv.table as TableKind | undefined,
        concurrency: typeof argv.concurrency === "number" ? argv.concurrency : DEFAULT_CONCURRENCY,
        logLevel: argv["log-level"] as LogLevel | undefined
    };
}

function resolveTables(restriction: TableKind | undefined, system: SystemConfig): TableKind[] {
    if (restriction) {
        return [restriction];
    }
    return system.opensearch ? ["ddb", "os"] : ["ddb"];
}

class FixLiveCommandImpl implements CommandAbstraction.Interface {
    public readonly name = "fix-live";
    public readonly description =
        "Reconcile the `live` field on CMS entries of an already migrated v6 system";

    public constructor(
        private readonly prompts: Prompts.Interface,
        private readonly ui: UI.Interface
    ) {}

    public configure(yargs: Argv): Argv {
        return yargs
            .option("project", { type: "string", description: "Project folder under projects/" })
            .option("system", {
                type: "string",
                choices: ["source", "target"] as const,
                description: "Which system of the project to reconcile"
            })
            .option("dry-run", { type: "boolean", description: "Report changes without writing" })
            .option("live", {
                type: "boolean",
                description: "Apply changes (requires a completed dry run for the same project and system)"
            })
            .conflicts("dry-run", "live")
            .option("yes", { type: "boolean", default: false, description: "Skip confirmations" })
            .option("table", {
                type: "string",
                choices: ["ddb", "os"] as const,
                description: "Restrict to one table (default: both)"
            })
            .option("concurrency", {
                type: "number",
                default: DEFAULT_CONCURRENCY,
                description: "Scan segments in flight"
            })
            .option("log-level", {
                type: "string",
                choices: ["debug", "info", "warn", "error"] as const,
                description: "Log level (default: from config)"
            });
    }

    public async run(argv: CommandAbstraction.Argv): Promise<number> {
        const options = parseOptions(argv);
        const cwd = process.cwd();

        const project = await selectProject({ prompts: this.prompts, cwd, projectArg: options.project });
        if (project.kind !== "ok") {
            return this.finish(project);
        }

        const configPath = await discoverConfig(resolve(join(cwd, "projects", project.value)));
        if (!configPath) {
            return this.refuse(`No config.ts found in projects/${project.value}/.`);
        }

        const runId = String(Date.now());
        let config: MigrationConfig.Interface;
        let container: Container;
        try {
            config = await loadConfig(configPath);
            container = bootstrap({ config, runId, logLevel: options.logLevel ?? config.debug?.logLevel });
        } catch (error) {
            return this.refuse(formatError(error, false));
        }

        const system = await selectSystem({ prompts: this.prompts, config, systemArg: options.system });
        if (system.kind !== "ok") {
            return this.finish(system);
        }
        const systemConfig: SystemConfig = config[system.value];
        const client =
            system.value === "source"
                ? container.resolve(SourceDynamoDbClient)
                : container.resolve(TargetDynamoDbClient);

        if (options.table === "os" && !systemConfig.opensearch) {
            return this.refuse(`System "${system.value}" has no OpenSearch table configured.`);
        }

        // Guard first: nobody confirms a system that will be refused. The OS table
        // is only reconciled after this DDB guard passed for the same system.
        const guard = await guardV6({
            client,
            tableName: systemConfig.dynamodb.tableName,
            region: systemConfig.region,
            ui: this.ui
        });
        if (guard.kind !== "ok") {
            return this.finish(guard);
        }

        const confirmed = await confirmSystem({
            prompts: this.prompts,
            ui: this.ui,
            system: system.value,
            config: systemConfig,
            yes: options.yes
        });
        if (confirmed.kind !== "ok") {
            return this.finish(confirmed);
        }

        const stateStore = container.resolve(FixLiveStateStore);
        const state = stateStore.read(project.value, system.value);
        const mode = await selectMode({ prompts: this.prompts, state, modeArg: options.mode, yes: options.yes });
        if (mode.kind !== "ok") {
            return this.finish(mode);
        }

        container.registerInstance(TransferContext, { runId, dryRun: mode.value === "dry-run" });
        const report = container.resolve(ChangeReport);
        const runnerFactory = container.resolve(LiveFieldRunnerFactory);
        const segments = config.pipeline?.segments || 1;

        const results: TableRunResult[] = [];
        try {
            for (const table of resolveTables(options.table, systemConfig)) {
                const tableName =
                    table === "ddb" ? systemConfig.dynamodb.tableName : systemConfig.opensearch!.tableName;
                const runner = runnerFactory.create({
                    table,
                    client,
                    tableName,
                    segments,
                    concurrency: options.concurrency
                });
                results.push(
                    await runTable({
                        table,
                        tableName,
                        region: systemConfig.region,
                        runner,
                        mode: mode.value,
                        report,
                        ui: this.ui
                    })
                );
            }
        } catch (error) {
            // State is written only when a run completes without an unhandled error.
            return this.refuse(`fix-live failed: ${formatError(error, false)}`);
        }

        stateStore.write(project.value, system.value, this.nextState(state, mode.value, runId, results));

        summarise({
            ui: this.ui,
            project: project.value,
            system: system.value,
            mode: mode.value,
            results,
            reportPath: join(".transfer", runId, "fix-live-report.jsonl"),
            statePath: join(".transfer", "state", "fix-live", `${project.value}__${system.value}.json`),
            lastDryRun: state?.lastDryRun
        });
        return EXIT_OK;
    }

    private nextState(
        previous: FixLiveState.File | null,
        mode: LiveFieldRunner.Mode,
        runId: string,
        results: TableRunResult[]
    ): FixLiveState.File {
        const summary: FixLiveState.RunSummary = {
            runId,
            at: new Date().toISOString(),
            changes: totalChanges(results),
            skips: totalSkips(results)
        };
        if (mode === "dry-run") {
            return { ...previous, lastDryRun: summary };
        }
        return {
            ...previous,
            lastLiveRun: {
                ...summary,
                written: results.reduce((total, result) => total + result.stats.written, 0),
                conditionFailed: results.reduce((total, result) => total + result.stats.conditionFailed, 0)
            }
        };
    }

    private finish(outcome: StepCancelled | StepRefused): number {
        if (outcome.kind === "cancelled") {
            this.ui.cancel("Cancelled.");
            return EXIT_CANCELLED;
        }
        return this.refuse(outcome.message);
    }

    private refuse(message: string): number {
        this.ui.error(message);
        return EXIT_FAILURE;
    }
}

export const FixLiveCommand = CommandAbstraction.createImplementation({
    implementation: FixLiveCommandImpl,
    dependencies: [Prompts, UI]
});
```

Create `src/commands/fixLive/feature.ts`:

```ts
import { createFeature } from "~/base/index.js";
import { FixLiveCommand } from "./FixLiveCommand.ts";

export const FixLiveCommandFeature = createFeature({
    name: "Cli/FixLiveCommandFeature",
    register(container) {
        container.register(FixLiveCommand).inSingletonScope();
    }
});
```

In `src/commands/cliContainer.ts` add `import { FixLiveCommandFeature } from "./fixLive/feature.ts";` and, after the `TransferCommand` registration line, `FixLiveCommandFeature.register(container);` (menu order: transfer, fix-live, then the hidden ones).

- [ ] **Step 6: Run tests, type-check, smoke**

Run: `yarn vitest run __tests__/commands 2>&1 | tail -30 && yarn ts-check`
Expected: All PASS; 0 errors.

```bash
yarn transfer fix-live --help
yarn transfer fix-live --project=nope --system=target --dry-run; echo "exit=$?"   # exit=1, "Project "nope" not found"
```

- [ ] **Step 7: Commit**

```bash
git add src/commands/fixLive src/commands/cliContainer.ts __tests__/commands/fixLive
git commit -m "feat(fix-live): FixLiveCommand guided flow and non-interactive flags"
```

---

### Task 9: Guides, `AGENTS.md`, hard-won decisions, project structure

**Files:**
- Modify: `docs/guides/commands.md`, `docs/guides/troubleshooting.md`, `docs/project-structure.md`, `AGENTS.md`, `docs/hard-won-decisions.md`

**Interfaces:**
- Consumes: behaviour from Tasks 1–8
- Produces: user docs for the menu and `fix-live`; agent guidance for the new layout

- [ ] **Step 1: `docs/guides/commands.md`**

Replace the `## Guided setup (recommended)` heading and its first paragraph with:

```markdown
## Command menu

`yarn transfer` with no arguments opens a menu of available commands:

- **transfer** — system-to-system transfer (the guided `TransferWizard` below).
- **fix-live** — reconcile the `live` field on a migrated v6 system (see [fix-live](#fix-live)).

Press Esc / Ctrl+C at any prompt to leave; the process exits with code 130. Every command can also be invoked directly (`yarn transfer transfer`, `yarn transfer fix-live`) and non-interactively with flags — see each section. `yarn transfer --config=… --preset=…` and `yarn transfer <folder>` (scaffold) keep working exactly as before.

## Guided transfer setup (recommended)

`yarn transfer` → **transfer** (or `yarn transfer transfer`) launches `TransferWizard`. It walks you through:
```

Append before `## Scaffolding`:

```markdown
## fix-live

Repairs the `live` field on CMS entry records of a system that has **already been migrated to v6**. Earlier OpenSearch migrations could leave `live: {}` on the `L` document of entries whose latest revision is a draft on top of an older published revision, so those entries do not show as published. `fix-live` scans the DynamoDB table and, when the system has one, the OpenSearch companion table, and makes `L`, `P` and the published `REV#` record agree with the actual published state.

### Guided flow

```
yarn transfer fix-live
◆ Select a project                    projects/*
◆ Which system?                       source | target — hint shows DDB table, region, OS table
│  Checking schema version…           refuses v5 tables
◇ System summary                      region, DDB table, OS table, OS endpoint (target only), account id
◆ This is the system whose records will be modified. Continue?   (default: no)
◆ Run mode                            dry run (default) | live — live is disabled until a dry run completed
│  Scanning DynamoDB… 148 203 rows / 31 440 entries
│  Scanning OpenSearch… 62 880 rows / 31 440 entries
◇ Summary
```

### Non-interactive

```bash
yarn transfer fix-live --project=acme --system=target --dry-run
yarn transfer fix-live --project=acme --system=target --live --yes
yarn transfer fix-live --project=acme --system=target --dry-run --table=ddb
```

| Flag | Meaning |
| --- | --- |
| `--project` | Project folder under `projects/` (its `config.ts` is loaded). |
| `--system` | `source` or `target` — the system whose records are modified. |
| `--dry-run` / `--live` | Mutually exclusive. `--live` exits 1 unless a dry run completed for the same project and system. |
| `--yes` | Skip the system confirm and the live-run confirm. |
| `--table` | `ddb` or `os`; default both. The v6 check always runs on the DDB table. |
| `--concurrency` | Scan segments in flight (default 4). Segment count comes from `pipeline.segments`. |

Exit codes: `0` success, `1` refused or failed (v5 table, missing dry run, unknown project, run error), `130` cancelled.

### Dry run before live

A live run is only allowed after a dry run completed for the same project and system. The dry run writes `.transfer/state/fix-live/<project>__<system>.json` with `lastDryRun { runId, at, changes, skips }`; a live run reads it, recomputes everything from scratch (data may have changed), warns when the change count differs, and records `lastLiveRun`. There is no expiry.

### Report

Every run writes `.transfer/<runId>/fix-live-report.jsonl`, one JSON line per change or skip:

```json
{"kind":"change","table":"ddb","pk":"T#root#CMS#CME#abc","sk":"L","reason":"missing-live","before":null,"after":{"version":2},"result":"dry-run"}
{"kind":"skip","table":"ddb","pk":"T#root#CMS#CME#def","sk":"REV#0007","reason":"revision-version-mismatch","detail":"P.version=7 REV#0007.version=6"}
```

`result` is `dry-run`, `written` or `condition-failed`. Change reasons: `missing-live`, `empty-live`, `wrong-version`, `stale-live`. Skip reasons: `no-latest-record`, `invalid-version`, `revision-record-missing`, `revision-version-mismatch`, `latest-status-contradicts-published`, `latest-status-contradicts-unpublished`, `decompress-failed`, `changed-during-run`. A skip means the whole entry was left untouched.

### What is and is not reconciled

- Reconciled: `data.live` on `L`, `P` and the published `REV#` of every CMS entry, in both tables. Only that attribute is written (`UpdateItem` with a path expression, conditioned on `_md` being unchanged since the read).
- Not reconciled: `live` on non-published `REV#` records (v6 itself leaves those stale), File Manager files (`fmFile`, `wbyFmFile` never carry `live`), anything that is not a CMS entry, and the OpenSearch index itself — the companion table is patched and v6's stream indexer picks the change up.
```

- [ ] **Step 2: `docs/guides/troubleshooting.md`**

Insert before `## Debugging`:

```markdown
### Published entries not showing as live after migration

Entries whose latest revision is a draft on top of an older published revision may have ended up with `live: {}` in the OpenSearch companion table. Run the reconciler against the migrated system — dry run first, then live:

```bash
yarn transfer fix-live --project=<name> --system=target --dry-run
yarn transfer fix-live --project=<name> --system=target --live
```

See [fix-live](commands.md#fix-live). Notes on the report:

- `changed-during-run` — an editor saved the record between read and write, so the conditional update was refused. Nothing was overwritten; re-run to pick it up.
- `latest-status-contradicts-published` / `latest-status-contradicts-unpublished` — the `L` record's `status` disagrees with the presence or version of `P`. The tool never guesses; inspect the entry in the admin UI and republish or unpublish it, then re-run.
- `revision-record-missing` / `revision-version-mismatch` — `P` points at a revision that does not exist or carries a different version. Same treatment: fix the entry, re-run.
```

- [ ] **Step 3: `docs/project-structure.md`**

Under `├── commands/` add (keeping the `transfer/` entry from Task 3):

```
│   ├── exitCodes.ts          # EXIT_OK / EXIT_FAILURE / EXIT_CANCELLED (130)
│   ├── cliContainer.ts       # Light DI container for the CLI shell (Prompts, UI, registry, commands)
│   ├── openMenu.ts           # `yarn transfer` with no args → select over registry.menu()
│   ├── dispatchDefault.ts    # `$0 [folder]` handler: <folder> → init, --config/--preset → transfer, else menu
│   ├── registry/             # Command token (Cli/Command) + CommandRegistry (lazy resolveAll)
│   ├── prompts/              # Prompts + UI abstractions; ClackPrompts / ClackUI / ClackSpinner (@clack/prompts)
│   ├── fixLive/              # FixLiveCommand + steps/ (selectProject, selectSystem, guardV6,
│   │                         # confirmSystem, selectMode, runTable, summarise) — function modules
```

and add `│   ├── XCommand.ts` mentions to `init/`, `initProject/`, `processSegment/`, `updateSkills/` lines ("`register.ts` replaced by a `Command` implementation; handlers unchanged"). Under `__tests__` note `__tests__/commands/prompts/StubPrompts.ts` / `StubUI.ts`.

- [ ] **Step 4: `AGENTS.md`**

§1 "Runtime flow", replace item 2 with:

```markdown
2. CLI: `yarn transfer` with no arguments opens a menu over the `Command` registry (`src/commands/registry/`) — entries: `transfer`, `fix-live`. `yarn transfer transfer` (or the legacy `yarn transfer --config … --preset …`) runs the system-to-system transfer: without `--config` the `TransferWizard` selects a project, writes `.env`, then on subsequent runs prompts for a preset and returns `WizardResult { configPath, preset, dryRun }`. `yarn transfer <folder>` still scaffolds (`init`). Prompts go through the `Prompts` / `UI` abstractions (`src/commands/prompts/`, `@clack/prompts`); commands never import a prompt library. Cancel exits 130.
```

§8 "Open work", append:

```markdown
5. **Inquirer removal** — `TransferWizard`, `init` and `initProject` still use `@inquirer/prompts`; migrate them to `Prompts` / `UI` and drop `@inquirer/*` from `package.json`.
6. **`fix-live` OS propagation** — confirm v6's DynamoDB stream handler treats a `data`-only change on the OS companion table as an index update (spec 2026-09-04, open question 1).
```

§3, after the first sentence, add: "CLI commands live in `src/commands/` as implementations of the `Command` token (`src/commands/registry/`); the entry `src/cli.ts` registers `registry.list()` with yargs plus a `$0 [folder]` default that preserves the two historical no-command invocations."

- [ ] **Step 5: `docs/hard-won-decisions.md`**

Append:

```markdown
- **`fix-live` reconciles only the v6-maintained invariant** (2026-09-04) — `L`, `P` and the published `REV#` carry `live: { version }`; other `REV#` records keep a best-effort copy that v6 itself leaves stale, so the reconciler never writes them. Fill missing, clear stale, correct wrong version — nothing else.
- **`fix-live` writes only when certain** (2026-09-04) — any ambiguity (status contradicts `P`, missing/mismatched revision record, decompress failure) is a `skipped` report line for the whole PK, never a partial write. A wrong "fix" is worse than no fix.
- **`fix-live` uses `UpdateItem` with a path expression, never `PutItem`** (2026-09-04) — the document client is built with `convertEmptyValues: true`; a whole-record round-trip would turn every `""` into `NULL` and re-encode numbers. `updateAttribute` leaves untouched attributes byte-identical.
- **`fix-live` scans `L` rows and `queryAll(PK)`s per entry** (2026-09-04) — no reliance on scan ordering or PK locality; one bounded query per entry removes the "group was incomplete" class of bugs.
- **`fix-live` conditions every write on `_md`** (2026-09-04) — `ConditionalCheckFailedException` → `changed-during-run` skip, never retried, never overwrites a fresher record.
- **CLI commands are `Command` implementations behind a lazy registry** (2026-09-04) — one `Cli/Command` token, many implementations; `CommandRegistry` calls `resolveAll` on first use. Command constructors take only `Prompts` / `UI`; the per-project container is built inside `run()`. `hidden: true` keeps a command out of the menu (positional-only commands, the `process-segment` worker) without removing it from `--help`. The `$0 [folder]` default command exists solely for `yarn transfer <folder>` and `yarn transfer --config --preset` compatibility — don't add new behaviour to it; add a command.
- **Prompt libraries stay behind `Prompts` / `UI`** (2026-09-04) — `select` / `confirm` / `text` return `null` on cancel and never exit; commands map `null` to exit 130. Tests use `StubPrompts` / `StubUI` with scripted answers. Only `Clack*.ts` import `@clack/prompts`.
```

Amend the `addLiveField cache+sentinel pattern` entry (skip if the transformer-fix plan already did): replace "The sentinel must be non-zero (versions start at 1) and truthy (so `if (cached)` correctly identifies a prior miss). Don't use `null` or `undefined` as the sentinel — those are cache misses." with "The cache check is `cached !== undefined` (`Cache.get` returns `T | undefined`), so the sentinel only has to be distinguishable from a real version; `undefined` is never cached because the transformer never produces it (`resolvePublishedVersion` accepts only positive integers)."

- [ ] **Step 6: Commit**

```bash
git add docs/guides/commands.md docs/guides/troubleshooting.md docs/project-structure.md AGENTS.md docs/hard-won-decisions.md
git commit -m "docs: command menu, fix-live guide, troubleshooting, agent guidance"
```

---

### Task 10: Changeset + full verification

**Files:**
- Create: `.changeset/guided-command-menu.md`
- All files from Tasks 1–9

**Interfaces:**
- Consumes: all prior tasks
- Produces: a `minor` release entry and a clean tree

- [ ] **Step 1: Changeset**

Create `.changeset/guided-command-menu.md`:

```markdown
---
"@webiny/data-transfer": minor
---

Add a command menu: `yarn transfer` with no arguments now lists available commands (`transfer`, `fix-live`) via `@clack/prompts`; `yarn transfer --config --preset` and `yarn transfer <folder>` behave as before. Add the `fix-live` command that reconciles the `live` field on CMS entries of an already migrated v6 system (DynamoDB table and OpenSearch companion table), with a mandatory dry run, a JSONL change report under `.transfer/<runId>/`, and non-interactive flags (`--project --system --dry-run|--live --yes --table --concurrency`). Prompts now go through `Prompts` / `UI` abstractions; cancelling any prompt exits 130.
```

- [ ] **Step 2: Run the full verification suite**

```bash
yarn npm audit && yarn format:fix && yarn ts-check && yarn test:coverage && yarn lint && yarn check:imports
```

Expected: no audit suggestions; formatter changes only whitespace (re-stage them); 0 type errors; all tests green with thresholds met; 0 lint errors; adio reports `@clack/prompts` as used and nothing missing.

- [ ] **Step 3: Manual smoke of the four entry paths**

```bash
yarn transfer --help
yarn transfer                                   # menu → Esc → echo $? prints 130
yarn transfer --config=./projects/v5-to-v6/config.ts --preset=copy-ddb --dry-run   # transfer path (needs .env)
yarn transfer fix-live --project=v5-to-v6 --system=target --live; echo $?          # 1 without a dry run
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: changeset for command menu and fix-live"
```
