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

const isProbeCandidate = (row: BaseRecord): boolean => isCmsEntry(row) && !isFmFile(row);

const isV6 = (row: BaseRecord): boolean =>
    typeof row.data === "object" && row.data !== null && !Array.isArray(row.data);

const isV5 = (row: BaseRecord): boolean =>
    row.data === undefined && typeof row.modelId === "string";

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
