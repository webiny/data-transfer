# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server inside `@webiny/data-transfer` that serves documentation about all public API components (presets, transformers, processors, scanners, filters, config, pipeline runtime) so AI agents can help users write custom presets, transformers, and pipelines.

**Architecture:** Two MCP tools (`list_topics` / `get_topic`) serve markdown documentation files from `docs/mcp/`. Entry point at `src/mcp/server.ts`, bin entry `webiny-data-transfer-mcp`, stdio transport via `@modelcontextprotocol/sdk`. Documentation is organized by category (presets, transformers, processors, scanners, guides). All docs ship with the published npm package.

**Tech Stack:** `@modelcontextprotocol/sdk`, `zod` (already a dependency), `front-matter` for YAML front-matter parsing.

## Global Constraints

- MCP server lives inside the data-transfer package at `src/mcp/`
- All tools are read-only (annotations: `readOnlyHint: true`)
- Documentation files use YAML front-matter with `name`, `description`, `category` fields
- Transformer docs are small — name, one-line description, what it does, when to use it
- Existing `docs/guides/` are NOT moved — MCP docs are a separate set at `docs/mcp/`
- `docs/mcp/` MUST be included in the published npm package — `ArtifactCopier.copyAssets()` must copy it to `dist/docs/mcp/`
- Bin entry points to `./dist/mcp/bin.js` (compiled from `src/mcp/bin.ts` by tsc)
- `BuildOrchestrator.ensureShebang()` must handle `dist/mcp/bin.js` in addition to `dist/cli.js`
- Follow existing project patterns: ESM, no reflect-metadata imports, camelCase file names
- Transformers: all 27 are public exports from `@webiny/data-transfer`. Docs show import path for each.
- Filters: all 18 exported in public API (including `isAdminUser`). Docs cover all 18 exported filters.

---

### Task 1: MCP server skeleton + two tools

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/mcp/discoverDocs.ts`
- Create: `src/mcp/bin.ts`
- Modify: `package.json` (add bin entry, add `@modelcontextprotocol/sdk` + `front-matter` dependencies)
- Modify: `scripts/features/BuildPackages/ArtifactCopier.ts` (copy `docs/mcp/` to dist)
- Modify: `scripts/features/BuildPackages/BuildOrchestrator.ts` (add shebang to `dist/mcp/bin.js`)

**Interfaces:**
- Produces: `startMcpServer()` function, `discoverDocs(dirs: string[])` returning `Map<string, Doc>`, `buildCatalog(docs: Map<string, Doc>)` returning formatted markdown

- [ ] **Step 1: Install dependencies**

```bash
yarn add @modelcontextprotocol/sdk front-matter
```

- [ ] **Step 2: Create `src/mcp/discoverDocs.ts`**

Recursively finds all `.md` files in given directories, parses YAML front-matter (`name`, `description`, `category`), returns a `Map<string, Doc>`. First-match-wins for duplicate names.

```typescript
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import fm from "front-matter";

interface Doc {
    name: string;
    description: string;
    category: string;
    filePath: string;
    body: string;
}

function findMarkdownFiles(dir: string): string[] {
    const results: string[] = [];

    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);

        if (stat.isDirectory()) {
            results.push(...findMarkdownFiles(full));
        } else if (entry.endsWith(".md")) {
            results.push(full);
        }
    }

    return results;
}

function parseDoc(filePath: string): Doc | null {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = fm<{ name?: string; description?: string; category?: string }>(raw);

    if (!parsed.attributes.name || !parsed.attributes.description) {
        return null;
    }

    return {
        name: parsed.attributes.name,
        description: parsed.attributes.description,
        category: parsed.attributes.category ?? "general",
        filePath,
        body: parsed.body
    };
}

export function discoverDocs(dirs: string[]): Map<string, Doc> {
    const docs = new Map<string, Doc>();

    for (const dir of dirs) {
        for (const file of findMarkdownFiles(dir)) {
            const doc = parseDoc(file);
            if (doc && !docs.has(doc.name)) {
                docs.set(doc.name, doc);
            }
        }
    }

    return docs;
}

export function buildCatalog(docs: Map<string, Doc>): string {
    const byCategory = new Map<string, Doc[]>();

    for (const doc of docs.values()) {
        const list = byCategory.get(doc.category) ?? [];
        list.push(doc);
        byCategory.set(doc.category, list);
    }

    const lines: string[] = ["# Available Topics\n"];

    for (const [category, categoryDocs] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        lines.push(`## ${category}\n`);
        lines.push("| Topic | Description |");
        lines.push("|-------|-------------|");

        for (const doc of categoryDocs.sort((a, b) => a.name.localeCompare(b.name))) {
            lines.push(`| ${doc.name} | ${doc.description} |`);
        }

        lines.push("");
    }

    return lines.join("\n");
}

