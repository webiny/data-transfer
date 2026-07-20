import { Container } from "@webiny/di";
import { CompressionFeature } from "@webiny/utils/features/compression/feature.js";
import { CompressionHandler } from "@webiny/utils/exports/api.js";

const container = new Container();
CompressionFeature.register(container);

const compressionHandler = container.resolve(CompressionHandler);

// ============================================================================
// Types
// ============================================================================

export interface OsMockerOptions {
    /** Number of CMS entry records to generate (each gets L + P variants) */
    entries?: number;
    /** Number of FM file records to generate (L variant only) */
    files?: number;
    /** Number of page records to generate (L + P, PbPagesEs type — skipped by OS pipeline) */
    pages?: number;
    /** Tenant ID */
    tenant?: string;
    /** Locale */
    locale?: string;
    /** Model IDs to cycle through for CMS entries */
    modelIds?: string[];
}

interface GeneratedOsRecord {
    [key: string]: unknown;
    PK: string;
    SK: string;
    data: { compression: string; value: string };
    index: string;
    _ct: string;
    _et: string;
    _md: string;
}

// ============================================================================
// Inner record templates
// ============================================================================

function makeCmsEntryInner(opts: {
    entryId: string;
    modelId: string;
    tenant: string;
    locale: string;
    sk: "L" | "P";
    version: number;
}): Record<string, unknown> {
    const now = new Date().toISOString();
    const user = { id: "mock-user-id", displayName: "Mock User", type: "admin" };
    const type = opts.sk === "L" ? "cms.entry.l" : "cms.entry.p";

    return {
        modelId: opts.modelId,
        entryId: opts.entryId,
        id: `${opts.entryId}#000${opts.version}`,
        version: opts.version,
        status: opts.sk === "P" ? "published" : "draft",
        locked: opts.sk === "P",
        tenant: opts.tenant,
        locale: opts.locale,
        createdOn: now,
        savedOn: now,
        modifiedOn: now,
        createdBy: user,
        savedBy: user,
        modifiedBy: user,
        firstPublishedOn: opts.sk === "P" ? now : null,
        lastPublishedOn: opts.sk === "P" ? now : null,
        firstPublishedBy: opts.sk === "P" ? user : null,
        lastPublishedBy: opts.sk === "P" ? user : null,
        revisionCreatedOn: now,
        revisionSavedOn: now,
        revisionModifiedOn: now,
        revisionCreatedBy: user,
        revisionSavedBy: user,
        revisionModifiedBy: user,
        revisionFirstPublishedOn: opts.sk === "P" ? now : null,
        revisionLastPublishedOn: opts.sk === "P" ? now : null,
        revisionFirstPublishedBy: opts.sk === "P" ? user : null,
        revisionLastPublishedBy: opts.sk === "P" ? user : null,
        location: { folderId: "root" },
        webinyVersion: "5.44.0",
        values: {
            [`text@field_${opts.modelId}_1`]: `Value for ${opts.modelId} ${opts.entryId}`,
            [`long-text@field_${opts.modelId}_2`]: `Description for ${opts.modelId}`
        },
        rawValues: {},
        meta: {},
        latest: opts.sk === "L",
        ...(opts.sk === "P" && { published: true }),
        TYPE: type,
        __type: type
    };
}

function makeFmFileInner(opts: {
    entryId: string;
    tenant: string;
    locale: string;
    fileName: string;
}): Record<string, unknown> {
    const now = new Date().toISOString();
    const user = { id: "mock-user-id", displayName: "Mock User", type: "admin" };

    return {
        modelId: "fmFile",
        entryId: opts.entryId,
        id: `${opts.entryId}#0001`,
        version: 1,
        status: "draft",
        locked: false,
        tenant: opts.tenant,
        locale: opts.locale,
        createdOn: now,
        savedOn: now,
        modifiedOn: null,
        createdBy: user,
        savedBy: user,
        modifiedBy: null,
        firstPublishedOn: null,
        lastPublishedOn: null,
        firstPublishedBy: null,
        lastPublishedBy: null,
        revisionCreatedOn: now,
        revisionSavedOn: now,
        revisionModifiedOn: null,
        revisionCreatedBy: user,
        revisionSavedBy: user,
        revisionModifiedBy: null,
        revisionFirstPublishedOn: null,
        revisionLastPublishedOn: null,
        revisionFirstPublishedBy: null,
        revisionLastPublishedBy: null,
        location: { folderId: "root" },
        webinyVersion: "5.44.0",
        values: {
            "object@location": { "text@folderId": "root" },
            "text@name": opts.fileName,
            "text@key": `${opts.entryId}/${opts.fileName}`,
            "text@type": "image/jpeg",
            "number@size": 1024 + Math.floor(Math.random() * 100000),
            "object@meta": { "boolean@private": false },
            "text@tags": [],
            "text@aliases": []
        },
        rawValues: {
            "object@location": {},
            "object@meta": {}
        },
        latest: true,
        TYPE: "cms.entry.l",
        __type: "cms.entry.l"
    };
}

