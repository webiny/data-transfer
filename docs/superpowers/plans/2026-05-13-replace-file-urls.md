# Replace File URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `fileUrls` config field and a `replaceFileUrls(config)` transformer that replaces source CDN URLs with target CDN URLs in all `file` and `rich-text` CMS entry fields.

**Architecture:** The Zod schema gains an optional `fileUrls: { source, target }` top-level field. A new `replaceFileUrls(config)` factory returns a noop transformer when `config.fileUrls` is absent, or a transformer that walks every CMS entry field via `visitFields()` and replaces the source URL string with the target URL string. The transformer is exported from the public API and wired into the `cmsEntries` pipeline in `v5-to-v6-ddb`.

**Tech Stack:** TypeScript, Zod, `visitFields` field walker, `ctx.compressionHandler` for rich-text decompression/recompression.

---

## File map

| Action | File |
|--------|------|
| Modify | `src/features/MigrationConfig/schemas/unified.schema.ts` |
| Create | `src/transformers/cms/replaceFileUrls.ts` |
| Create | `__tests__/transformers/cms/replaceFileUrls.test.ts` |
| Modify | `src/index.ts` |
| Modify | `src/presets/v5-to-v6-ddb.ts` |

---

## Task 1: Add `fileUrls` to the unified config schema

**Files:**
- Modify: `src/features/MigrationConfig/schemas/unified.schema.ts`

- [ ] **Step 1: Add the `fileUrls` field to `unifiedTransferInputSchema`**

In `src/features/MigrationConfig/schemas/unified.schema.ts`, add the optional field to the schema object. The field must come after `debug` to keep the schema alphabetically grouped with other optional top-level keys:

```typescript
export const unifiedTransferInputSchema = z
    .object({
        source: sourceSchema,
        target: targetSchema,
        pipeline: pipelineSettingsSchema,
        tuning: tuningSchema,
        debug: debugSettingsSchema,
        fileUrls: z
            .object({
                source: trimmedString(),
                target: trimmedString()
            })
            .optional()
    })
    .superRefine(/* unchanged */);
```

`trimmedString()` is already imported from `./shared.schema.ts` — no new import needed.

- [ ] **Step 2: Run type-check to confirm no breakage**

```bash
yarn ts-check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/MigrationConfig/schemas/unified.schema.ts
git commit -m "feat: add fileUrls to unified config schema"
```

---

## Task 2: Write the `replaceFileUrls` transformer