export type { Doc };
```

- [ ] **Step 3: Create `src/mcp/server.ts`**

Registers `list_topics` and `get_topic` tools, starts stdio transport. The `DEFAULT_DOCS_DIR` resolves relative to compiled output (`dist/docs/mcp` in production, `docs/mcp` in dev).

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverDocs, buildCatalog, type Doc } from "./discoverDocs.ts";

const DEFAULT_DOCS_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "../docs/mcp");

export async function startMcpServer(docsDirs?: string[]): Promise<void> {
    const dirs = docsDirs ?? [DEFAULT_DOCS_DIR];
    let docsCache: Map<string, Doc> | null = null;

    function getDocs(): Map<string, Doc> {
        if (!docsCache) {
            docsCache = discoverDocs(dirs);
        }
        return docsCache;
    }

    const server = new McpServer({ name: "webiny-data-transfer", version: "1.0.0" });

    server.registerTool(
        "list_topics",
        {
            title: "List Data Transfer Topics",
            description:
                "Returns a catalog of all available @webiny/data-transfer documentation topics. " +
                "Call this first to discover what topics are available, then use get_topic to read the full documentation for a specific topic. " +
                "Topics cover: presets, transformers, processors, scanners, filters, config, pipeline runtime, and how to write custom components.",
            inputSchema: {},
            annotations: { readOnlyHint: true }
        },
        async () => ({
            content: [{ type: "text" as const, text: buildCatalog(getDocs()) }]
        })
    );

    server.registerTool(
        "get_topic",
        {
            title: "Get Data Transfer Topic",
            description:
                "Returns the full documentation for a specific @webiny/data-transfer topic. " +
                "Use exact topic names from list_topics.",
            inputSchema: {
                topic: z.string().describe("Topic name — use exact names from list_topics")
            },
            annotations: { readOnlyHint: true }
        },
        async ({ topic }) => {
            const docs = getDocs();
            const doc = docs.get(topic);

            if (!doc) {
                const available = [...docs.keys()].sort().join(", ");
                return {
                    content: [{ type: "text" as const, text: `Topic "${topic}" not found. Available topics: ${available}` }]
                };
            }

            return {
                content: [{ type: "text" as const, text: doc.body }]
            };
        }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
```

- [ ] **Step 4: Create `src/mcp/bin.ts`**

```typescript
import { startMcpServer } from "./server.ts";

await startMcpServer();
```

- [ ] **Step 5: Add bin entry + dependencies to `package.json`**

Add to existing `bin` field:
```json
"bin": {
    "webiny-data-transfer": "./dist/cli.js",
    "webiny-data-transfer-mcp": "./dist/mcp/bin.js"
}
```

Add to `dependencies`:
```json
"@modelcontextprotocol/sdk": "^1.30.0",
"front-matter": "^4.0.2"
```

- [ ] **Step 6: Update `ArtifactCopier.copyAssets()` to copy `docs/mcp/`**

In `scripts/features/BuildPackages/ArtifactCopier.ts`, add `"docs/mcp"` to the asset directories copied to dist:

```typescript
public copyAssets(sourceDir: string, distAbsDir: string): void {
    for (const dir of ["templates", "projects", "docs/mcp"]) {
        const src = join(sourceDir, dir);
        if (existsSync(src)) {
            cpSync(src, join(distAbsDir, dir), { recursive: true });
        }
    }
}
```

- [ ] **Step 7: Update `BuildOrchestrator` to add shebang to MCP bin**

In `scripts/features/BuildPackages/BuildOrchestrator.ts`, extend the shebang logic to handle all bin entries (not just `cli.js`):

```typescript
for (const binPath of ["dist/cli.js", "dist/mcp/bin.js"]) {
    const fullPath = join(rootDir, binPath);
    if (!existsSync(fullPath)) {
        continue;
    }
    const content = readFileSync(fullPath, "utf-8");
    if (!content.startsWith("#!")) {
        writeFileSync(fullPath, "#!/usr/bin/env node\n" + content);
    }
}
```

- [ ] **Step 8: Create a test doc file and verify server starts**

Create `docs/mcp/test.md`:
```markdown
---
name: test-topic
description: Test topic for verifying MCP server
category: test
---

This is a test topic.
```

Run: `tsx src/mcp/bin.ts` — should start without errors (ctrl+c to exit).

- [ ] **Step 9: Commit**

```bash
git add src/mcp/ package.json yarn.lock docs/mcp/test.md scripts/features/BuildPackages/ArtifactCopier.ts scripts/features/BuildPackages/BuildOrchestrator.ts
git commit -m "feat: add MCP server skeleton with list_topics and get_topic tools"
```