// ============================================================================
// Mocker
// ============================================================================

function generateId(): string {
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/**
 * Generate mock OS DynamoDB table records.
 *
 * @example
 * // Generate 100 CMS entries (200 records: L + P each) + 10 files + 5 pages
 * const records = await generateOsRecords({ entries: 100, files: 10, pages: 5 });
 */
export async function generateOsRecords(
    options: OsMockerOptions = {}
): Promise<GeneratedOsRecord[]> {
    const {
        entries = 10,
        files = 0,
        pages = 0,
        tenant = "root",
        locale = "en-US",
        modelIds = ["category", "article", "author"]
    } = options;

    const records: GeneratedOsRecord[] = [];
    const localeLower = locale.toLowerCase().replace("_", "-");

    // CMS entries — each generates L + P
    for (let i = 0; i < entries; i++) {
        const entryId = generateId();
        const modelId = modelIds[i % modelIds.length]!;
        const pk = `T#${tenant}#L#${locale}#CMS#CME#${entryId}`;
        const index = `${tenant}-headless-cms-${localeLower}-${modelId}`;
        const now = new Date().toISOString();

        for (const sk of ["L", "P"] as const) {
            const inner = makeCmsEntryInner({ entryId, modelId, tenant, locale, sk, version: 1 });
            const compressed = await compressionHandler.compress(inner);

            records.push({
                PK: pk,
                SK: sk,
                data: compressed,
                index,
                _ct: now,
                _et: "CmsEntriesElasticsearch",
                _md: now
            });
        }
    }

    // FM files — L variant only
    for (let i = 0; i < files; i++) {
        const entryId = generateId();
        const pk = `T#${tenant}#L#${locale}#CMS#CME#${entryId}`;
        const index = `${tenant}-headless-cms-${localeLower}-fmfile`;
        const now = new Date().toISOString();
        const fileName = `file-${i + 1}.jpeg`;

        const inner = makeFmFileInner({ entryId, tenant, locale, fileName });
        const compressed = await compressionHandler.compress(inner);

        records.push({
            PK: pk,
            SK: "L",
            data: compressed,
            index,
            _ct: now,
            _et: "CmsEntriesElasticsearch",
            _md: now
        });
    }

    // Pages — PbPagesEs type (skipped by OS pipeline)
    for (let i = 0; i < pages; i++) {
        const pageId = generateId();
        const pk = `T#${tenant}#L#${locale}#PB#P#${pageId}`;
        const index = `${tenant}-${localeLower}-page-builder`;
        const now = new Date().toISOString();

        for (const sk of ["L", "P"] as const) {
            records.push({
                PK: pk,
                SK: sk,
                data: {
                    category: "static",
                    createdBy: { displayName: "Mock User", id: "mock-user-id", type: "admin" },
                    createdOn: now,
                    editor: "page-builder",
                    id: `${pageId}#0001`,
                    images: {},
                    locale,
                    locked: sk === "P",
                    ownedBy: { displayName: "Mock User", id: "mock-user-id", type: "admin" },
                    path: `/mock-page-${i + 1}`,
                    pid: pageId,
                    ...(sk === "P" && { published: true }),
                    ...(sk === "L" && { latest: true }),
                    publishedOn: now,
                    savedOn: now,
                    snippet: null,
                    status: "published",
                    tags: [],
                    tenant,
                    title: `Mock Page ${i + 1}`,
                    titleLC: `mock page ${i + 1}`,
                    version: 1,
                    webinyVersion: "5.44.0",
                    __type: "page"
                } as any,
                index,
                _ct: now,
                _et: "PbPagesEs",
                _md: now
            });
        }
    }

    return records;
}
