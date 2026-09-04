import { readFile } from "node:fs/promises";
import { webinyOutputSchema, normalizeOutputs } from "../schemas/webinyOutput.schema.ts";
import type { RawOutputValues } from "../types.ts";

export async function extractFromWebinyOutput(filePath: string): Promise<RawOutputValues> {
    let raw: string;
    try {
        raw = await readFile(filePath, "utf8");
    } catch (err) {
        throw new Error(
            `Cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`${filePath} is not valid JSON.`);
    }

    const result = webinyOutputSchema.safeParse(parsed);
    if (!result.success) {
        const first = result.error.issues[0]!;
        throw new Error(
            `${filePath} is missing required field: ${first.path.join(".")} — ${first.message}`
        );
    }

    return normalizeOutputs(result.data);
}
