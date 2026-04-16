import { createFeature } from "@/src/base/index.ts";
import { S3ClientImpl } from "./S3Client.ts";
import { SourceS3Client, TargetS3Client } from "./abstractions/S3Client.ts";
import { S3ClientConfig } from "./abstractions/S3ClientConfig.ts";

export const S3ClientFeature = createFeature({
    name: "Core/S3ClientFeature",
    register(container) {
        const config = container.resolve(S3ClientConfig);

        const sourceClient = new S3ClientImpl(config.source);
        container.registerInstance(SourceS3Client, sourceClient);

        const targetClient = new S3ClientImpl(config.target);
        container.registerInstance(TargetS3Client, targetClient);
    }
});
