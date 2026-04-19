import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "@webiny/di";
import { MockS3Client } from "../../services/S3Client/MockS3Client.ts";
import { TargetS3Client } from "~/services/S3Client/abstractions/S3Client.ts";
import { S3Copy } from "~/domain/transform/commands/S3Copy.ts";
import { S3CopyExecutorFeature } from "~/features/S3CopyExecutor/feature.ts";
import { S3CopyExecutor } from "~/features/S3CopyExecutor/abstractions/S3CopyExecutor.ts";

describe("S3CopyExecutor", () => {
    let container: Container;
    let client: MockS3Client;

    beforeEach(() => {
        container = new Container();
        client = new MockS3Client();
        container.registerInstance(TargetS3Client, client);
        S3CopyExecutorFeature.register(container);
    });

    it("is a no-op when given an empty array", async () => {
        const executor = container.resolve(S3CopyExecutor);
        const spy = vi.spyOn(client, "batchCopy");
        await executor.execute([]);
        expect(spy).not.toHaveBeenCalled();
    });

    it("maps S3Copy commands to batchCopy operations and delegates", async () => {
        const executor = container.resolve(S3CopyExecutor);
        const spy = vi.spyOn(client, "batchCopy").mockResolvedValue();

        await executor.execute([
            S3Copy.create({
                sourceBucket: "sb",
                sourceKey: "sk",
                targetBucket: "tb",
                targetKey: "tk"
            })
        ]);

        expect(spy).toHaveBeenCalledWith([
            { sourceBucket: "sb", sourceKey: "sk", targetBucket: "tb", targetKey: "tk" }
        ]);
    });
});
