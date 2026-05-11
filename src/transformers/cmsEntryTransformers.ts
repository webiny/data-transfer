import {
    fixBrokenStorageKeys,
    fixCmePk,
    removeFolderRevision,
    transformLongText,
    transformRichText,
    updateModelIds,
    updateOsIndex
} from "./cms/index.ts";
import {
    wrapInData,
    addGsiTenant,
    removeLocale,
    removeAttributes,
    addTransferTimestamp
} from "./global/index.ts";

// Shared transformer stack for CMS-shaped records (cmsEntries + fmFiles).
// wrapInData MUST stay first — everything downstream assumes the record body
// is already moved under `data`. Changes to this list affect both pipelines;
// if one needs to diverge, pull it out of the shared array.
export const cmsEntryTransformers = [
    wrapInData,
    addGsiTenant,
    removeLocale,
    fixCmePk,
    fixBrokenStorageKeys,
    transformLongText,
    transformRichText,
    updateModelIds,
    removeFolderRevision,
    removeAttributes
];

// OS-mode transformer stack. `data` is already populated (decompressed by
// OsScanner), so wrapInData is omitted. updateOsIndex runs after updateModelIds
// so it sees the renamed modelId when computing the new index name.
export const osCmsEntryTransformers = [
    addGsiTenant,
    removeLocale,
    fixCmePk,
    fixBrokenStorageKeys,
    transformLongText,
    transformRichText,
    updateModelIds,
    updateOsIndex,
    removeFolderRevision,
    removeAttributes,
    addTransferTimestamp
];