---

### Task 2: Preset documentation (5 files)

**Files:**
- Create: `docs/mcp/presets/copy-ddb.md`
- Create: `docs/mcp/presets/copy-os.md`
- Create: `docs/mcp/presets/copy-files.md`
- Create: `docs/mcp/presets/v5-to-v6-ddb.md`
- Create: `docs/mcp/presets/v5-to-v6-os.md`

**Interfaces:**
- Consumes: reads preset source files in `src/presets/` for accuracy
- Produces: 5 markdown files with front-matter, each documenting one built-in preset

Each file follows this template:
```markdown
---
name: <preset-name>
description: <one-line summary>
category: Presets
---

# <Preset Name>

**Use when:** <when to pick this preset>

**What it does:**
<bullet list of operations>

**Pipelines registered:**
<list of pipelines with scanner/processor combos>

**Transformers applied:**
<list of transformers in pipeline order, or "None — pure copy">

**Example usage in a custom preset:**
<code snippet showing how to reference or extend this preset>
```

- [ ] **Step 1: Read each preset source file**

Read `src/presets/copy-ddb.ts`, `copy-os.ts`, `copy-files.ts`, `v5-to-v6-ddb.ts`, `v5-to-v6-os.ts` to understand exactly what each registers.

- [ ] **Step 2: Write all 5 preset doc files**

Follow the template above. Extract pipeline names, scanner/processor combos, and transformer chains from the source.

- [ ] **Step 3: Delete test doc file**

Remove `docs/mcp/test.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/mcp/presets/ && git rm docs/mcp/test.md
git commit -m "docs: add MCP documentation for all 5 built-in presets"
```

---

### Task 3: Processor and scanner documentation (6 files)

**Files:**
- Create: `docs/mcp/processors/ddbProcessor.md`
- Create: `docs/mcp/processors/osProcessor.md`
- Create: `docs/mcp/processors/s3Processor.md`
- Create: `docs/mcp/processors/auditLogProcessor.md`
- Create: `docs/mcp/scanners/ddbScanner.md`
- Create: `docs/mcp/scanners/osScanner.md`

**Interfaces:**
- Consumes: reads processor/scanner source files for accuracy
- Produces: 6 markdown files documenting processors and scanners

Each processor doc follows this template:
```markdown
---
name: <ProcessorName>
description: <one-line summary>
category: Processors
---

# <ProcessorName>

**Import:** `import { <Name> } from "@webiny/data-transfer";`

**What it does:** <description>

**Context slice it adds:** <what properties it adds to ctx>

**Commands it handles:** <PutRecord, DeleteRecord, etc.>

**`onEnd` hook behavior:** <what happens automatically after each pipeline>

**Usage in pipelineBuilderFactory.create():**
<code snippet>
```

Scanner docs follow a similar pattern with scan behavior, record shape, segment support.

- [ ] **Step 1: Read processor/scanner source files**

- [ ] **Step 2: Write all 6 doc files**

- [ ] **Step 3: Commit**

```bash
git add docs/mcp/processors/ docs/mcp/scanners/
git commit -m "docs: add MCP documentation for processors and scanners"
```

---

### Task 4: Transformer documentation (27 files)

**Files:**
- Create: `docs/mcp/transformers/<name>.md` for each of the 27 built-in transformers

**Interfaces:**
- Consumes: reads transformer source files for accuracy
- Produces: 27 small markdown files

All 27 transformers are public exports from `@webiny/data-transfer`.

Each transformer doc is intentionally small:
```markdown
---
name: <transformerName>
description: <one-line summary>
category: Transformers
---

# <transformerName>

**Import:** `import { <name> } from "@webiny/data-transfer";`

**Category:** <cms | security | global | file-manager | folders | mailer | auditLogs>

**What it does:** <2-3 sentences max>

**Record types it targets:** <PK pattern or entity type>

**Context type required:** `<BaseTransformContext | DdbCoreTransformContext | DdbTransformContext>`
```

The 27 transformers:
`addGsiTenant`, `addLiveField`, `addTransferTimestamp`, `copyFileToTarget`, `coreFieldsTransformer`, `createMetadata`, `dataFieldsTransformer`, `extractImageMetadata`, `fixBrokenStorageKeys`, `fixCmePk`, `groupsToRoles`, `migrateFileManagerSettings`, `migrateMailerSettings`, `removeAttributes`, `removeFolderRevision`, `removeLocale`, `removeTenant`, `renameFieldAttributes`, `replaceFileUrls`, `storageShapeTransformer`, `transformModelGroup`, `transformPermissions`, `transformRichText`, `updateFlpIds`, `updateModelIds`, `updateOsIndex`, `wrapInData`

