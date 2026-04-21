import { createFeature } from "~/base/index.ts";
import { Logger } from "~/tools/Logger/abstractions/Logger.ts";
import { S3ClientImpl } from "./S3Client.ts";
import { SourceS3Client, TargetS3Client } from "./abstractions/S3Client.ts";
import { S3ClientConfig } from "./abstractions/S3ClientConfig.ts";

export const S3ClientFeature = createFeature({
    name: "Core/S3ClientFeature",
    register(container) {
        const config = container.resolve(S3ClientConfig);
        const logger = container.resolve(Logger);

        const sourceClient = new S3ClientImpl(config.source, logger, config.tuning);
        container.registerInstance(SourceS3Client, sourceClient);

        const targetClient = new S3ClientImpl(config.target, logger, config.tuning);
        container.registerInstance(TargetS3Client, targetClient);
    }
});
