import { describe, it, expect } from "vitest";
import {
    pulumiStateSchema,
    extractStackOutputs
} from "../../../../../src/commands/transfer/wizard/schemas/pulumiState.schema.ts";

const VALID_STATE = {
    version: 3 as const,
    checkpoint: {
        stack: "organization/core/dev",
        latest: {
            manifest: { time: "2026-01-01T00:00:00Z", magic: "abc", version: "v3.0.0" },
            resources: [
                {
                    urn: "urn:pulumi:dev::core::pulumi:pulumi:Stack::core-dev",
                    custom: false,
                    type: "pulumi:pulumi:Stack",
                    outputs: {
                        region: "eu-central-1",
                        primaryDynamodbTableName: "wby-primary",
                        fileManagerBucketId: "wby-bucket"
                    }
                }
            ]
        }
    }
};

describe("pulumiStateSchema", () => {
    it("accepts a valid Pulumi state file", () => {
        expect(pulumiStateSchema.safeParse(VALID_STATE).success).toBe(true);
    });

    it("rejects a state file with wrong version", () => {
        expect(pulumiStateSchema.safeParse({ ...VALID_STATE, version: 2 }).success).toBe(false);
    });

    it("rejects a state file missing checkpoint", () => {
        const { checkpoint: _c, ...rest } = VALID_STATE;
        expect(pulumiStateSchema.safeParse(rest).success).toBe(false);
    });
});

describe("extractStackOutputs", () => {
    it("returns outputs from the pulumi:pulumi:Stack resource", () => {
        const outputs = extractStackOutputs(VALID_STATE);
        expect(outputs).toEqual({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket"
        });
    });

    it("throws when no Stack resource is found", () => {
        const state = {
            ...VALID_STATE,
            checkpoint: {
                ...VALID_STATE.checkpoint,
                latest: {
                    ...VALID_STATE.checkpoint.latest,
                    resources: [{ type: "aws:s3:Bucket", outputs: {} }]
                }
            }
        };
        expect(() => extractStackOutputs(state)).toThrow(/pulumi:pulumi:Stack/);
    });

    it("throws when the Stack resource has no outputs", () => {
        const state = {
            ...VALID_STATE,
            checkpoint: {
                ...VALID_STATE.checkpoint,
                latest: {
                    ...VALID_STATE.checkpoint.latest,
                    resources: [{ type: "pulumi:pulumi:Stack", outputs: undefined }]
                }
            }
        };
        expect(() => extractStackOutputs(state)).toThrow(/outputs/);
    });
});
