// Side-effect module: silences Node deprecation warnings we can't fix from
// this project's side (third-party @webiny/lexical-* packages miss the
// "main" / "exports" fields in package.json and trigger DEP0151). MUST be
// imported FIRST in any entrypoint so the listener is in place before
// the offending packages load.
//
// For workers spawned by `run/handler.ts` (via execa + plain `node`),
// the current-process listener doesn't help the child — so we also append
// --disable-warning=DEP0151 to NODE_OPTIONS; execa inherits the env and
// the flag takes effect at child process startup.
const SUPPRESSED_CODES = new Set(["DEP0151"]);
process.removeAllListeners("warning");
process.on("warning", warning => {
  if (warning.code && SUPPRESSED_CODES.has(warning.code)) {
    return;
  }
  const code = warning.code ? `[${warning.code}] ` : "";
  process.stderr.write(`(node:${process.pid}) ${code}${warning.name}: ${warning.message}\n`);
  if (warning.stack) {
    process.stderr.write(`${warning.stack}\n`);
  }
});
const CHILD_FLAG = "--disable-warning=DEP0151";
const existing = process.env.NODE_OPTIONS ?? "";
if (!existing.includes(CHILD_FLAG)) {
  process.env.NODE_OPTIONS = existing.length > 0 ? `${existing} ${CHILD_FLAG}` : CHILD_FLAG;
}
export {};
//# sourceMappingURL=suppressDeprecations.js.map
