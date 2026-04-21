#!/usr/bin/env node
import { register } from "tsx/esm/api";
import { fileURLToPath } from "node:url";

// MUST stay a dynamic import. Static `import "./src/cli.ts"` hoists above
// the register() call (ESM module evaluation semantics), so the CLI's
// `~/...` path-alias imports fail to resolve before tsx is wired in.
// Manifests as "Cannot find package '~'" when bin.js is launched via
// plain `node` (e.g., worker processes spawned by `run/handler.ts`).
register({
    tsconfig: fileURLToPath(new URL("./tsconfig.json", import.meta.url))
});

await import("./src/cli.ts");