**Files:**
- Create: `src/transformers/cms/replaceFileUrls.ts`
- Create: `__tests__/transformers/cms/replaceFileUrls.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/transformers/cms/replaceFileUrls.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { replaceFileUrls } from "~/transformers/cms/replaceFileUrls.ts";
import { makeFakeBaseContext } from "../fakeContext.ts";
import type { MigrationConfig } from "~/features/MigrationConfig/index.ts";

const SOURCE = "https://old.cdn.com";
const TARGET = "https://new.cdn.com";

function makeConfig(fileUrls?: { source: string; target: string }): MigrationConfig.Interface {
    return { fileUrls } as unknown as MigrationConfig.Interface;
}

function makeCompressionHandler() {
    return {
        compress: async (data: unknown) => ({
            compression: "gzip",
            value: JSON.stringify(data)
        }),
        decompress: async (compressed: unknown) =>
            JSON.parse((compressed as { value: string }).value)
    };
}

function makeModelProvider(fields: { id: string; fieldId: string; storageId: string; type: string; multipleValues?: boolean; settings?: unknown }[]) {
    return {
        getModel(_modelId: string) {
            return { modelId: "test", fields };
        }
    };
}

describe("replaceFileUrls", () => {
    it("is a noop when config.fileUrls is absent", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "page",
                    values: { "file@hero": `${SOURCE}/image.png` }
                }
            },
            { modelProvider: makeModelProvider([{ id: "hero", fieldId: "hero", storageId: "file@hero", type: "file" }]) }
        );

        await replaceFileUrls(makeConfig())(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<string, unknown>;
        expect(values["file@hero"]).toBe(`${SOURCE}/image.png`);
    });

    it("replaces URL in a single file field", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "page",
                    values: { "file@hero": `${SOURCE}/files/abc/photo.png` }
                }
            },
            { modelProvider: makeModelProvider([{ id: "hero", fieldId: "hero", storageId: "file@hero", type: "file" }]) }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<string, unknown>;
        expect(values["file@hero"]).toBe(`${TARGET}/files/abc/photo.png`);
    });

    it("replaces URLs in a multi-value file field (array of strings)", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "gallery",
                    values: {
                        "file@images": [
                            `${SOURCE}/files/a/img1.png`,
                            `${SOURCE}/files/b/img2.png`
                        ]
                    }
                }
            },
            {
                modelProvider: makeModelProvider([
                    { id: "images", fieldId: "images", storageId: "file@images", type: "file", multipleValues: true }
                ])
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<string, unknown>;
        expect(values["file@images"]).toEqual([
            `${TARGET}/files/a/img1.png`,
            `${TARGET}/files/b/img2.png`
        ]);
    });

    it("replaces URL inside compressed rich-text (state + html)", async () => {
        const compressionHandler = makeCompressionHandler();
        const rawRichText = {
            state: `{"root":{"children":[{"src":"${SOURCE}/files/abc/img.png","type":"wby-image"}]}}`,
            html: `<img src="${SOURCE}/files/abc/img.png">`
        };
        const compressed = await compressionHandler.compress(rawRichText);

        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "article",
                    values: { "rich-text@body": compressed }
                }
            },
            {
                modelProvider: makeModelProvider([
                    { id: "body", fieldId: "body", storageId: "rich-text@body", type: "rich-text" }
                ]),
                compressionHandler
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<string, unknown>;
        const decompressed = await compressionHandler.decompress(values["rich-text@body"]) as { state: string; html: string };
        expect(decompressed.state).toContain(`${TARGET}/files/abc/img.png`);
        expect(decompressed.html).toContain(`${TARGET}/files/abc/img.png`);
        expect(decompressed.state).not.toContain(SOURCE);
        expect(decompressed.html).not.toContain(SOURCE);
    });

    it("replaces URL in raw (uncompressed) rich-text { state, html }", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "article",
                    values: {
                        "rich-text@body": {
                            state: `{"src":"${SOURCE}/img.png"}`,
                            html: `<img src="${SOURCE}/img.png">`
                        }
                    }
                }
            },
            {
                modelProvider: makeModelProvider([
                    { id: "body", fieldId: "body", storageId: "rich-text@body", type: "rich-text" }
                ])
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<string, unknown>;
        const rt = values["rich-text@body"] as { state: string; html: string };
        expect(rt.state).toBe(`{"src":"${TARGET}/img.png"}`);
        expect(rt.html).toBe(`<img src="${TARGET}/img.png">`);
    });

    it("does not modify fields of other types", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "page",
                    values: { "text@title": `${SOURCE}/some/path` }
                }
            },
            { modelProvider: makeModelProvider([{ id: "title", fieldId: "title", storageId: "text@title", type: "text" }]) }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<string, unknown>;
        expect(values["text@title"]).toBe(`${SOURCE}/some/path`);
    });

    it("replaces URL in a file field nested inside an object field", async () => {
        const ctx = makeFakeBaseContext(
            {
                PK: "T#root#CMS#CME#abc",
                SK: "L",
                TYPE: "cms.entry.l",
                data: {
                    modelId: "hero",
                    values: {
                        "object@block": {
                            "file@image": `${SOURCE}/files/abc/img.png`
                        }
                    }
                }
            },
            {
                modelProvider: makeModelProvider([
                    {
                        id: "block",
                        fieldId: "block",
                        storageId: "object@block",
                        type: "object",
                        settings: {
                            fields: [
                                { id: "image", fieldId: "image", storageId: "file@image", type: "file" }
                            ]
                        }
                    }
                ])
            }
        );

        await replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx);

        const values = (ctx.record.data as Record<string, unknown>).values as Record<string, unknown>;
        const block = values["object@block"] as Record<string, unknown>;
        expect(block["file@image"]).toBe(`${TARGET}/files/abc/img.png`);
    });

    it("returns early when record has no data envelope", async () => {
        const ctx = makeFakeBaseContext(
            { PK: "T#root#CMS#CME#abc", SK: "L", TYPE: "cms.entry.l" },
            { modelProvider: { getModel: () => { throw new Error("should not be called"); } } }
        );

        await expect(replaceFileUrls(makeConfig({ source: SOURCE, target: TARGET }))(ctx)).resolves.toBeUndefined();
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
yarn test __tests__/transformers/cms/replaceFileUrls.test.ts
```

Expected: FAIL — `Cannot find module '~/transformers/cms/replaceFileUrls.ts'`

- [ ] **Step 3: Implement `replaceFileUrls`**

Create `src/transformers/cms/replaceFileUrls.ts`:

