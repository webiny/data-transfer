import { readFile } from "node:fs/promises";
import { pulumiStateSchema, extractStackOutputs } from "../schemas/pulumiState.schema.js";
import { webinyOutputSchema, normalizeOutputs } from "../schemas/webinyOutput.schema.js";
export async function extractFromPulumiState(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    throw new Error(`Cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${filePath} is not valid JSON.`);
  }
  const stateResult = pulumiStateSchema.safeParse(parsed);
  if (!stateResult.success) {
    const first = stateResult.error.issues[0];
    throw new Error(
      `${filePath} is not a valid Pulumi state file: ${first.path.join(".")} — ${first.message}`
    );
  }
  const outputs = extractStackOutputs(stateResult.data);
  const outputResult = webinyOutputSchema.safeParse(outputs);
  if (!outputResult.success) {
    const first = outputResult.error.issues[0];
    throw new Error(
      `Stack outputs in ${filePath} are missing required field: ${first.path.join(".")} — ${first.message}`
    );
  }
  return normalizeOutputs(outputResult.data);
}
//# sourceMappingURL=PulumiStateSource.js.map