- [ ] **Step 1: Read all transformer source files**

- [ ] **Step 2: Write all 27 doc files**

Batch by category (cms, security, global, file-manager, folders, mailer, auditLogs).

- [ ] **Step 3: Commit**

```bash
git add docs/mcp/transformers/
git commit -m "docs: add MCP documentation for all 27 built-in transformers"
```

---

### Task 5: Filter and pipeline guide documentation (4 files)

**Files:**
- Create: `docs/mcp/guides/filters.md`
- Create: `docs/mcp/guides/writingPresets.md`
- Create: `docs/mcp/guides/writingTransformers.md`
- Create: `docs/mcp/guides/configReference.md`

**Interfaces:**
- Consumes: existing `docs/guides/` files as source material, `src/domain/transform/filters.ts` for exact filter signatures
- Produces: 4 markdown files with front-matter

These are MCP-specific versions of the existing guides, optimized for AI agent consumption (more structured, more code examples, less prose). They cover:

1. **filters** — all 18 exported filter predicates (`byType`, `byTypePrefix`, `isCmsGroup`, `isCmsModel`, `isCmsEntry`, `byIncludesModelId`, `isAcoSearchRecord`, `isAdminUser`, `isBackgroundTask`, `isFmFile`, `isFlpRecord`, `isBuiltInSecurityRole`, `isSecurityTeam`, `isOsBackgroundTask`, `isOsMailerSettings`, `isAuditLogEntry`, `isMigrationRecord`, `isFormBuilderRecord`) with signatures and examples
2. **writingPresets** — how to write a custom preset from scratch, `createTransferPreset` shape, `pipelineBuilderFactory.create()`, `runner.register()`, filter/use/hook composition
3. **writingTransformers** — `createDdbTransformer`/`createOsTransformer`/`createTransformer` factories, context types, processor slices, working with `ctx.record`, `ctx.putRecord()`, `ctx.blackhole()`
4. **configReference** — `createConfig` shape, `fromEnv`/`numberFromEnv`, credentials (`fromAwsProfile`, `fromAwsCredentialChain`, literal), `register` callback, tuning, debug/snapshot

- [ ] **Step 1: Read existing guides and `filters.ts` for reference**

- [ ] **Step 2: Write all 4 doc files**

- [ ] **Step 3: Commit**

```bash
git add docs/mcp/guides/
git commit -m "docs: add MCP guide documentation for filters, presets, transformers, and config"
```

---

### Task 6: Pipeline runtime and public API docs (2 files)

**Files:**
- Create: `docs/mcp/guides/pipelineRuntime.md`
- Create: `docs/mcp/guides/publicApi.md`

**Interfaces:**
- Produces: 2 markdown files covering pipeline runtime semantics and full public API surface

1. **pipelineRuntime** — merge groups, first-match-wins dispatch, unmatched record drops, `onEnd` hooks, `flushEvery`, parallelism (segments/shards), hook ordering
2. **publicApi** — every export from `src/index.ts` with import path, type, one-line description. Organized by category (config, credentials, transformer factories, built-in transformers, filters, scanners, processors, service clients, context types, lifecycle hooks, customization). Mark which are values vs types.

- [ ] **Step 1: Write both doc files**

- [ ] **Step 2: Commit**

```bash
git add docs/mcp/guides/
git commit -m "docs: add MCP documentation for pipeline runtime and public API surface"
```

---

### Task 7: Integration — verify, run `yarn full`, final commit

**Files:**
- Possibly modify: `src/mcp/server.ts` (fix any issues found)
- Possibly modify: various doc files (fix any issues found)

- [ ] **Step 1: Verify MCP server discovers all docs**

```bash
tsx -e "
import { discoverDocs } from './src/mcp/discoverDocs.ts';
const docs = discoverDocs(['./docs/mcp']);
console.log('Total topics:', docs.size);
for (const [name, doc] of docs) {
  console.log('  ', doc.category, '/', name, '—', doc.description);
}
"
```

Expect: ~44 topics (5 presets + 27 transformers + 6 processors/scanners + 6 guides).

- [ ] **Step 2: Verify build includes MCP docs and bin**

```bash
yarn build
ls dist/mcp/bin.js          # must exist with shebang
ls dist/docs/mcp/            # must contain all doc files
head -1 dist/mcp/bin.js      # must start with #!/usr/bin/env node
```

- [ ] **Step 3: Run `yarn full`**

```bash
yarn full
```

Fix any format/lint/typecheck issues.

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "fix: address issues found during MCP integration verification"
```
