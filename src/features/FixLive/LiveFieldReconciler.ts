import { LiveFieldReconciler as LiveFieldReconcilerAbstraction } from "./abstractions/LiveFieldReconciler.ts";

export type { ILiveFieldReconciler } from "./abstractions/LiveFieldReconciler.js";

const LATEST_SK = "L";
const PUBLISHED_SK = "P";
const PUBLISHED_STATUS = "published";

type SkipWithoutPk = Omit<LiveFieldReconcilerAbstraction.Skip, "pk">;

class LiveFieldReconcilerImpl implements LiveFieldReconcilerAbstraction.Interface {
    public decide(
        group: LiveFieldReconcilerAbstraction.Group
    ): LiveFieldReconcilerAbstraction.Decision {
        const latest = group.records.get(LATEST_SK);
        if (!latest) {
            return this.skip(group, { reason: "no-latest-record" });
        }
        const published = group.records.get(PUBLISHED_SK);
        if (!published) {
            return this.decideUnpublished(group, latest);
        }
        return this.decidePublished(group, latest, published);
    }

    private decideUnpublished(
        group: LiveFieldReconcilerAbstraction.Group,
        latest: LiveFieldReconcilerAbstraction.Record
    ): LiveFieldReconcilerAbstraction.Decision {
        if (latest.data.status === PUBLISHED_STATUS) {
            return this.skip(group, {
                sk: LATEST_SK,
                reason: "latest-status-contradicts-unpublished",
                detail: "P missing while L.status=published"
            });
        }
        return { changes: this.reconcile(group.pk, latest, null), skips: [] };
    }

    private decidePublished(
        group: LiveFieldReconcilerAbstraction.Group,
        latest: LiveFieldReconcilerAbstraction.Record,
        published: LiveFieldReconcilerAbstraction.Record
    ): LiveFieldReconcilerAbstraction.Decision {
        const version = published.data.version;
        if (!isPositiveInteger(version)) {
            return this.skip(group, {
                sk: PUBLISHED_SK,
                reason: "invalid-version",
                detail: `P.version=${String(version)}`
            });
        }

        const latestVersion = latest.data.version;
        const latestStatus = latest.data.status;
        if (latestStatus === PUBLISHED_STATUS && latestVersion !== version) {
            return this.skip(group, {
                sk: LATEST_SK,
                reason: "latest-status-contradicts-published",
                detail: `L.status=published L.version=${String(latestVersion)} P.version=${version}`
            });
        }
        if (latestVersion === version && latestStatus !== PUBLISHED_STATUS) {
            return this.skip(group, {
                sk: LATEST_SK,
                reason: "latest-status-contradicts-published",
                detail: `L.version=P.version=${version} but L.status=${String(latestStatus)}`
            });
        }

        const targets: LiveFieldReconcilerAbstraction.Record[] = [latest, published];
        if (group.table === "ddb") {
            const revisionSk = `REV#${padVersion(version)}`;
            const revision = group.records.get(revisionSk);
            if (!revision) {
                return this.skip(group, {
                    sk: revisionSk,
                    reason: "revision-record-missing",
                    detail: `P.version=${version}`
                });
            }
            if (revision.data.version !== version) {
                return this.skip(group, {
                    sk: revisionSk,
                    reason: "revision-version-mismatch",
                    detail: `P.version=${version} ${revisionSk}.version=${String(revision.data.version)}`
                });
            }
            targets.push(revision);
        }

        const expected: LiveFieldReconcilerAbstraction.LiveValue = { version };
        const changes = targets.flatMap(record => this.reconcile(group.pk, record, expected));
        return { changes, skips: [] };
    }

    private reconcile(
        pk: string,
        record: LiveFieldReconcilerAbstraction.Record,
        expected: LiveFieldReconcilerAbstraction.LiveValue | null
    ): LiveFieldReconcilerAbstraction.Change[] {
        const live = record.data.live;
        const base = { pk, sk: record.SK, before: live, expectedMd: record._md };

        if (expected === null) {
            if (live === undefined || live === null) {
                return [];
            }
            return [{ ...base, after: null, reason: "stale-live" }];
        }
        if (live === undefined || live === null) {
            return [{ ...base, after: expected, reason: "missing-live" }];
        }
        const current = readLiveVersion(live);
        if (current === null) {
            return [{ ...base, after: expected, reason: "empty-live" }];
        }
        if (current !== expected.version) {
            return [{ ...base, after: expected, reason: "wrong-version" }];
        }
        return [];
    }

    private skip(
        group: LiveFieldReconcilerAbstraction.Group,
        skip: SkipWithoutPk
    ): LiveFieldReconcilerAbstraction.Decision {
        return { changes: [], skips: [{ pk: group.pk, ...skip }] };
    }
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function padVersion(version: number): string {
    return String(version).padStart(4, "0");
}

function readLiveVersion(live: unknown): number | null {
    if (typeof live !== "object" || live === null) {
        return null;
    }
    const { version } = live as Record<string, unknown>;
    return isPositiveInteger(version) ? version : null;
}

export const LiveFieldReconciler = LiveFieldReconcilerAbstraction.createImplementation({
    implementation: LiveFieldReconcilerImpl,
    dependencies: []
});