```typescript
import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { MigrationConfig } from "~/features/MigrationConfig/index.ts";
import { visitFields } from "./fieldVisitor.ts";

export function replaceFileUrls(
    config: MigrationConfig.Interface
) {
    if (!config.fileUrls) {
        return createTransformer<BaseTransformContext.Interface<BaseRecord>>(
            "replaceFileUrls",
            () => {}
        );
    }

    const { source, target } = config.fileUrls;

    return createTransformer<BaseTransformContext.Interface<BaseRecord>>(
        "replaceFileUrls",
        async ctx => {
            const data = ctx.record.data as Record<string, unknown> | undefined;
            if (!data) {
                return;
            }

            const modelId = data.modelId;
            if (!modelId) {
                return;
            }

            const model = ctx.modelProvider.getModel(modelId as string);
            if (!model) {
                return;
            }

            const values = data.values;
            if (!values || typeof values !== "object") {
                return;
            }

            await visitFields(
                values as Record<string, unknown>,
                model.fields,
                async (fieldValues, field, value) => {
                    if (field.type === "file") {
                        if (Array.isArray(value)) {
                            fieldValues[field.storageId] = (value as unknown[]).map(v =>
                                typeof v === "string" ? v.replaceAll(source, target) : v
                            );
                        } else if (typeof value === "string") {
                            fieldValues[field.storageId] = value.replaceAll(source, target);
                        }
                        return;
                    }

                    if (field.type === "rich-text" && value && typeof value === "object") {
                        if ("compression" in (value as object)) {
                            const decompressed = (await ctx.compressionHandler.decompress(value)) as {
                                state?: string;
                                html?: string;
                            };
                            if (typeof decompressed.state === "string") {
                                decompressed.state = decompressed.state.replaceAll(source, target);
                            }
                            if (typeof decompressed.html === "string") {
                                decompressed.html = decompressed.html.replaceAll(source, target);
                            }
                            fieldValues[field.storageId] = await ctx.compressionHandler.compress(decompressed);
                        } else {
                            const rt = value as { state?: string; html?: string };
                            if (typeof rt.state === "string") {
                                rt.state = rt.state.replaceAll(source, target);
                            }
                            if (typeof rt.html === "string") {
                                rt.html = rt.html.replaceAll(source, target);
                            }
                        }
                    }
                }
            );
        }
    );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
yarn test __tests__/transformers/cms/replaceFileUrls.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Run full suite and type-check**

```bash
yarn ts-check && yarn test:coverage
```

Expected: 0 type errors, all tests green, coverage thresholds met.

- [ ] **Step 6: Commit**

```bash
git add src/transformers/cms/replaceFileUrls.ts __tests__/transformers/cms/replaceFileUrls.test.ts
git commit -m "feat: add replaceFileUrls transformer"
```

---

## Task 3: Export from the public API

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the export**

In `src/index.ts`, find the `copyFileToTarget` export line (currently the only file-manager transformer exported):

```typescript
export { copyFileToTarget } from "./transformers/file-manager/copyFileToTarget.ts";
```

Add the new export immediately after it:

```typescript
export { copyFileToTarget } from "./transformers/file-manager/copyFileToTarget.ts";
export { replaceFileUrls } from "./transformers/cms/replaceFileUrls.ts";
```

- [ ] **Step 2: Run type-check**

```bash
yarn ts-check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: export replaceFileUrls from public API"
```

---

## Task 4: Wire into the `v5-to-v6-ddb` preset

**Files:**
- Modify: `src/presets/v5-to-v6-ddb.ts`

- [ ] **Step 1: Import `replaceFileUrls`**

In `src/presets/v5-to-v6-ddb.ts`, add to the existing transformer imports block:

```typescript
import {
    addGsiTenant,
    addLiveField,
    auditLogTransformers,
    cmsEntryTransformers,
    createMetadata,
    extractImageMetadata,
    groupsToRoles,
    migrateFileManagerSettings,
    migrateMailerSettings,
    removeAttributes,
    removeLocale,
    renameFieldAttributes,
    replaceFileUrls,
    transformModelGroup,
    transformPermissions,
    updateFlpIds,
    wrapInData
} from "~/transformers/index.ts";
```

- [ ] **Step 2: Add `replaceFileUrls` to the CMS entries pipeline**

Find the `cmsEntries` pipeline build (currently ends with `.use(addLiveField).build()`):

```typescript
const cmsEntries = factory
    .create({
        name: "CmsEntries",
        scanner: DdbScanner,
        processors: [DdbProcessor]
    })
    .filter(createFilter(isCmsEntry))
    .use(cmsEntryTransformers)
    .use(addLiveField)
    .use(replaceFileUrls(config))
    .build();
```

- [ ] **Step 3: Export `replaceFileUrls` from the transformers barrel**

Check `src/transformers/index.ts` — add `replaceFileUrls` to the cms exports if not already there. Find the cms transformer exports and add:

```typescript
export { replaceFileUrls } from "./cms/replaceFileUrls.ts";
```

- [ ] **Step 4: Run type-check and full test suite**

```bash
yarn ts-check && yarn test:coverage
```

Expected: 0 errors, all tests green.

- [ ] **Step 5: Run format check**

```bash
yarn format:fix
```

Expected: no changes (or only whitespace — commit any formatting changes).

- [ ] **Step 6: Commit**

```bash
git add src/presets/v5-to-v6-ddb.ts src/transformers/index.ts
git commit -m "feat: wire replaceFileUrls into v5-to-v6-ddb CmsEntries pipeline"
```

---

## Final verification

- [ ] **Run all checks**

```bash
yarn format:fix && yarn ts-check && yarn test:coverage && yarn lint && yarn check:imports
```

Expected: all clean.
