import { describe, expect, it, vi } from "vitest";
import { Container } from "@webiny/di";
import { ContainerToken } from "~/base/index.ts";
import { PipelineRunner } from "~/features/PipelineRunner/index.ts";
import { AccessChecker, AccessCheckerFeature } from "~/features/AccessChecker/index.ts";

function makeRunner(
    processors: Array<{
        checkAccess(): Promise<{ label: string; status: string }[]>;
        execute(): Promise<void>;
    }>
): PipelineRunner.Interface {
    return {
        register: vi.fn(),
        run: vi.fn(),
        getProcessors: vi.fn().mockReturnValue(processors),
        getShardStats: vi.fn().mockReturnValue(null)
    } as unknown as PipelineRunner.Interface;
}

describe("AccessChecker", () => {
    it("returns a flat report from all processor checkAccess results", async () => {
        const p1 = {
            checkAccess: vi.fn().mockResolvedValue([{ label: "DynamoDB source", status: "ok" }]),
            execute: vi.fn()
        };
        const p2 = {
            checkAccess: vi.fn().mockResolvedValue([
                { label: "S3 source bucket: sb", status: "ok" },
                { label: "S3 target bucket: tb", status: "denied" }
            ]),
            execute: vi.fn()
        };

        const container = new Container();
        container.registerInstance(ContainerToken, container);
        container.registerInstance(PipelineRunner, makeRunner([p1, p2]));
        AccessCheckerFeature.register(container);

        const checker = container.resolve(AccessChecker);
        const report = await checker.run();

        expect(report).toHaveLength(3);
        expect(report[0]).toEqual({ label: "DynamoDB source", status: "ok" });
        expect(report[1]).toEqual({ label: "S3 source bucket: sb", status: "ok" });
        expect(report[2]).toEqual({ label: "S3 target bucket: tb", status: "denied" });
    });

    it("returns empty report when no processors are registered", async () => {
        const container = new Container();
        container.registerInstance(ContainerToken, container);
        container.registerInstance(PipelineRunner, makeRunner([]));
        AccessCheckerFeature.register(container);

        const checker = container.resolve(AccessChecker);
        const report = await checker.run();

        expect(report).toHaveLength(0);
    });

    it("returns empty report when all processors return empty arrays", async () => {
        const p = {
            checkAccess: vi.fn().mockResolvedValue([]),
            execute: vi.fn()
        };
        const container = new Container();
        container.registerInstance(ContainerToken, container);
        container.registerInstance(PipelineRunner, makeRunner([p]));
        AccessCheckerFeature.register(container);

        const checker = container.resolve(AccessChecker);
        const report = await checker.run();

        expect(report).toHaveLength(0);
    });
});
