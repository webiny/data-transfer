import { describe, it, expect } from "vitest";
import {
    webinyOutputSchema,
    normalizeOutputs
} from "../../../../../src/commands/run/wizard/schemas/webinyOutput.schema.ts";

describe("webinyOutputSchema", () => {
    it("accepts a valid output with elasticsearch prefix", () => {
        const result = webinyOutputSchema.safeParse({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            elasticsearchDynamodbTableName: "wby-es",
            elasticsearchDomainEndpoint: "search-xxx.eu-central-1.es.amazonaws.com"
        });
        expect(result.success).toBe(true);
    });

    it("accepts a valid output with opensearch prefix", () => {
        const result = webinyOutputSchema.safeParse({
            region: "us-east-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            opensearchDynamodbTableName: "wby-os",
            opensearchDomainEndpoint: "search-xxx.us-east-1.es.amazonaws.com"
        });
        expect(result.success).toBe(true);
    });

    it("accepts a DDB-only output (no OS fields)", () => {
        const result = webinyOutputSchema.safeParse({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket"
        });
        expect(result.success).toBe(true);
    });

    it("rejects output missing region", () => {
        const result = webinyOutputSchema.safeParse({
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket"
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].path).toContain("region");
        }
    });

    it("rejects output missing primaryDynamodbTableName", () => {
        const result = webinyOutputSchema.safeParse({
            region: "eu-central-1",
            fileManagerBucketId: "wby-bucket"
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].path).toContain("primaryDynamodbTableName");
        }
    });

    it("ignores unknown fields (passthrough)", () => {
        const result = webinyOutputSchema.safeParse({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            cognitoAppClientId: "abc123",
            deploymentId: "xyz"
        });
        expect(result.success).toBe(true);
    });
});

describe("normalizeOutputs", () => {
    it("prefers opensearch prefix over elasticsearch when both present", () => {
        const result = normalizeOutputs({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            opensearchDynamodbTableName: "wby-os",
            opensearchDomainEndpoint: "search-os.eu-central-1.es.amazonaws.com",
            elasticsearchDynamodbTableName: "wby-es",
            elasticsearchDomainEndpoint: "search-es.eu-central-1.es.amazonaws.com"
        });
        expect(result.region).toBe("eu-central-1");
        expect(result.primaryDynamodbTableName).toBe("wby-primary");
        expect(result.fileManagerBucketId).toBe("wby-bucket");
        expect(result.osTableName).toBe("wby-os");
        expect(result.osEndpoint).toBe("search-os.eu-central-1.es.amazonaws.com");
    });

    it("falls back to elasticsearch prefix when opensearch absent", () => {
        const result = normalizeOutputs({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket",
            elasticsearchDynamodbTableName: "wby-es",
            elasticsearchDomainEndpoint: "search-es.eu-central-1.es.amazonaws.com"
        });
        expect(result.osTableName).toBe("wby-es");
        expect(result.osEndpoint).toBe("search-es.eu-central-1.es.amazonaws.com");
    });

    it("returns empty strings for OS fields when neither prefix present", () => {
        const result = normalizeOutputs({
            region: "eu-central-1",
            primaryDynamodbTableName: "wby-primary",
            fileManagerBucketId: "wby-bucket"
        });
        expect(result.osTableName).toBe("");
        expect(result.osEndpoint).toBe("");
    });
});
