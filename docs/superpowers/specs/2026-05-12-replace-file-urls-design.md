# Replace file URLs in CMS entries (`replaceFileUrls`)

**Date:** 2026-05-12
**Status:** Approved

## Problem

When transferring data between two Webiny environments (e.g. prod → dev), file URLs embedded in CMS entries remain pointing at the source environment. These appear in two field types:

- **`file` fields** — store a plain string URL, e.g. `"https://d2dwjqx9moweeo.cloudfront.net/files/abc123/image.png"`
- **`rich-text` fields** — store a JSON object with a `state` key (stringified lexical JSON) and an `html` key (HTML string); the URL appears verbatim in both the `src` attribute of `wby-image` nodes and in the rendered HTML

## Solution

Add an optional `fileUrls` field to `MigrationConfig`. Export a `replaceFileUrls(config)` transformer from the public API. If `config.fileUrls` is absent the transformer is a noop. If present, it walks all CMS entry fields via `visitFields()` and replaces every occurrence of the source URL with the target URL.

## Design

### Config schema — `shared.schema.ts`

Add an optional top-level field to the shared config schema:

```typescript
fileUrls: z.object({
    source: z.string().min(1),
    target: z.string().min(1),
}).optional()
```

Users read from `.env` in their `config.ts`:

```typescript
createConfig({
    fileUrls: {
        source: fromEnv("SOURCE_FILE_URL"),
        target: fromEnv("TARGET_FILE_URL"),
    },
    // ...
})
```

Both `source` and `target` must be non-empty strings when the field is present. Validation is Zod's — invalid values throw at `createConfig` time before any transfer runs.

### Transformer — `src/transformers/cms/replaceFileUrls.ts`

```typescript
export const replaceFileUrls = (config: MigrationConfig.Interface): Transformer.Interface => {
    if (!config.fileUrls) {
        return createDdbTransformer("replaceFileUrls", () => { /* noop */ });
    }

    const { source, target } = config.fileUrls;

    return createDdbTransformer("replaceFileUrls", async ctx => {
        const data = ctx.record.data;
        if (!data?.modelId || !data?.values) {
            return;
        }
        const model = ctx.modelProvider.getModel(data.modelId);
        if (!model) {
            return;
        }

        await visitFields(data.values, model.fields, (values, field, value) => {
            if (field.type === "file" && typeof value === "string") {
                values[field.storageId] = value.replaceAll(source, target);
                return;
            }

            if (field.type === "rich-text" && value && typeof value === "object") {
                const rt = value as { state?: string; html?: string };
                if (typeof rt.state === "string") {
                    rt.state = rt.state.replaceAll(source, target);
                }
                if (typeof rt.html === "string") {
                    rt.html = rt.html.replaceAll(source, target);
                }
            }
        });
    });
};
```

**Field handling:**

- `file` — value is a plain string; `replaceAll` returns the replaced string, assigned back to `values[field.storageId]`.
- `rich-text` — value is an object `{ state: string, html: string }`. The URL appears verbatim in both. `replaceAll` on the strings in-place (mutating the object properties directly, since `visitFields` passes values by reference). No lexical tree parsing needed — the URL is a literal substring in both representations.
- All other field types — skipped.

`visitFields` handles nested objects and dynamic zones recursively, so URLs embedded inside `object` fields or dynamic zone templates are reached automatically.

### Public API — `src/index.ts`

```typescript
export { replaceFileUrls } from "~/transformers/cms/replaceFileUrls.ts";
```

### Preset usage

In a preset, after `wrapInData` has run (so `record.data.values` is present):

```typescript
builder.use(replaceFileUrls(config))
```

If `config.fileUrls` is absent the call is harmless — the noop transformer adds no overhead. Users who never set `SOURCE_FILE_URL` / `TARGET_FILE_URL` see no change in behavior.

## Files changed

| File | Change |
|---|---|
| `src/features/MigrationConfig/schemas/shared.schema.ts` | Add optional `fileUrls` to config schema |
| `src/transformers/cms/replaceFileUrls.ts` | New transformer |
| `src/index.ts` | Export `replaceFileUrls` |
| `src/presets/v5-to-v6-ddb.ts` | Add `.use(replaceFileUrls(config))` to CMS entry pipelines |

## Trade-offs

- **`replaceAll` vs lexical tree walk** — `replaceAll` on the raw strings is simpler and change-resilient. A node-walk would be precise but fragile to lexical format evolution. Since the URL appears verbatim in both `state` and `html`, string replacement is correct and safe.
- **Source URL as prefix vs exact match** — `replaceAll` replaces every occurrence anywhere in the string. If the source URL appears as a substring inside a longer URL, it will still be replaced. This is the correct behavior for the CDN domain replacement case (`https://d2dwjqx9moweeo.cloudfront.net` → `https://d2new.cloudfront.net`).
- **Noop path** — Returning a named transformer even in the noop case keeps the transformer list consistent across runs (name appears in logs regardless of whether it does work). A zero-cost alternative would be to not register it at all, but that would require conditional `.use()` calls at the call site.
