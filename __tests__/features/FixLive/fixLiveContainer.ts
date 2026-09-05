import { Container } from "@webiny/di";
import { CompressionFeature } from "@webiny/utils/features/compression/feature.js";
import { ContainerToken } from "~/base/index.js";
import { TransferContext } from "~/features/TransferLifecycle/abstractions/TransferContext.js";
import { LoggerFeature } from "~/tools/Logger/index.js";
import { DirectoryToolFeature } from "~/tools/DirectoryTool/index.js";
import { FileToolFeature } from "~/tools/FileTool/index.js";
import { OsRecordDecompressorFeature } from "~/features/OsRecordDecompressor/index.js";
import { FixLiveFeature } from "~/features/FixLive/index.js";

export interface FixLiveContainerOptions {
    runId?: string;
}

export function createFixLiveContainer(options: FixLiveContainerOptions = {}): Container {
    const container = new Container();
    container.registerInstance(ContainerToken, container);
    container.registerInstance(TransferContext, {
        runId: options.runId ?? "fix-live-test-run"
    });
    LoggerFeature.register(container, { logLevel: "error", json: false });
    CompressionFeature.register(container);
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);
    OsRecordDecompressorFeature.register(container);
    FixLiveFeature.register(container);
    return container;
}
